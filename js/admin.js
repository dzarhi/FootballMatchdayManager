// עמוד ניהול: עריכה מקומית בדפדפן (localStorage), ייצוא/ייבוא JSON להעלאה ל-GitHub

const DRAFT_KEY = 'fmm_draft_matches';
let matches = [];

document.addEventListener('DOMContentLoaded', async () => {
  const draft = localStorage.getItem(DRAFT_KEY);
  if (draft) {
    try {
      matches = JSON.parse(draft);
      setStatus('נטענה טיוטה שנשמרה בדפדפן שלך.');
    } catch {
      matches = [];
    }
  } else {
    try {
      matches = await loadMatches();
    } catch {
      matches = [];
    }
  }
  render();

  document.getElementById('add-row-btn').addEventListener('click', () => {
    matches.push(emptyMatch());
    saveDraft();
    render();
  });

  document.getElementById('load-current-btn').addEventListener('click', async () => {
    try {
      matches = await loadMatches();
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

  document.getElementById('import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed)) throw new Error('פורמט לא תקין');
      matches = parsed;
      saveDraft();
      render();
      setStatus('קובץ יובא בהצלחה.');
    } catch {
      setStatus('שגיאה בייבוא הקובץ - ודאו שזהו קובץ JSON תקין.', true);
    }
    e.target.value = '';
  });
});

function emptyMatch() {
  return {
    id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random())),
    opponent: '',
    homeAway: 'home',
    matchType: 'league',
    date: '',
    time: '',
    result: '',
    venueName: '',
    address: '',
    notes: ''
  };
}

function render() {
  const tbody = document.getElementById('matches-tbody');
  tbody.innerHTML = '';
  matches.forEach((m, idx) => tbody.appendChild(createRow(m, idx)));
}

function createRow(m, idx) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" data-field="opponent" value="${attr(m.opponent)}" placeholder="שם היריבה"></td>
    <td>
      <select data-field="matchType">
        <option value="league" ${m.matchType === 'league' ? 'selected' : ''}>ליגה</option>
        <option value="cup" ${m.matchType === 'cup' ? 'selected' : ''}>גביע</option>
        <option value="training" ${m.matchType === 'training' ? 'selected' : ''}>אימון</option>
      </select>
    </td>
    <td>
      <select data-field="homeAway">
        <option value="home" ${m.homeAway === 'home' ? 'selected' : ''}>בית</option>
        <option value="away" ${m.homeAway === 'away' ? 'selected' : ''}>חוץ</option>
      </select>
    </td>
    <td><input type="date" data-field="date" value="${attr(m.date)}"></td>
    <td><input type="time" data-field="time" value="${attr(m.time)}"></td>
    <td><input type="text" data-field="result" value="${attr(m.result)}" placeholder="לדוגמה 3-1"></td>
    <td><input type="text" data-field="venueName" value="${attr(m.venueName)}" placeholder="שם המגרש"></td>
    <td><input type="text" data-field="address" value="${attr(m.address)}" placeholder="כתובת מדויקת"></td>
    <td><input type="text" data-field="notes" value="${attr(m.notes)}" placeholder="הערה (אופציונלי)"></td>
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
  const invalid = matches.some(m => !m.opponent || !m.date || !m.venueName || !m.address);
  if (invalid && !confirm('יש משחקים עם שדות חסרים (יריבה/תאריך/מגרש/כתובת). להוריד בכל זאת?')) {
    return;
  }
  const sorted = [...matches].sort((a, b) => a.date.localeCompare(b.date));
  const blob = new Blob([JSON.stringify(sorted, null, 2)], { type: 'application/json' });
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
