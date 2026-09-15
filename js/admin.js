// עמוד ניהול: עריכה מקומית בדפדפן (localStorage), ייצוא/ייבוא JSON, ושמירה ישירה ל-GitHub דרך ה-API

const DRAFT_KEY = 'fmm_draft_matches';
const TOKEN_KEY = 'fmm_github_token';
const GITHUB_OWNER = 'dzarhi';
const GITHUB_REPO = 'FootballMatchdayManager';
const GITHUB_BRANCH = 'main';
const GITHUB_PATH = 'data/matches.json';
let matches = [];

document.addEventListener('DOMContentLoaded', async () => {
  const draft = localStorage.getItem(DRAFT_KEY);
  if (draft) {
    try {
      matches = JSON.parse(draft).map(migrateLegacyResult);
      setStatus('נטענה טיוטה שנשמרה בדפדפן שלך.');
    } catch {
      matches = [];
    }
  } else {
    try {
      matches = (await loadMatches()).map(migrateLegacyResult);
    } catch {
      matches = [];
    }
  }
  render();
  updateGithubUI();

  document.getElementById('add-row-btn').addEventListener('click', () => {
    matches.push(emptyMatch());
    saveDraft();
    render();
  });

  document.getElementById('load-current-btn').addEventListener('click', async () => {
    try {
      matches = (await loadMatches()).map(migrateLegacyResult);
      saveDraft();
      render();
      setStatus('נטען קובץ הנתונים הנוכחי מהאתר.');
    } catch {
      setStatus('שגיאה בטעינת הקובץ.', true);
    }
  });

  document.getElementById('reset-btn').addEventListener('click', () => {
    if (!confirm('לאפס את הטיוטה ולמחוק שינויים שלא הורדת?')) return;
    localStorage.removeItem(DRAFT_KEY);
    location.reload();
  });

  document.getElementById('download-btn').addEventListener('click', downloadJson);
  document.getElementById('save-github-btn').addEventListener('click', saveToGithub);

  document.getElementById('gh-token-save').addEventListener('click', () => {
    const input = document.getElementById('gh-token-input');
    const token = input.value.trim();
    if (!token) return;
    localStorage.setItem(TOKEN_KEY, token);
    input.value = '';
    updateGithubUI();
    setStatus('הטוקן חובר ונשמר בדפדפן הזה בלבד.');
  });

  document.getElementById('gh-token-clear').addEventListener('click', () => {
    if (!confirm('להתנתק ולמחוק את הטוקן השמור בדפדפן?')) return;
    localStorage.removeItem(TOKEN_KEY);
    updateGithubUI();
  });

  document.getElementById('import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed)) throw new Error('פורמט לא תקין');
      matches = parsed.map(migrateLegacyResult);
      saveDraft();
      render();
      setStatus('קובץ יובא בהצלחה.');
    } catch {
      setStatus('שגיאה בייבוא הקובץ - ודאו שזהו קובץ JSON תקין.', true);
    }
    e.target.value = '';
  });
});

function updateGithubUI() {
  const connected = !!localStorage.getItem(TOKEN_KEY);
  document.getElementById('gh-disconnected-view').classList.toggle('hidden', connected);
  document.getElementById('gh-connected-view').classList.toggle('hidden', !connected);
  document.getElementById('save-github-btn').disabled = !connected;
}

function hasInvalidMatch() {
  return matches.some(m => !m.opponent || !m.date || !m.venueName || !m.address);
}

function sortedMatchesJson() {
  const sorted = [...matches].sort((a, b) => a.date.localeCompare(b.date));
  return JSON.stringify(sorted, null, 2);
}

function base64EncodeUnicode(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  bytes.forEach(b => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

async function saveToGithub() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    setStatus('חברו קודם טוקן GitHub.', true);
    return;
  }
  if (hasInvalidMatch() && !confirm('יש משחקים עם שדות חסרים (יריבה/תאריך/מגרש/כתובת). לשמור בכל זאת?')) {
    return;
  }

  const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_PATH}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json'
  };

  setStatus('שומר ל-GitHub...');
  try {
    const getRes = await fetch(`${apiUrl}?ref=${GITHUB_BRANCH}`, { headers });
    if (!getRes.ok) throw new Error('לא ניתן לקרוא את הקובץ מ-GitHub - בדקו שהטוקן תקין ומוגבל ל-repo הנכון.');
    const current = await getRes.json();

    const putRes = await fetch(apiUrl, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'עדכון משחקים דרך עמוד הניהול',
        content: base64EncodeUnicode(sortedMatchesJson()),
        sha: current.sha,
        branch: GITHUB_BRANCH
      })
    });

    if (!putRes.ok) {
      const err = await putRes.json().catch(() => ({}));
      throw new Error(err.message || 'שגיאה בשמירה ל-GitHub.');
    }

    setStatus('נשמר בהצלחה ל-GitHub! השינוי יופיע באתר החי תוך דקה-שתיים.');
  } catch (err) {
    setStatus(err.message || 'שגיאה בשמירה ל-GitHub.', true);
  }
}


function emptyMatch() {
  return {
    id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random())),
    opponent: '',
    homeAway: 'home',
    matchType: 'league',
    date: '',
    homeGoals: '',
    awayGoals: '',
    venueName: '',
    address: '',
    notes: ''
  };
}

// ממיר רשומות ישנות שנשמרו עם שדה result יחיד (בפורמט "הקבוצה שלנו:היריבה") לשני שדות נפרדים
function migrateLegacyResult(m) {
  if (m.homeGoals !== undefined || m.awayGoals !== undefined || !m.result) return m;
  const parts = String(m.result).split(/[:\-]/).map(s => s.trim());
  if (parts.length === 2 && parts.every(p => p !== '' && !isNaN(Number(p)))) {
    const [ours, theirs] = parts.map(Number);
    if (m.homeAway === 'away') {
      m.homeGoals = theirs;
      m.awayGoals = ours;
    } else {
      m.homeGoals = ours;
      m.awayGoals = theirs;
    }
  } else {
    m.homeGoals = '';
    m.awayGoals = '';
  }
  delete m.result;
  return m;
}

function render() {
  const tbody = document.getElementById('matches-tbody');
  tbody.innerHTML = '';
  matches.forEach((m, idx) => tbody.appendChild(createRow(m, idx)));
}

function createRow(m, idx) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td data-label="יריבה"><input type="text" data-field="opponent" value="${attr(m.opponent)}" placeholder="שם היריבה"></td>
    <td data-label="סוג משחק">
      <select data-field="matchType">
        <option value="league" ${m.matchType === 'league' ? 'selected' : ''}>ליגה</option>
        <option value="cup" ${m.matchType === 'cup' ? 'selected' : ''}>גביע</option>
        <option value="training" ${m.matchType === 'training' ? 'selected' : ''}>אימון</option>
      </select>
    </td>
    <td data-label="בית/חוץ">
      <select data-field="homeAway">
        <option value="home" ${m.homeAway === 'home' ? 'selected' : ''}>בית</option>
        <option value="away" ${m.homeAway === 'away' ? 'selected' : ''}>חוץ</option>
      </select>
    </td>
    <td data-label="תאריך"><input type="date" data-field="date" value="${attr(m.date)}"></td>
    <td data-label="גולי מארחת"><input type="number" min="0" data-field="homeGoals" value="${attr(m.homeGoals)}" placeholder="-"></td>
    <td data-label="גולי אורחת"><input type="number" min="0" data-field="awayGoals" value="${attr(m.awayGoals)}" placeholder="-"></td>
    <td data-label="מגרש"><input type="text" data-field="venueName" value="${attr(m.venueName)}" placeholder="שם המגרש"></td>
    <td data-label="כתובת (לניווט בוויז)"><input type="text" data-field="address" value="${attr(m.address)}" placeholder="כתובת מדויקת"></td>
    <td data-label="הערות"><input type="text" data-field="notes" value="${attr(m.notes)}" placeholder="הערה (אופציונלי)"></td>
    <td><button type="button" class="btn btn-danger" data-action="delete">מחק</button></td>
  `;

  tr.querySelectorAll('input, select').forEach(el => {
    el.addEventListener('input', () => {
      matches[idx][el.dataset.field] = el.value;
      saveDraft();
    });
  });

  tr.querySelector('[data-action="delete"]').addEventListener('click', () => {
    if (!confirm('למחוק את המשחק?')) return;
    matches.splice(idx, 1);
    saveDraft();
    render();
  });

  return tr;
}

function attr(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML.replace(/"/g, '&quot;');
}

function saveDraft() {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(matches));
}

function downloadJson() {
  if (hasInvalidMatch() && !confirm('יש משחקים עם שדות חסרים (יריבה/תאריך/מגרש/כתובת). להוריד בכל זאת?')) {
    return;
  }
  const blob = new Blob([sortedMatchesJson()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'matches.json';
  a.click();
  URL.revokeObjectURL(url);
  setStatus('הקובץ הורד. כעת החליפו את data/matches.json בפרויקט ובצעו commit + push.');
}

function setStatus(msg, isError = false) {
  const el = document.getElementById('status-msg');
  el.textContent = msg;
  el.className = 'status-msg' + (isError ? ' error' : '');
}
