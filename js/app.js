const OUR_TEAM_NAME = 'מ.ס. אשדוד';
const THEME_STORAGE_KEY = 'theme';

document.addEventListener('DOMContentLoaded', async () => {
  const themeToggle = document.getElementById('theme-toggle');
  const applyTheme = (isDark) => {
    document.documentElement.classList.toggle('dark-mode', isDark);
    themeToggle.textContent = isDark ? '☀️' : '🌙';
  };
  applyTheme(localStorage.getItem(THEME_STORAGE_KEY) === 'dark');
  themeToggle.addEventListener('click', () => {
    const isDark = !document.documentElement.classList.contains('dark-mode');
    applyTheme(isDark);
    localStorage.setItem(THEME_STORAGE_KEY, isDark ? 'dark' : 'light');
  });

  const upcomingEl = document.getElementById('upcoming-matches');
  const pastEl = document.getElementById('past-matches');
  const pastToggle = document.getElementById('toggle-past');
  const refreshBtn = document.getElementById('refresh-btn');
  const filterChips = document.querySelectorAll('#type-filter .filter-chip');
  const FILTER_STORAGE_KEY = 'matchTypeFilter';

  refreshBtn.addEventListener('click', () => {
    refreshBtn.classList.add('spinning');
    location.reload();
  });

  let savedTypes = [];
  try {
    savedTypes = JSON.parse(localStorage.getItem(FILTER_STORAGE_KEY)) || [];
  } catch {
    savedTypes = [];
  }
  const activeTypes = new Set(savedTypes);

  pastToggle.addEventListener('click', () => {
    const hidden = pastEl.classList.toggle('hidden');
    pastToggle.textContent = hidden ? 'הצג משחקים קודמים' : 'הסתר משחקים קודמים';
  });

  let matches = [];
  const renderFiltered = () => {
    const visible = activeTypes.size === 0
      ? matches
      : matches.filter(m => activeTypes.has(m.matchType || 'league'));
    const upcoming = visible.filter(m => !isMatchPast(m));
    const past = visible.filter(m => isMatchPast(m)).reverse();

    renderMatches(upcomingEl, upcoming, 'אין משחקים קרובים בלוח כרגע.');
    renderMatches(pastEl, past, 'אין משחקים קודמים.');
  };

  filterChips.forEach(chip => {
    if (activeTypes.has(chip.dataset.type)) {
      chip.classList.add('active');
    }
    chip.addEventListener('click', () => {
      const type = chip.dataset.type;
      if (activeTypes.has(type)) {
        activeTypes.delete(type);
      } else {
        activeTypes.add(type);
      }
      chip.classList.toggle('active');
      localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(Array.from(activeTypes)));
      renderFiltered();
    });
  });

  try {
    matches = await loadMatches();
    matches.sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));
    renderFiltered();
  } catch (err) {
    upcomingEl.innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
  }
});

function renderMatches(container, matches, emptyMessage) {
  container.innerHTML = '';
  if (!matches.length) {
    container.innerHTML = `<p class="empty">${escapeHtml(emptyMessage)}</p>`;
    return;
  }
  matches.forEach(m => container.appendChild(createMatchCard(m)));
}

function createMatchCard(m) {
  const card = document.createElement('article');
  card.className = 'match-card' + (isMatchPast(m) ? ' past' : '');

  const typeLabels = { league: 'ליגה', cup: 'גביע', training: 'אימון' };
  const typeLabel = typeLabels[m.matchType] || typeLabels.league;

  const homeAwayLabel = m.homeAway === 'home' ? 'בית' : 'חוץ';

  const hasResult = hasMatchResult(m);

  const homeTeamName = m.homeAway === 'home' ? OUR_TEAM_NAME : m.opponent;
  const awayTeamName = m.homeAway === 'away' ? OUR_TEAM_NAME : m.opponent;

  let homeIsHigher = false;
  let awayIsHigher = false;
  if (hasResult) {
    homeIsHigher = Number(m.homeGoals) > Number(m.awayGoals);
    awayIsHigher = Number(m.awayGoals) > Number(m.homeGoals);
  }

  card.innerHTML = `
    <div class="badge-row">
      <span class="badge badge-type badge-${m.matchType || 'league'}">${typeLabel}</span>
      <span class="badge badge-home-away badge-${m.homeAway}">${homeAwayLabel}</span>
    </div>
    <div class="match-header">
      <div class="team-row${m.homeAway === 'home' ? ' our-team' : ''}">
        <span class="team-name">${escapeHtml(homeTeamName)}</span>
        ${hasResult ? `<span class="team-score"><span class="score-arrow${homeIsHigher ? '' : ' invisible'}">▶︎</span>${escapeHtml(String(m.homeGoals))}</span>` : ''}
      </div>
      <div class="team-row${m.homeAway === 'away' ? ' our-team' : ''}">
        <span class="team-name">${escapeHtml(awayTeamName)}</span>
        ${hasResult ? `<span class="team-score"><span class="score-arrow${awayIsHigher ? '' : ' invisible'}">▶︎</span>${escapeHtml(String(m.awayGoals))}</span>` : ''}
      </div>
    </div>
    <div class="match-body">
      <div class="match-row"><span class="icon">📅</span>יום ${formatDayName(m.date)}, ${formatDateHe(m.date)}${m.time ? ' · שעה ' + escapeHtml(m.time) : ''}</div>
      ${m.venueName ? `<div class="match-row"><span class="icon">📍</span>${escapeHtml(m.venueName)}</div>` : ''}
      ${m.notes ? `<div class="match-row notes">${escapeHtml(m.notes)}</div>` : ''}
    </div>
    <div class="match-footer">
      ${m.address ? `<a class="waze-btn" href="${wazeLink(m.address)}" target="_blank" rel="noopener noreferrer">
        <svg class="waze-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13.218 0C9.915 0 6.835 1.49 4.723 4.148c-1.515 1.913-2.31 4.272-2.31 6.706v1.739c0 .894-.62 1.738-1.862 1.813-.298.025-.547.224-.547.522-.05.82.82 2.31 2.012 3.502.82.844 1.788 1.515 2.832 2.036a3 3 0 0 0 2.955 3.528 2.966 2.966 0 0 0 2.931-2.385h2.509c.323 1.689 2.086 2.856 3.974 2.21 1.64-.546 2.36-2.409 1.763-3.924a12.84 12.84 0 0 0 1.838-1.465 10.73 10.73 0 0 0 3.18-7.65c0-2.882-1.118-5.589-3.155-7.625A10.899 10.899 0 0 0 13.218 0zm0 1.217c2.558 0 4.967.994 6.78 2.807a9.525 9.525 0 0 1 2.807 6.78A9.526 9.526 0 0 1 20 17.585a9.647 9.647 0 0 1-6.78 2.807h-2.46a3.008 3.008 0 0 0-2.93-2.41 3.03 3.03 0 0 0-2.534 1.367v.024a8.945 8.945 0 0 1-2.41-1.788c-.844-.844-1.316-1.614-1.515-2.11a2.858 2.858 0 0 0 1.441-.846 2.959 2.959 0 0 0 .795-2.036v-1.789c0-2.11.696-4.197 2.012-5.861 1.863-2.385 4.62-3.726 7.6-3.726zm-2.41 5.986a1.192 1.192 0 0 0-1.191 1.192 1.192 1.192 0 0 0 1.192 1.193A1.192 1.192 0 0 0 12 8.395a1.192 1.192 0 0 0-1.192-1.192zm7.204 0a1.192 1.192 0 0 0-1.192 1.192 1.192 1.192 0 0 0 1.192 1.193 1.192 1.192 0 0 0 1.192-1.193 1.192 1.192 0 0 0-1.192-1.192zm-7.377 4.769a.596.596 0 0 0-.546.845 4.813 4.813 0 0 0 4.346 2.757 4.77 4.77 0 0 0 4.347-2.757.596.596 0 0 0-.547-.845h-.025a.561.561 0 0 0-.521.348 3.59 3.59 0 0 1-3.254 2.061 3.591 3.591 0 0 1-3.254-2.061.64.64 0 0 0-.546-.348z"/></svg>
        <span>נווט בוויז</span>
      </a>` : ''}
      ${isMatchPast(m) && m.videoUrl ? `
      <a class="video-btn" href="${escapeHtml(m.videoUrl)}" target="_blank" rel="noopener noreferrer">
        <svg class="veo-icon" viewBox="0 0 78 26" fill="currentColor" role="img" aria-label="Veo"><path d="M77.8846 7.54334C77.0917 2.44824 72.7148 0.333336 67.7163 0.333336C62.0279 0.333336 56.9563 2.8604 53.8502 7.4963C51.983 10.2823 50.7112 14.3816 51.2267 17.6946C52.0252 22.8251 56.395 24.857 61.4074 24.857C67.1426 24.857 72.1293 22.4888 75.2426 17.8129C77.1077 15.0118 78.4022 10.872 77.8846 7.54334ZM66.6616 17.0832C65.0079 18.789 61.447 19.5556 60.2286 17.1069C59.0602 14.7579 60.6701 10.1088 62.4719 8.3009C63.4942 7.27531 64.6971 6.762 66.0817 6.762C67.4662 6.762 68.4052 7.2748 68.8992 8.3009C70.0342 10.6586 68.4325 15.257 66.6621 17.0832H66.6616Z"/><path d="M51.2697 10.3865C51.9201 7.86902 51.6813 5.19175 49.8281 3.1785C47.8796 1.06106 44.898 0.333336 42.0435 0.333336C36.7157 0.333336 32.0363 2.7188 29.0078 6.85354C26.9657 9.64155 25.8683 12.8175 25.9218 15.7177C26.0448 22.4417 32.0152 25.032 38.0602 24.8479C41.8588 24.7326 46.3731 22.7957 47.6656 20.297C48.3257 19.0211 47.7618 16.4748 45.6363 17.7477C42.6059 19.5622 33.906 20.0694 33.3102 15.7794L46.829 13.9027C49.1006 13.5877 50.6997 12.5939 51.2697 10.387V10.3865ZM43.3457 9.04531L34.6407 10.3334C35.4284 7.9378 37.5338 6.28562 40.2535 6.28562C42.0111 6.28562 43.532 7.23839 43.3457 9.04531Z"/><path d="M20.0362 2.52256L12.2845 18.8506C12.1528 14.1748 11.8343 8.13096 11.4773 3.46724C11.1562 -0.344342 8.26518 0.0784367 5.48733 0.979118C3.83626 1.51467 2.02003 2.32331 0.62725 2.86493C-0.265943 3.21236 -0.198542 4.36742 0.786749 4.62179C3.33255 5.27922 3.3449 6.70737 3.64846 9.05238L5.18582 20.9322C5.39523 22.5499 5.61956 24.1096 7.33803 24.6244C10.2147 25.4866 16.2607 25.5549 18.594 21.3681L29.6853 1.46865C30.95 -0.800499 20.8815 0.742442 20.0362 2.52256Z"/></svg>
        <span>צפייה במשחק</span>
      </a>` : ''}
    </div>
  `;
  return card;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}
