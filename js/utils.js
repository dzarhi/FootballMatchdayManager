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

function wazeLink(address) {
  return `https://www.waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`;
}

async function loadMatches() {
  const res = await fetch('data/matches.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('שגיאה בטעינת נתוני המשחקים');
  return res.json();
}
