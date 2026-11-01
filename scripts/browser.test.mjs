import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, resolve, sep, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let browser;
let server;
let baseUrl;

before(async () => {
  server = createServer(async (request, response) => {
    try {
      const path = resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
      if (!path.startsWith(root + sep)) throw new Error('Invalid path');
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
      response.setHeader('Content-Type', types[extname(path)] || 'application/octet-stream');
      response.end(await readFile(path));
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise(resolveReady => server.listen(0, '127.0.0.1', resolveReady));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  if (server) await new Promise(resolveClosed => server.close(resolveClosed));
});

async function newPage(viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport });
  await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1'
    ? route.continue() : route.abort());
  return context.newPage();
}

test('league table and round results work on desktop and mobile without page overflow', async () => {
  const snapshot = JSON.parse(await readFile(join(root, 'data/league.json'), 'utf8'));
  snapshot.results = snapshot.results.filter(game => game.finished);
  snapshot.results.push({
    id: 'scheduled-round-23', round: 23, date: '2027-04-17',
    time: '16:15', kickoffAt: '2027-04-17T13:15:00.000Z',
    home: { id: 10001, name: 'קבוצה מארחת' },
    away: { id: 10002, name: 'קבוצה אורחת' },
    finished: false, homeGoals: null, awayGoals: null
  });
  snapshot.results.push({
    id: 'scheduled-round-23-time-unknown', round: 23, date: '2027-04-10',
    time: '00:00', kickoffAt: '2027-04-09T21:00:00.000Z',
    home: { id: 10005, name: 'קבוצה ללא שעה' },
    away: { id: 10006, name: 'יריבה' },
    finished: false, homeGoals: null, awayGoals: null
  });
  snapshot.results.push({
    id: 'finished-round-23', round: 23, date: '2027-04-10',
    home: { id: 10003, name: 'קבוצה עם תוצאה' },
    away: { id: 10004, name: 'יריבה' },
    finished: true, homeGoals: 2, awayGoals: 1
  });
  for (const [name, viewport] of [['desktop', { width: 1280, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
    const page = await newPage(viewport);
    await page.route('**/data/league.json', route => route.fulfill({ json: snapshot }));
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${baseUrl}/index.html`);
    await page.locator('a[href="standings.html"]').click();
    await page.locator('#league-table-wrap').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#league-rows tr').count(), 24);
    assert.equal(await page.locator('#league-rows .our-team').count(), 1);
    assert.equal(await page.locator('#league-results').count(), 0);
    assert.equal(await page.locator('#summary-stats').count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: join(tmpdir(), `fmm-league-${name}.png`), animations: 'disabled' });
    await page.locator('a[href="results.html"]').click();
    await page.waitForFunction(() => !document.getElementById('league-round').disabled);
    assert.equal(await page.locator('#league-rows').count(), 0);
    assert.equal(await page.locator('#league-round option').count(), 23);
    const selectedRound = Number(await page.locator('#league-round').inputValue());
    assert.equal(selectedRound, 23);
    assert.equal(await page.locator('.league-result').count(), snapshot.results.filter(game => game.round === selectedRound).length);
    assert.equal(await page.locator('.league-result:not(.upcoming) .league-score').innerText(), '1 - 2');
    assert.equal(await page.locator('.league-result.upcoming').count(), 2);
    assert.equal(await page.locator('.league-result.upcoming time').allInnerTexts()
      .then(times => times.includes('17.04.2027 · 16:15')), true);
    assert.equal(await page.locator('.league-result.upcoming time').allInnerTexts()
      .then(times => times.includes('10.04.2027')), true);
    assert.equal(await page.locator('.league-result.upcoming time').allInnerTexts()
      .then(times => times.some(time => time.includes('00:00'))), false);
    assert.equal(await page.locator('.league-result.our-team').count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal(await page.locator('.team-logo').evaluate(image => image.complete && image.naturalWidth > 0), true);
    await page.locator('#league-round').selectOption('23');
    assert.equal(await page.locator('.league-result').count(), 3);
    assert.deepEqual(await page.locator('.league-result.upcoming .league-score').allInnerTexts(),
      ['טרם נערך', 'טרם נערך']);
    await page.locator('#league-round').selectOption('1');
    await page.screenshot({ path: join(tmpdir(), `fmm-results-${name}.png`), animations: 'disabled' });
    await page.locator('#theme-toggle').click();
    assert.equal(await page.locator('html').getAttribute('class'), 'dark-mode');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.locator('a[href="standings.html"]').click();
    await page.locator('#league-table-wrap').waitFor({ state: 'visible' });
    assert.equal(await page.locator('html').getAttribute('class'), 'dark-mode');
    await page.screenshot({ path: join(tmpdir(), `fmm-league-${name}-dark.png`), animations: 'disabled' });
    await page.locator('a[href="stats.html"]').click();
    await page.locator('#summary-stats .stat-item').first().waitFor();
    assert.equal(await page.locator('#summary-stats .stat-item').count(), 7);
    assert.equal(await page.locator('#league-rows, #league-results').count(), 0);
    assert.equal(await page.locator('a[href="standings.html"]').count(), 1);
    assert.equal(await page.locator('a[href="results.html"]').count(), 1);
    await page.locator('a[href="index.html"]').click();
    await page.locator('a[href="results.html"]').click();
    await page.waitForFunction(() => !document.getElementById('league-round').disabled);
    assert.deepEqual(errors, []);
    await page.context().close();
  }
});

test('league loading failure does not break existing team statistics', async () => {
  const page = await newPage();
  await page.route('**/data/league.json', route => route.fulfill({ status: 404, body: '' }));
  await page.goto(`${baseUrl}/stats.html`);
  await page.locator('#summary-stats .stat-item').first().waitFor();
  assert.equal(await page.locator('#summary-stats .stat-item').count(), 7);
  await page.goto(`${baseUrl}/standings.html`);
  await page.waitForFunction(() => document.getElementById('league-status').textContent.includes('אינם זמינים'));
  assert.equal(await page.locator('#league-table-wrap').isHidden(), true);
  await page.goto(`${baseUrl}/results.html`);
  await page.waitForFunction(() => document.getElementById('league-status').textContent.includes('אינם זמינים'));
  assert.equal(await page.locator('#league-round').isDisabled(), true);
  assert.match(await page.locator('#league-results').innerText(), /לא ניתן/);
  await page.context().close();
});

test('admin can request a league sync with a contents-only GitHub token', async () => {
  const page = await newPage();
  await page.addInitScript(() => localStorage.setItem('fmm_github_token', 'test-token'));
  const methods = [];
  let syncRequestUpdate;
  await page.route('**/contents/scripts/sync-request.json*', async route => {
    const request = route.request();
    methods.push(request.method());
    if (request.method() === 'GET') {
      await route.fulfill({ json: { sha: 'sync-request-sha' } });
      return;
    }
    syncRequestUpdate = {
      authorization: request.headers().authorization,
      body: request.postDataJSON()
    };
    await route.fulfill({ json: { content: { path: 'scripts/sync-request.json' } } });
  });
  await page.goto(`${baseUrl}/admin.html`);
  const syncButton = page.locator('#sync-league-btn');
  await syncButton.click();
  await page.waitForFunction(() => document.getElementById('status-msg').textContent.includes('בקשת הסנכרון נשלחה'));
  assert.deepEqual(methods, ['GET', 'PUT']);
  assert.equal(syncRequestUpdate.authorization, 'Bearer test-token');
  assert.deepEqual({
    message: syncRequestUpdate.body.message,
    sha: syncRequestUpdate.body.sha,
    branch: syncRequestUpdate.body.branch
  }, {
    message: '[sync] Manual league sync request',
    sha: 'sync-request-sha',
    branch: 'main'
  });
  const requestContent = JSON.parse(Buffer.from(syncRequestUpdate.body.content, 'base64').toString('utf8'));
  assert.ok(requestContent.requestedAt);
  assert.ok(requestContent.requestId);
  await page.context().close();
});

test('stale data is marked and external names are rendered as text', async () => {
  const page = await newPage();
  const snapshot = JSON.parse(await readFile(join(root, 'data/league.json'), 'utf8'));
  snapshot.updatedAt = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  snapshot.standings[0].name = '<img src=x onerror="alert(1)">';
  await page.route('**/data/league.json', route => route.fulfill({ json: snapshot }));
  await page.goto(`${baseUrl}/standings.html`);
  await page.locator('#league-table-wrap').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#league-status').isVisible(), true);
  assert.match(await page.locator('#league-status').innerText(), /24/);
  assert.equal(await page.locator('#league-rows img').count(), 0);
  assert.equal(await page.locator('#league-rows th').first().innerText(), snapshot.standings[0].name);
  await page.context().close();
});