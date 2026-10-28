import { readFile, writeFile, rename, rm } from 'node:fs/promises';
import { chromium } from 'playwright';
import { LEAGUE_ID, SOURCE_URL, TEAM_ID, SEASON_ID, normalizeRound, normalizeStandings,
  validateSnapshot, mergeResults } from './vole.mjs';

async function readJson(path, optional = false) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (optional && error.code === 'ENOENT') return null; throw error; }
}

async function collect() {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    await context.route('**/*', route => {
      const request = route.request();
      if (new URL(request.url()).hostname !== 'vole.one.co.il'
        || ['image', 'font', 'media'].includes(request.resourceType())) return route.abort();
      return route.continue();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    const response = await page.goto(SOURCE_URL, { waitUntil: 'domcontentloaded' });
    if (!response?.ok()) throw new Error(`League page failed: ${response?.status()}`);
    await page.getByRole('table').waitFor();
    const initial = await page.evaluate(leagueId => {
      let found;
      function visit(value) {
        if (!value || typeof value !== 'object') return;
        if (value.realLeague?._id === leagueId && Array.isArray(value.games)) found = value;
        for (const child of Object.values(value)) visit(child);
      }
      const records = (window.__next_f || []).filter(entry => entry[0] === 1)
        .map(entry => entry[1]).join('').split('\n');
      for (const record of records) {
        let parsed;
        try { parsed = JSON.parse(record.slice(record.indexOf(':') + 1)); }
        catch { continue; }
        visit(parsed);
      }
      return found;
    }, LEAGUE_ID);
    if (initial?.realLeague?.one?.id !== 1248 || initial.realLeague.round.min !== 0
      || initial.realLeague.round.max !== 22 || initial.realLeague.round.type !== 'regular') {
      throw new Error('League structure changed; review before syncing');
    }
    const currentRound = initial.league.round.number;
    const currentGames = normalizeRound(initial, currentRound);
    const rows = await page.getByRole('table').locator('tbody tr').evaluateAll(elements =>
      elements.map(row => Array.from(row.querySelectorAll('td')).map(cell => cell.textContent.trim())));
    const teams = initial.games.flatMap(game => [game.home.team, game.away.team]);
    const standings = normalizeStandings(rows, teams);
    const games = [];
    for (let round = 1; round <= 23; round += 1) {
      if (round === currentRound) { games.push(...currentGames); continue; }
      const payload = await page.evaluate(async roundIndex => {
        const response = await fetch(`/api/leagues/rounds?league_id=1248&round=${roundIndex}`, {
          signal: AbortSignal.timeout(30000), redirect: 'error'
        });
        if (!response.ok) throw new Error(`Round ${roundIndex + 1}: HTTP ${response.status}`);
        return response.json();
      }, round - 1);
      games.push(...normalizeRound(payload, round));
    }
    validateSnapshot(standings, games);
    return {
      source: SOURCE_URL, season: '2026/27', seasonId: SEASON_ID, teamId: TEAM_ID,
      leagueName: initial.league.name, updatedAt: new Date().toISOString(),
      standings, results: games.filter(game => game.finished)
    };
  } finally { await browser.close(); }
}

async function main() {
  const checkOnly = process.argv.includes('--check');
  const matchesPath = new URL('../data/matches.json', import.meta.url);
  const snapshotPath = new URL('../data/league.json', import.meta.url);
  const originalText = await readFile(matchesPath, 'utf8');
  const snapshot = await collect();
  const previous = await readJson(snapshotPath, true);
  if (previous?.seasonId === SEASON_ID) {
    const currentIds = new Set(snapshot.results.map(game => game.id));
    if (previous.results.some(game => !currentIds.has(game.id))) {
      throw new Error('Previously final games disappeared; retaining previous data');
    }
  }
  const merged = mergeResults(JSON.parse(originalText), snapshot.results);
  console.log(`${snapshot.standings.length} teams, ${snapshot.results.length} final results, ${merged.changed} local scores updated`);
  merged.warnings.forEach(warning => console.warn(warning));
  if (checkOnly) { console.log('Check only: no files written'); return; }
  if (await readFile(matchesPath, 'utf8') !== originalText) throw new Error('Local matches changed during sync; retry');
  const snapshotTemp = new URL('../data/league.json.tmp', import.meta.url);
  const matchesTemp = new URL('../data/matches.json.tmp', import.meta.url);
  try {
    await writeFile(snapshotTemp, JSON.stringify(snapshot, null, 2) + '\n');
    if (merged.changed) await writeFile(matchesTemp, JSON.stringify(merged.matches, null, 2) + '\n');
    await rename(snapshotTemp, snapshotPath);
    if (merged.changed) await rename(matchesTemp, matchesPath);
  } finally {
    await rm(snapshotTemp, { force: true });
    await rm(matchesTemp, { force: true });
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });