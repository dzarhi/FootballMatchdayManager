export const LEAGUE_ID = '689c7b852c807e5273a17c3a';
export const TEAM_ID = 1243;
export const SEASON_ID = 28;
export const SOURCE_URL = 'https://vole.one.co.il/league/1248';

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function isScore(value) {
  return Number.isInteger(value) && value >= 0;
}

export function normalizeTeam(team) {
  requireValue(Number.isInteger(team?.provider?.id) && team.provider.id > 0,
    'Missing team identifier');
  requireValue(typeof team.provider.name === 'string' && team.provider.name.trim(),
    'Missing team name');
  return { id: team.provider.id, name: team.provider.name.trim() };
}

export function normalizeRound(payload, roundNumber) {
  requireValue(payload?.league?.id === LEAGUE_ID, 'Unexpected league');
  requireValue(payload.league.round?.number === roundNumber, 'Unexpected round');
  const expectedIds = payload.league.round.games;
  requireValue(Array.isArray(expectedIds) && expectedIds.length === 12
    && new Set(expectedIds).size === 12, 'Incomplete round manifest');
  requireValue(Array.isArray(payload.games) && payload.games.length === expectedIds.length,
    'Incomplete round games');
  const gameIds = new Set();
  const teamIds = new Set();
  const games = payload.games.map(game => {
    requireValue(expectedIds.includes(game._id) && !gameIds.has(game._id), 'Unexpected or duplicate game');
    gameIds.add(game._id);
    requireValue(game.season_id === SEASON_ID && game.league_id?.includes(LEAGUE_ID),
      'Unexpected season or league');
    requireValue(game.round?.number === roundNumber - 1 && game.round.type === 'regular',
      'Unexpected game round');
    requireValue(typeof game.date === 'string' && Number.isFinite(Date.parse(game.date)), 'Invalid game date');
    const date = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date(game.date));
    requireValue(date >= '2026-07-01' && date < '2027-08-01', 'Game outside configured season');
    const home = normalizeTeam(game.home?.team);
    const away = normalizeTeam(game.away?.team);
    requireValue(home.id !== away.id && !teamIds.has(home.id) && !teamIds.has(away.id),
      'Duplicate team in round');
    teamIds.add(home.id);
    teamIds.add(away.id);
    requireValue(typeof game.is_finished === 'boolean', 'Missing final status');
    if (game.is_finished) requireValue(isScore(game.home.goals) && isScore(game.away.goals),
      'Invalid final score');
    return {
      id: game._id, round: roundNumber, date, home, away, finished: game.is_finished,
      homeGoals: game.is_finished ? game.home.goals : null,
      awayGoals: game.is_finished ? game.away.goals : null
    };
  });
  requireValue(teamIds.has(TEAM_ID), 'Our team is missing');
  return games;
}

export function normalizeStandings(rows, teams) {
  requireValue(rows.length === 24 && teams.length === 24, 'Incomplete league table');
  const seen = new Set();
  return rows.map((cells, index) => {
    requireValue(cells.length === 10 && Number(cells[1]) === index + 1, 'Unexpected table columns or rank');
    const matching = teams.filter(team => team.provider.name.trim() === cells[2].trim());
    requireValue(matching.length === 1, 'Table team cannot be identified');
    const team = normalizeTeam(matching[0]);
    requireValue(!seen.has(team.id), 'Duplicate table team');
    seen.add(team.id);
    const numbers = [...cells.slice(3, 7), ...cells.slice(8)].map(value => {
      requireValue(/^[+-]?\d+$/.test(value.trim()), 'Invalid table number');
      return Number(value);
    });
    const [played, wins, draws, losses, difference, points] = numbers;
    requireValue([played, wins, draws, losses].every(isScore) && played === wins + draws + losses,
      'Invalid table totals');
    const stats = matching[0].stats;
    const goals = /^(\d+)\s*-\s*(\d+)$/.exec(cells[7].trim());
    requireValue(goals && Number(goals[1]) === stats?.goals?.for
      && Number(goals[2]) === stats?.goals?.against, 'Invalid goals column');
    requireValue(stats && played === stats.games && wins === stats.wins && draws === stats.draws
      && losses === stats.losses && difference === stats.goals?.difference && points === stats.points,
    'Table changed during collection');
    return { rank: index + 1, ...team, played, wins, draws, losses,
      goalsFor: Number(goals[1]), goalsAgainst: Number(goals[2]), difference, points };
  });
}

export function validateSnapshot(standings, games) {
  requireValue(standings.length === 24 && games.length === 23 * 12, 'Incomplete season');
  requireValue(new Set(games.map(game => game.id)).size === games.length, 'Duplicate season game');
  const records = new Map(standings.map(team => [team.id, { played: 0, wins: 0, draws: 0, losses: 0, difference: 0 }]));
  for (const game of games) {
    requireValue(records.has(game.home.id) && records.has(game.away.id), 'Unknown team in games');
    if (!game.finished) continue;
    for (const [team, scored, conceded] of [[game.home, game.homeGoals, game.awayGoals], [game.away, game.awayGoals, game.homeGoals]]) {
      const record = records.get(team.id);
      record.played += 1;
      record.difference += scored - conceded;
      record[scored === conceded ? 'draws' : scored > conceded ? 'wins' : 'losses'] += 1;
    }
  }
  for (const team of standings) {
    const record = records.get(team.id);
    requireValue(Object.keys(record).every(key => record[key] === team[key]),
      `Standings and final results disagree for ${team.name}`);
  }
}

function normalizedName(name) {
  return String(name).normalize('NFKC').replace(/[\s."'\u05f3\u05f4\u2018-\u201f]/g, '');
}

function localRound(match) {
  const identifier = /^league-r(\d+)-/.exec(match.id || '');
  const note = /\u05de\u05d7\u05d6\u05d5\u05e8\s+(\d+)/.exec(match.notes || '');
  return Number(identifier?.[1] || note?.[1]);
}

function hasScore(value) {
  return value !== '' && value !== null && value !== undefined;
}

export function mergeResults(matches, games) {
  const updated = structuredClone(matches);
  const warnings = [];
  let changed = 0;
  for (const game of games.filter(game => game.finished && [game.home.id, game.away.id].includes(TEAM_ID))) {
    const homeAway = game.home.id === TEAM_ID ? 'home' : 'away';
    const opponent = homeAway === 'home' ? game.away : game.home;
    const candidates = updated.filter(match => match.matchType === 'league'
      && localRound(match) === game.round && match.homeAway === homeAway
      && normalizedName(match.opponent) === normalizedName(opponent.name));
    if (candidates.length !== 1) {
      warnings.push(`Round ${game.round}: no unique local match for ${opponent.name}`);
      continue;
    }
    const match = candidates[0];
    const existing = [match.homeGoals, match.awayGoals];
    const incoming = [game.homeGoals, game.awayGoals];
    if (existing.every((value, index) => hasScore(value) && Number(value) === incoming[index])) continue;
    const lastImported = match.voleResult;
    const unchangedImport = lastImported?.gameId === game.id
      && existing.every((value, index) => hasScore(value) && Number(value) === lastImported.score[index]);
    if (existing.some(hasScore) && !unchangedImport) {
      warnings.push(`Round ${game.round}: preserving manually entered score`);
      continue;
    }
    match.homeGoals = String(game.homeGoals);
    match.awayGoals = String(game.awayGoals);
    match.voleResult = { gameId: game.id, score: incoming };
    changed += 1;
  }
  return { matches: updated, changed, warnings };
}