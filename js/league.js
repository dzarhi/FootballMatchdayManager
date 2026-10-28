document.addEventListener('DOMContentLoaded', () => {
  const themeToggle = document.getElementById('theme-toggle');
  const applyTheme = isDark => {
    document.documentElement.classList.toggle('dark-mode', isDark);
    themeToggle.textContent = isDark ? '☀️' : '🌙';
  };
  applyTheme(localStorage.getItem('theme') === 'dark');
  themeToggle.addEventListener('click', () => {
    const isDark = !document.documentElement.classList.contains('dark-mode');
    applyTheme(isDark);
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  });
  document.getElementById('refresh-btn').addEventListener('click', () => location.reload());
  loadLeague();
});

async function loadLeague() {
  const status = document.getElementById('league-status');
  try {
    const response = await fetch('data/league.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('League data unavailable');
    const league = await response.json();
    const updated = new Date(league.updatedAt);
    if (league.season !== '2026/27' || league.teamId !== 1243
      || !Array.isArray(league.standings) || league.standings.length !== 24
      || !Array.isArray(league.results) || !Number.isFinite(updated.getTime())) {
      throw new Error('Invalid league data');
    }
    document.getElementById('league-updated').textContent = `עודכן: ${updated.toLocaleString('he-IL', {
      timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short'
    })}`;
    if (document.getElementById('league-rows')) renderStandings(league);
    const selector = document.getElementById('league-round');
    if (selector) {
      selector.replaceChildren(...Array.from({ length: 23 }, (_, index) => new Option(index + 1, index + 1)));
      selector.value = String(Math.max(1, ...league.results.map(game => game.round)));
      selector.disabled = false;
      selector.addEventListener('change', () => renderLeagueResults(league, Number(selector.value)));
      renderLeagueResults(league, Number(selector.value));
    }
    const stale = Date.now() - updated.getTime() > 24 * 60 * 60 * 1000;
    status.textContent = stale ? 'הנתונים לא עודכנו ב־24 השעות האחרונות.' : '';
    status.hidden = !stale;
  } catch {
    status.textContent = 'נתוני הליגה אינם זמינים כרגע. ניתן לצפות בהם בקישור למקור.';
    status.hidden = false;
    const results = document.getElementById('league-results');
    if (results) results.replaceChildren(leagueElement('p', 'לא ניתן לטעון תוצאות ליגה.', 'empty'));
  }
}

function leagueElement(tag, text, className) {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}

function renderStandings(league) {
  document.getElementById('league-rows').replaceChildren(...league.standings.map(team => {
    const row = document.createElement('tr');
    if (team.id === league.teamId) {
      row.className = 'our-team';
      row.setAttribute('aria-label', 'מ.ס. אשדוד');
    }
    const name = leagueElement('th', team.name);
    name.scope = 'row';
    row.append(leagueElement('td', team.rank), name);
    const difference = team.difference > 0 ? `+${team.difference}` : team.difference;
    for (const value of [team.played, team.wins, team.draws, team.losses, team.goalsFor, team.goalsAgainst, difference, team.points]) {
      const cell = document.createElement('td');
      const number = leagueElement('bdi', value);
      number.dir = 'ltr';
      cell.append(number);
      row.append(cell);
    }
    return row;
  }));
  document.getElementById('league-table-wrap').hidden = false;
}

function renderLeagueResults(league, round) {
  const games = league.results.filter(game => game.round === round && game.finished)
    .sort((first, second) => first.date.localeCompare(second.date));
  const container = document.getElementById('league-results');
  container.replaceChildren(...games.map(game => {
    const row = document.createElement('article');
    row.className = `league-result${game.home.id === league.teamId || game.away.id === league.teamId ? ' our-team' : ''}`;
    const date = leagueElement('time', formatDateHe(game.date));
    date.dateTime = game.date;
    const score = leagueElement('strong', '', 'league-score');
    score.setAttribute('aria-label', `${game.home.name} ${game.homeGoals}, ${game.away.name} ${game.awayGoals}`);
    const numbers = leagueElement('bdi', `${game.awayGoals} - ${game.homeGoals}`);
    numbers.dir = 'ltr';
    score.append(numbers);
    row.append(date, leagueElement('span', game.home.name, 'league-home'), score,
      leagueElement('span', game.away.name, 'league-away'));
    return row;
  }));
  if (!games.length) container.append(leagueElement('p', 'אין עדיין תוצאות סופיות למחזור זה.', 'empty'));
}