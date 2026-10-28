import test from 'node:test';
import assert from 'node:assert/strict';
import { LEAGUE_ID, SEASON_ID, TEAM_ID, normalizeRound, normalizeStandings, validateSnapshot, mergeResults } from './vole.mjs';

function roundFixture() {
  const games = Array.from({ length: 12 }, (_, index) => ({
    _id: `game-${index}`, season_id: SEASON_ID, league_id: [LEAGUE_ID],
    round: { number: 0, type: 'regular' }, date: '2026-10-17T07:30:00Z', is_finished: true,
    home: { team: { provider: { id: index === 0 ? TEAM_ID : index * 2 + 1, name: `Home ${index}` } }, goals: 2 },
    away: { team: { provider: { id: index * 2 + 2, name: `Away ${index}` } }, goals: 0 }
  }));
  return { league: { id: LEAGUE_ID, round: { number: 1, games: games.map(game => game._id) } }, games };
}

function localMatch(overrides = {}) {
  return { id: 'league-r01-2026-10-17', matchType: 'league', opponent: 'Away 0',
    homeAway: 'home', date: '2026-10-18', homeGoals: '', awayGoals: '',
    notes: 'Keep this note', videoUrl: 'https://example.com/video', address: 'Keep address', ...overrides };
}

test('validates a full round and only publishes final scores', () => {
  const payload = roundFixture();
  payload.games[1].is_finished = false;
  const games = normalizeRound(payload, 1);
  assert.equal(games.length, 12);
  assert.equal(games[0].date, '2026-10-17');
  assert.equal(games[0].homeGoals, 2);
  assert.equal(games[1].homeGoals, null);
});

test('rejects partial, duplicate, malformed and wrong-season responses', () => {
  for (const mutate of [
    payload => payload.games.pop(),
    payload => { payload.games[1] = payload.games[0]; },
    payload => { payload.games[0].home.goals = null; },
    payload => { payload.games[0].season_id = 27; },
    payload => { payload.games[0].round.number = 1; },
    payload => { payload.league.id = 'other'; }
  ]) {
    const payload = roundFixture();
    mutate(payload);
    assert.throws(() => normalizeRound(payload, 1));
  }
});

test('fills blank scores without changing metadata, dates or non-league games', () => {
  const original = [localMatch(), localMatch({ id: 'cup', matchType: 'cup' })];
  const result = mergeResults(original, normalizeRound(roundFixture(), 1));
  assert.equal(result.changed, 1);
  assert.deepEqual(result.matches[0], { ...original[0], homeGoals: '2', awayGoals: '0',
    voleResult: { gameId: 'game-0', score: [2, 0] } });
  assert.deepEqual(result.matches[1], original[1]);
  assert.equal(original[0].homeGoals, '');
});

test('preserves manual and partial scores, but updates untouched imported results', () => {
  const games = normalizeRound(roundFixture(), 1);
  for (const scores of [{ homeGoals: '3', awayGoals: '1' }, { homeGoals: '0' }]) {
    const original = [localMatch(scores)];
    const result = mergeResults(original, games);
    assert.deepEqual(result.matches, original);
    assert.equal(result.warnings.length, 1);
  }
  const imported = mergeResults([localMatch()], games).matches;
  games[0].homeGoals = 3;
  assert.equal(mergeResults(imported, games).matches[0].homeGoals, '3');
  imported[0].homeGoals = '4';
  assert.equal(mergeResults(imported, games).matches[0].homeGoals, '4');
});

test('skips ambiguous opponents and unfinished games; repeated runs are idempotent', () => {
  const games = normalizeRound(roundFixture(), 1);
  assert.equal(mergeResults([localMatch(), localMatch()], games).changed, 0);
  assert.equal(mergeResults([localMatch({ opponent: 'Other' })], games).changed, 0);
  const first = mergeResults([localMatch()], games);
  assert.deepEqual(mergeResults(first.matches, games).matches, first.matches);
  games[0].finished = false;
  assert.equal(mergeResults([localMatch()], games).changed, 0);
});

test('table parsing retains source order and rejects incomplete or changed tables', () => {
  const teams = Array.from({ length: 24 }, (_, index) => ({
    provider: { id: index + 1, name: `Team ${index}` },
    stats: { games: 1, wins: 0, draws: 1, losses: 0, goals: { for: 0, against: 0, difference: 0 }, points: 1 }
  }));
  const rows = teams.map((team, index) => ['', String(index + 1), team.provider.name, '1', '0', '1', '0', '0 - 0', '0', '1']);
  const table = normalizeStandings(rows, teams);
  assert.equal(table[0].rank, 1);
  assert.equal(table[23].name, 'Team 23');
  assert.throws(() => normalizeStandings(rows.slice(1), teams));
  rows[0][9] = '3';
  assert.throws(() => normalizeStandings(rows, teams));
});

test('season validation catches missing games and disagreement with the table', () => {
  const games = Array.from({ length: 23 }, (_, index) => {
    const payload = roundFixture();
    payload.league.round.number = index + 1;
    payload.games.forEach(game => {
      game._id += `-round-${index}`;
      game.round.number = index;
      game.is_finished = index === 0;
    });
    payload.league.round.games = payload.games.map(game => game._id);
    return normalizeRound(payload, index + 1);
  }).flat();
  const standings = games.slice(0, 12).flatMap(game => [
    { ...game.home, played: 1, wins: 1, draws: 0, losses: 0, difference: 2 },
    { ...game.away, played: 1, wins: 0, draws: 0, losses: 1, difference: -2 }
  ]);
  assert.doesNotThrow(() => validateSnapshot(standings, games));
  assert.throws(() => validateSnapshot(standings, games.slice(1)));
  standings[0].wins = 0;
  assert.throws(() => validateSnapshot(standings, games));
});