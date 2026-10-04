const THEME_STORAGE_KEY = 'theme';
const TYPE_LABELS = { league: 'ליגה', cup: 'גביע', training: 'אימון' };

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

  document.getElementById('refresh-btn').addEventListener('click', () => location.reload());

  const filterChips = document.querySelectorAll('#type-filter .filter-chip');
  const FILTER_STORAGE_KEY = 'matchTypeFilter';
  let savedTypes = [];
  try {
    savedTypes = JSON.parse(localStorage.getItem(FILTER_STORAGE_KEY)) || [];
  } catch {
    savedTypes = [];
  }
  const activeTypes = new Set(savedTypes);
  let matches = [];

  const renderFiltered = () => {
    const filteredMatches = activeTypes.size === 0
      ? matches
      : matches.filter(match => activeTypes.has(match.matchType || 'league'));
    renderStatistics(filteredMatches, activeTypes);
  };

  filterChips.forEach(chip => {
    if (activeTypes.has(chip.dataset.type)) chip.classList.add('active');
    chip.addEventListener('click', () => {
      const type = chip.dataset.type;
      if (activeTypes.has(type)) activeTypes.delete(type);
      else activeTypes.add(type);
      chip.classList.toggle('active', activeTypes.has(type));
      localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(Array.from(activeTypes)));
      renderFiltered();
    });
  });

  try {
    matches = (await loadMatches()).filter(hasMatchResult);
    renderFiltered();
  } catch (error) {
    const caption = document.getElementById('stats-caption');
    caption.textContent = error.message;
    caption.hidden = false;
  }
});

function getScoreFor(match) {
  const homeGoals = Number(match.homeGoals);
  const awayGoals = Number(match.awayGoals);
  return match.homeAway === 'away'
    ? { goalsFor: awayGoals, goalsAgainst: homeGoals }
    : { goalsFor: homeGoals, goalsAgainst: awayGoals };
}

function createRecord() {
  return { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 };
}

function addMatch(record, match) {
  const score = getScoreFor(match);
  record.played += 1;
  record.goalsFor += score.goalsFor;
  record.goalsAgainst += score.goalsAgainst;
  if (score.goalsFor > score.goalsAgainst) record.wins += 1;
  else if (score.goalsFor < score.goalsAgainst) record.losses += 1;
  else record.draws += 1;
}

function summarize(matches) {
  const summary = createRecord();
  matches.forEach(match => addMatch(summary, match));
  return summary;
}

function renderStatistics(matches, activeTypes) {
  const summary = summarize(matches);
  const goalDifference = summary.goalsFor - summary.goalsAgainst;
  const winRate = summary.played ? Math.round(summary.wins / summary.played * 100) : 0;
  const metrics = [
    ['משחקים', summary.played],
    ['ניצחונות', summary.wins],
    ['תיקו', summary.draws],
    ['הפסדים', summary.losses],
    ['שערי זכות / חובה', `<bdi dir="ltr">${summary.goalsAgainst} / ${summary.goalsFor}</bdi>`],
    ['הפרש שערים', goalDifference > 0 ? `+${goalDifference}` : goalDifference],
    ['אחוז ניצחונות', `${winRate}%`]
  ];

  document.getElementById('summary-stats').innerHTML = metrics.map(([label, value]) =>
    `<div class="stat-item"><span class="stat-item-label">${label}</span><strong class="stat-item-value">${value}</strong></div>`
  ).join('');

  renderDistribution(summary);
  renderBreakdown(matches, activeTypes);
  renderRecentResults(matches);
}

function renderDistribution(summary) {
  const total = summary.played || 1;
  const distribution = document.getElementById('result-distribution');
  distribution.innerHTML = `
    <div class="result-distribution" role="img" aria-label="${summary.wins} ניצחונות, ${summary.draws} תיקו, ${summary.losses} הפסדים">
      <span class="distribution-wins" style="width:${summary.wins / total * 100}%"></span>
      <span class="distribution-draws" style="width:${summary.draws / total * 100}%"></span>
      <span class="distribution-losses" style="width:${summary.losses / total * 100}%"></span>
    </div>
    <div class="distribution-legend">
      <span style="--legend-color:#23834b">ניצחונות ${summary.wins}</span>
      <span style="--legend-color:#d59b16">תיקו ${summary.draws}</span>
      <span style="--legend-color:#c43b45">הפסדים ${summary.losses}</span>
    </div>`;
}

function renderBreakdown(matches, activeTypes) {
  const categories = [
    ['league', 'ליגה', match => (match.matchType || 'league') === 'league'],
    ['cup', 'גביע', match => match.matchType === 'cup'],
    ['training', 'אימון', match => match.matchType === 'training'],
    ['home', 'בית', match => match.homeAway === 'home'],
    ['away', 'חוץ', match => match.homeAway === 'away']
  ];

  const visibleCategories = categories.filter(([category]) =>
    !TYPE_LABELS[category] || activeTypes.size === 0 || activeTypes.has(category)
  );

  document.getElementById('breakdown-rows').innerHTML = visibleCategories.map(([, label, predicate]) => {
    const record = summarize(matches.filter(predicate));
    const difference = record.goalsFor - record.goalsAgainst;
    const formattedDifference = difference > 0 ? `+${difference}` : difference;
    return `<tr>
      <td>${label}</td>
      <td>${record.played}</td>
      <td><bdi dir="ltr">${record.losses}-${record.draws}-${record.wins}</bdi></td>
      <td><bdi dir="ltr">${record.goalsAgainst}-${record.goalsFor}</bdi></td>
      <td>${formattedDifference}</td>
    </tr>`;
  }).join('');
}

function renderRecentResults(matches) {
  const container = document.getElementById('recent-results');
  const sortedMatches = [...matches].sort((a, b) => b.date.localeCompare(a.date));
  if (!sortedMatches.length) {
    container.innerHTML = '<p class="empty">עדיין לא הוזנו תוצאות.</p>';
    return;
  }

  container.innerHTML = sortedMatches.map(match => {
    const { goalsFor, goalsAgainst } = getScoreFor(match);
    const outcome = goalsFor > goalsAgainst ? 'win' : goalsFor < goalsAgainst ? 'loss' : 'draw';
    const outcomeLabel = outcome === 'win' ? 'נ' : outcome === 'loss' ? 'ה' : 'ת';
    const venue = match.homeAway === 'home' ? 'בית' : 'חוץ';
    const typeLabel = TYPE_LABELS[match.matchType] || TYPE_LABELS.league;
    return `<article class="result-row">
      <div>
        <div class="result-opponent">${escapeHTML(match.opponent)}</div>
        <div class="result-meta"><span>${formatDateHe(match.date)}</span><span>${venue}</span><span>${typeLabel}</span></div>
      </div>
      <div class="result-score"><span class="result-outcome ${outcome}" aria-label="${outcomeLabel}">${outcomeLabel}</span>${goalsFor} - ${goalsAgainst}</div>
    </article>`;
  }).join('');
}

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}