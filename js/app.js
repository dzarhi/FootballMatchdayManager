document.addEventListener('DOMContentLoaded', async () => {
  const upcomingEl = document.getElementById('upcoming-matches');
  const pastEl = document.getElementById('past-matches');
  const pastToggle = document.getElementById('toggle-past');

  try {
    const matches = await loadMatches();
    matches.sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));

    const upcoming = matches.filter(m => !isPast(m.date));
    const past = matches.filter(m => isPast(m.date)).reverse();

    renderMatches(upcomingEl, upcoming, 'אין משחקים קרובים בלוח כרגע.');
    renderMatches(pastEl, past, 'אין משחקים קודמים.');

    pastToggle.addEventListener('click', () => {
      const hidden = pastEl.classList.toggle('hidden');
      pastToggle.textContent = hidden ? 'הצג משחקים קודמים' : 'הסתר משחקים קודמים';
    });
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
  card.className = 'match-card' + (isPast(m.date) ? ' past' : '');

  const badge = m.homeAway === 'home' ? 'בית' : 'חוץ';
  const badgeClass = m.homeAway === 'home' ? 'badge-home' : 'badge-away';

  card.innerHTML = `
    <div class="match-header">
      <span class="opponent">${escapeHtml(m.opponent)}</span>
      <span class="badge ${badgeClass}">${badge}</span>
    </div>
    <div class="match-body">
      <div class="match-row"><span class="icon">📅</span>יום ${formatDayName(m.date)}, ${formatDateHe(m.date)}${m.time ? ' · שעה ' + escapeHtml(m.time) : ''}</div>
      <div class="match-row"><span class="icon">📍</span>${escapeHtml(m.venueName)}</div>
      ${m.notes ? `<div class="match-row notes">${escapeHtml(m.notes)}</div>` : ''}
    </div>
    <div class="match-footer">
      <a class="waze-btn" href="${wazeLink(m.address)}" target="_blank" rel="noopener noreferrer">נווט בוויז 🧭</a>
    </div>
  `;
  return card;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}
