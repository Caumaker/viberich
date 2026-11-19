// End-to-end test. It starts its own server on a spare port with a temporary data folder (your documents are never
// touched), publishes examples/demo.md, drives the page in headless Chrome with puppeteer-core and checks that the
// CLI sees what the user did.
//
//   npm install && npm test
//
// Environment: CHROME (path to Chrome or Chromium; a default is picked per platform), VIBE_UI_PORT (default 7799).
'use strict';
const { spawn, execFileSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), assert = require('assert');

let puppeteer;
try { puppeteer = require('puppeteer-core'); } catch (e) { console.error('puppeteer-core is missing: run npm install'); process.exit(1); }
const CHROME = process.env.CHROME || {
  darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  win32: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
}[process.platform] || '/usr/bin/google-chrome';

const ROOT = path.join(__dirname, '..'); const CLI = path.join(ROOT, 'bin', 'vibe-ui');
const PORT = Number(process.env.VIBE_UI_PORT) || 7799;
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-ui-test-'));
const env = { ...process.env, VIBE_UI_DIR: DIR, VIBE_UI_PORT: String(PORT) };
const BASE = `http://localhost:${PORT}`;
const cli = (...a) => execFileSync(process.execPath, [CLI, ...a], { env, encoding: 'utf8' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const api = (u) => fetch(`${BASE}/api/demo/${u}`).then((r) => r.json());
async function until(fn, what, ms = 8000) {
  const end = Date.now() + ms; let v;
  while (Date.now() < end) { try { v = await fn(); } catch (e) { v = null; } if (v) return v; await sleep(150); }
  throw new Error('timed out waiting for ' + what);
}
const raw = (p, headers = {}) => new Promise((ok, ko) => { http.get({ host: '127.0.0.1', port: PORT, path: p, headers }, (r) => { r.resume(); ok(r.statusCode); }).on('error', ko); });

const failures = [];
async function step(name, fn) {
  try { await fn(); console.log('  ok    ' + name); } catch (e) { failures.push(name); console.log('  FAIL  ' + name + '\n        ' + String(e.message).split('\n')[0]); }
}

(async () => {
  if (await raw('/').then(() => true, () => false)) { console.error(`port ${PORT} is busy; set VIBE_UI_PORT to a free port`); process.exit(1); }
  cli('publish', 'demo', path.join(ROOT, 'examples', 'demo.md'));
  const server = spawn(process.execPath, [CLI, 'serve'], { env, stdio: 'ignore' });
  let browser;
  try {
    await until(() => raw('/').then((s) => s === 200), 'the server');
    browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--window-size=1400,1000', ...(process.platform === 'linux' ? ['--no-sandbox'] : [])] });
    const page = await browser.newPage(); await page.setViewport({ width: 1400, height: 1000 });
    const pageErrors = []; page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.goto(`${BASE}/demo`); await page.waitForSelector('.card');
    const ids = await page.evaluate(() => ({
      choice: DOC.blocks.filter((b) => b.type === 'choice').map((b) => b.id),
      intro: DOC.blocks.find((b) => b.html.startsWith('<p>Start with')).id,
      summary: DOC.blocks.find((b) => b.type === 'callout').id,
      context: DOC.blocks.find((b) => b.html.startsWith('<p>The app stores')).id,
      next: DOC.blocks.find((b) => b.html.startsWith('<p>Once the decisions')).id,
    }));
    const [q1, q2, q3] = ids.choice;
    const comments = () => api('comments');
    const findComment = async (text) => (await comments()).find((c) => c.messages.some((m) => m.text === text));
    const ctrl = async (...keys) => { await page.keyboard.down('Control'); for (const k of keys) await page.keyboard.press(k); await page.keyboard.up('Control'); };
    let firstComment, mouseComment;

    await step('the page renders blocks, cards, table, chart and the top bar', async () => {
      const s = await page.evaluate(() => ({
        cards: document.querySelectorAll('.card').length, table: !!document.querySelector('.table-wrap table'),
        chart: !!document.querySelector('.chart canvas'), callout: !!document.querySelector('.callout'),
        approve: $('#approve').textContent, sendHidden: $('#send').style.display === 'none', sendNow: $('#sendNow').checked,
        pre: [...document.querySelectorAll('.card input')].map((i) => i.checked),
      }));
      assert.strictEqual(s.cards, 3); assert.ok(s.table && s.chart && s.callout, 'table, chart and callout');
      assert.strictEqual(s.approve, 'Approve decisions (3)'); assert.ok(s.sendHidden && s.sendNow, 'Send instantly is on by default');
      assert.deepStrictEqual(s.pre, [true, false, false, true, true, false, false, true, false], 'pre-selected options');
    });

    await step('a ticked choice reaches Claude at once (Send instantly)', async () => {
      await page.click(`.blk[data-b="${q1}"] .opt:nth-child(2)`);
      await until(async () => (await api('choices'))[q1]?.checked.join() === '1', 'the choice on the server');
      assert.match(cli('pending', 'demo'), /request: D1: Which database do we start with\?: SQLite on the app server/);
      assert.match(cli('choices', 'demo'), /\[x\] SQLite on the app server/);
      await page.waitForFunction(() => $('#approve').textContent === 'Approve decisions (2)', { timeout: 3000 });
    });

    await step('keyboard: Ctrl+Shift+arrows select, Tab comments, Ctrl+Enter sends and returns the caret', async () => {
      await page.evaluate((id) => caretAt(id, 0), ids.context);
      await page.keyboard.down('Control'); await page.keyboard.down('Shift');
      await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
      await page.keyboard.up('Shift'); await page.keyboard.up('Control');
      assert.strictEqual(await page.evaluate(() => getSelection().toString().trim()), 'The app');
      await page.keyboard.press('Tab'); await sleep(200);
      assert.strictEqual(await page.evaluate(() => document.activeElement.id), 'newText', 'Tab opens the comment box');
      await page.keyboard.type('Is 200 customers the first-year target?');
      await ctrl('Enter');
      firstComment = await until(() => findComment('Is 200 customers the first-year target?'), 'the comment on the server');
      assert.strictEqual(firstComment.selection, 'The app');
      await sleep(400);
      const after = await page.evaluate(() => ({ active: document.activeElement.id, block: (blockOf(getSelection().anchorNode) || { dataset: {} }).dataset.b }));
      assert.strictEqual(after.active, 'doc', 'the caret is back in the text');
      assert.ok([ids.context, await page.evaluate((id) => nextBlock(document.querySelector('.blk[data-b="' + id + '"]'), 1).dataset.b, ids.context)].includes(after.block), 'the caret is on the next line');
    });

    await step('keyboard: Enter comments the whole block and Esc goes back to the text', async () => {
      await page.evaluate((id) => caretAt(id, 0), ids.summary);
      await page.keyboard.press('Enter'); await sleep(200);
      assert.strictEqual(await page.evaluate(() => document.activeElement.id), 'newText');
      assert.match(await page.$eval('.thread.active .ref', (e) => e.textContent), /Whole block/);
      await page.keyboard.press('Escape'); await sleep(300);
      assert.deepStrictEqual(await page.evaluate(() => [document.activeElement.id, !!$('#newText')]), ['doc', false]);
    });

    await step('mouse: "Comment selection" puts the caret in the comment box', async () => {
      const box = await page.evaluate((id) => { const p = document.querySelector('.blk[data-b="' + id + '"] p'); p.scrollIntoView({ block: 'center' }); const r = p.getBoundingClientRect(); return { x: r.x, y: r.y + 12 }; }, ids.intro);
      await page.mouse.move(box.x + 2, box.y); await page.mouse.down(); await page.mouse.move(box.x + 220, box.y, { steps: 6 }); await page.mouse.up();
      await page.waitForSelector('#commentSel', { visible: true }); await page.click('#commentSel'); await sleep(300);
      assert.strictEqual(await page.evaluate(() => document.activeElement.id), 'newText');
    });

    await step('a draft survives a live update and a reload, then sends', async () => {
      await page.keyboard.type('draft that must survive');
      cli('reply', firstComment.id, 'Yes: 200 paying customers by the end of year one.');
      await sleep(2500);
      assert.strictEqual(await page.$eval('#newText', (t) => t.value), 'draft that must survive', 'the live update did not redraw over the draft');
      await page.reload(); await page.waitForSelector('#newText');
      assert.strictEqual(await page.$eval('#newText', (t) => t.value), 'draft that must survive', 'the draft came back after the reload');
      await page.focus('#newText'); await ctrl('Enter');
      mouseComment = await until(() => findComment('draft that must survive'), 'the restored draft on the server');
      assert.match(mouseComment.selection, /^Start with/);
      await page.waitForFunction(() => [...document.querySelectorAll('.msg.claude')].some((m) => m.textContent.includes('200 paying customers')), { timeout: 8000 });
    });

    await step('CLI edit shows up live as a new version, noted in the thread', async () => {
      cli('edit', 'demo', ids.context, 'The app stores accounts, projects and invoices for 200 paying customers in the first year.', '--comment', firstComment.id, '--reason', 'stated the target');
      await page.waitForFunction((id) => document.querySelector('.blk[data-b="' + id + '"] .vb')?.textContent === 'v2', { timeout: 8000 }, ids.context);
      assert.ok(await page.$(`.blk[data-b="${ids.context}"].fresh`), 'the edited block flashes');
      assert.ok(await page.$('.msg.edit'), 'the thread says Claude changed the text');
      const hist = await api('history?b=' + ids.context);
      assert.deepStrictEqual(hist.map((v) => v.author), ['claude', 'claude']);
      assert.match(cli('block', 'demo', ids.context), /200 paying customers/);
    });

    await step('queue mode: nothing leaves until Send (Ctrl+Shift+Enter)', async () => {
      await page.click('#sendNow');
      assert.strictEqual(await page.evaluate(() => localStorage.getItem('vibe-ui-send-now')), '0');
      await page.click(`.blk[data-b="${q2}"] .opt:nth-child(3)`); await sleep(300);
      assert.ok(await page.$(`.card.queued .blk[data-b="${q2}"]`), 'the card is marked as queued');
      await page.evaluate((id) => caretAt(id, 0), ids.next);
      await page.keyboard.press('Enter'); await page.keyboard.type('Add a rollback step.'); await ctrl('Enter'); await sleep(900);
      assert.strictEqual(await page.$eval('#send', (b) => b.textContent), 'Send (2)');
      assert.ok(await page.$('.thread.queued'), 'the queued comment is shown in the sidebar');
      assert.ok(!(await api('choices'))[q2] && !(await findComment('Add a rollback step.')), 'nothing reached the server yet');
      await page.keyboard.down('Control'); await page.keyboard.down('Shift'); await page.keyboard.press('Enter'); await page.keyboard.up('Shift'); await page.keyboard.up('Control');
      await until(async () => (await api('choices'))[q2]?.checked.join() === '0,1,2' && await findComment('Add a rollback step.'), 'the queue on the server');
      await page.waitForFunction(() => $('#send').textContent === 'Send', { timeout: 5000 });
    });

    await step('"Approve decisions" sends every unanswered question with its ticked option', async () => {
      assert.strictEqual(await page.$eval('#approve', (b) => b.textContent), 'Approve decisions (1)');
      assert.strictEqual(await page.$eval('#approveEnd', (b) => b.textContent), 'Approve decisions (1)');
      await page.click('#approve');
      await until(async () => (await api('choices'))[q3]?.checked.join() === '0', 'the approved decision');
      await page.waitForFunction(() => $('#approve').disabled && $('#approve').textContent === 'Decisions answered', { timeout: 5000 });
      assert.strictEqual(await page.$$eval('.card.answered', (c) => c.length), 3);
      const ch = cli('choices', 'demo');
      assert.ok(!ch.includes('NO ANSWER YET'), 'every question answered'); assert.match(ch, /\[x\] Read replica/);
      assert.match(cli('pending', 'demo'), /D3: What do we turn on now\?: on: Point-in-time recovery/);
    });

    await step('CLI pending lists what waits for Claude and drops answered threads', async () => {
      const pending = cli('pending', 'demo');
      assert.match(pending, /request: Add a rollback step\./); assert.match(pending, /request: draft that must survive/);
      assert.ok(!pending.includes('Is 200 customers'), 'the replied comment is no longer pending');
      cli('resolve', mouseComment.id); assert.ok(!cli('pending', 'demo').includes('draft that must survive'), 'resolve removes it');
    });

    await step('a pasted image becomes a file, never base64 in the JSON', async () => {
      const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const r = await page.evaluate((d) => post('/attachment', { data: d }), png);
      assert.ok(fs.existsSync(r.path) && r.url.startsWith('/attachments/demo/'), 'file on disk');
      await page.evaluate((a, id) => post('/reply', { id, text: 'see the screenshot', attachments: [a] }), r, firstComment.id);
      const json = fs.readFileSync(path.join(DIR, 'demo', 'comments.json'), 'utf8');
      assert.ok(json.includes(r.url) && !json.includes('base64'), 'only the link is stored');
    });

    await step('foreign hosts, cross-site calls and secret files are refused', async () => {
      assert.strictEqual(await raw('/api/demo/doc', { Host: 'attacker.example' }), 403);
      assert.strictEqual(await raw('/api/demo/doc', { 'Sec-Fetch-Site': 'cross-site' }), 403);
      assert.strictEqual(await raw('/view?p=' + encodeURIComponent('~/.ssh/id_rsa')), 404);
      assert.strictEqual(await raw('/view?p=' + encodeURIComponent('/etc/hosts')), 404);
    });

    await step('no JavaScript errors on the page', async () => { assert.deepStrictEqual(pageErrors, []); });
  } finally {
    if (browser) await browser.close();
    server.kill();
    fs.rmSync(DIR, { recursive: true, force: true });
  }
  console.log(failures.length ? `\n${failures.length} failed` : '\nall passed');
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
