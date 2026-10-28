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
  for (const [name, viewport] of [['desktop', { width: 1280, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
    const page = await newPage(viewport);
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
    const snapshot = JSON.parse(await readFile(join(root, 'data/league.json'), 'utf8'));
    const selectedRound = Number(await page.locator('#league-round').inputValue());
    assert.equal(await page.locator('.league-result').count(), snapshot.results.filter(game => game.round === selectedRound).length);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal(await page.locator('.team-logo').evaluate(image => image.complete && image.naturalWidth > 0), true);
    await page.locator('#league-round').selectOption('23');
    if (!snapshot.results.some(game => game.round === 23)) {
      assert.equal(await page.locator('.league-result').count(), 0);
      assert.match(await page.locator('#league-results').innerText(), /אין עדיין/);
    }
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