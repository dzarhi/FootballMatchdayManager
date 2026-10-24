// פונקציות עזר משותפות לטעינת נתונים, פורמט תאריכים וקישורי ניווט

const DAY_NAMES_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

// בונה תאריך לפי שעון מקומי (ולא UTC) כדי למנוע הזזה של יום בין אזורי זמן
function parseLocalDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatDayName(dateStr) {
  return DAY_NAMES_HE[parseLocalDate(dateStr).getDay()];
}

function formatDateHe(dateStr) {
  const d = parseLocalDate(dateStr);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}`;
}

function isPast(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return parseLocalDate(dateStr) < today;
}

function hasMatchResult(m) {
  return m.homeGoals !== undefined && m.homeGoals !== '' && m.homeGoals !== null
    && m.awayGoals !== undefined && m.awayGoals !== '' && m.awayGoals !== null;
}

function getMatchScore(m) {
  const hasExtraTime = m.matchType === 'cup' && hasMatchResult(m)
    && Number(m.homeGoals) === Number(m.awayGoals)
    && m.extraTimeHomeGoals !== '' && m.extraTimeHomeGoals != null
    && m.extraTimeAwayGoals !== '' && m.extraTimeAwayGoals != null;
  return {
    homeGoals: Number(m.homeGoals) + (hasExtraTime ? Number(m.extraTimeHomeGoals) : 0),
    awayGoals: Number(m.awayGoals) + (hasExtraTime ? Number(m.extraTimeAwayGoals) : 0)
  };
}

function getMatchOutcome(m) {
  const score = getMatchScore(m);
  if (score.homeGoals > score.awayGoals) return 'home';
  if (score.awayGoals > score.homeGoals) return 'away';
  const hasPenalties = m.matchType === 'cup'
    && score.homeGoals === score.awayGoals
    && m.extraTimeHomeGoals !== '' && m.extraTimeHomeGoals != null
    && m.extraTimeAwayGoals !== '' && m.extraTimeAwayGoals != null
    && m.penaltiesHomeGoals !== '' && m.penaltiesHomeGoals != null
    && m.penaltiesAwayGoals !== '' && m.penaltiesAwayGoals != null;
  if (hasPenalties && Number(m.penaltiesHomeGoals) !== Number(m.penaltiesAwayGoals)) {
    return Number(m.penaltiesHomeGoals) > Number(m.penaltiesAwayGoals) ? 'home' : 'away';
  }
  return 'draw';
}

// משחק עם תוצאה שהוזנה נחשב כמשחק שהיה, גם אם תאריכו טרם הגיע
function isMatchPast(m) {
  return isPast(m.date) || hasMatchResult(m);
}

function wazeLink(address) {
  return `https://www.waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`;
}

async function loadMatches() {
  const res = await fetch('data/matches.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('שגיאה בטעינת נתוני המשחקים');
  return res.json();
}
