// Records docs/demo.gif and the screenshots in docs/ from examples/demo.md.
// It starts its own server on a spare port with a temporary data folder, drives the page with puppeteer-core
// (1280x800), plays Claude's side through the CLI and assembles the frames with ffmpeg.
//
//   npm install && npm run demo
//
// Environment: CHROME (path to Chrome), FFMPEG (default: ffmpeg on the PATH), VIBE_UI_PORT (default 7798).
'use strict';
const { spawn, execFileSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const puppeteer = require('puppeteer-core');

const CHROME = process.env.CHROME || { darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', win32: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' }[process.platform] || '/usr/bin/google-chrome';
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const ROOT = path.join(__dirname, '..'); const CLI = path.join(ROOT, 'bin', 'vibe-ui'); const OUT = path.join(ROOT, 'docs');
const PORT = Number(process.env.VIBE_UI_PORT) || 7798;
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-ui-demo-'));
const FRAMES = path.join(DIR, 'frames'); fs.mkdirSync(FRAMES);
const env = { ...process.env, VIBE_UI_DIR: path.join(DIR, 'docs'), VIBE_UI_PORT: String(PORT) };
const cli = (...a) => execFileSync(process.execPath, [CLI, ...a], { env, encoding: 'utf8' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const up = () => new Promise((ok) => http.get({ host: '127.0.0.1', port: PORT, path: '/' }, (r) => { r.resume(); ok(true); }).on('error', () => ok(false)));

// a visible mouse pointer (headless screenshots have none) and a ring on every click
const CURSOR = `addEventListener('DOMContentLoaded',()=>{const c=document.createElement('div');
c.innerHTML='<svg width="22" height="26" viewBox="0 0 22 26"><path d="M2 2 L2 21 L7 16.5 L10.5 24 L14 22.5 L10.5 15 L17 15 Z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
c.id='demo-pointer';c.style.cssText='position:fixed;left:-40px;top:-40px;z-index:99999;pointer-events:none;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))';document.documentElement.appendChild(c);
addEventListener('mousemove',e=>{c.style.left=(e.clientX-2)+'px';c.style.top=(e.clientY-2)+'px'},true);
addEventListener('mousedown',e=>{const r=document.createElement('div');r.style.cssText='position:fixed;z-index:99998;pointer-events:none;width:30px;height:30px;border-radius:50%;border:3px solid rgba(29,99,166,.6);left:'+(e.clientX-15)+'px;top:'+(e.clientY-15)+'px;transition:transform .45s,opacity .45s';document.documentElement.appendChild(r);requestAnimationFrame(()=>{r.style.transform='scale(1.7)';r.style.opacity='0'});setTimeout(()=>r.remove(),600)},true)})`;

(async () => {
  if (await up()) throw new Error(`port ${PORT} is busy; set VIBE_UI_PORT`);
  cli('publish', 'demo', path.join(ROOT, 'examples', 'demo.md'));
  const server = spawn(process.execPath, [CLI, 'serve'], { env, stdio: 'ignore' });
  while (!(await up())) await sleep(100);
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--window-size=1280,800', '--hide-scrollbars', ...(process.platform === 'linux' ? ['--no-sandbox'] : [])] });
  try {
    const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 800 });
    await page.evaluateOnNewDocument(CURSOR);
    await page.goto(`http://localhost:${PORT}/demo`); await page.waitForSelector('.card');
    await page.evaluate(() => document.fonts.ready); await page.waitForSelector('.mermaid svg', { timeout: 10000 }).catch(() => {}); await sleep(800);

    // frame grabber: screenshots in a loop, each with its own time, so the gif keeps the real pace
    const frames = []; let recording = true;
    const grab = (async () => { while (recording) { const f = path.join(FRAMES, String(frames.length).padStart(5, '0') + '.png'); await page.screenshot({ path: f }); frames.push({ f, t: Date.now() }); } })();
    let pos = { x: 1000, y: 140 };
    const glide = async (x, y, ms = 600) => { const n = Math.max(8, Math.round(ms / 16)); const a = { ...pos }; for (let i = 1; i <= n; i++) { const k = i / n, e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; await page.mouse.move(a.x + (x - a.x) * e, a.y + (y - a.y) * e); await sleep(16); } pos = { x, y }; };
    const clickAt = async (x, y, ms) => { await glide(x, y, ms); await page.mouse.down(); await sleep(70); await page.mouse.up(); };
    const center = (sel) => page.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    const scrollTo = async (y, ms = 900) => { const from = await page.evaluate(() => scrollY); const n = Math.round(ms / 16); for (let i = 1; i <= n; i++) { const k = i / n, e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; await page.evaluate((v) => scrollTo(0, v), from + (y - from) * e); await sleep(16); } };
    const ids = await page.evaluate(() => ({ intro: DOC.blocks.find((b) => b.html.startsWith('<p>Start with')).id, choice: DOC.blocks.filter((b) => b.type === 'choice').map((b) => b.id) }));
    await page.mouse.move(pos.x, pos.y);
    await sleep(1600);

    // 1. select a passage and comment on it
    const phrase = await page.evaluate((id) => {
      const p = document.querySelector('.blk[data-b="' + id + '"] p'); const t = p.firstChild; const k = t.nodeValue.indexOf('the team already knows SQL');
      const r = document.createRange(); r.setStart(t, k); r.setEnd(t, k + 'the team already knows SQL'.length); const rs = [...r.getClientRects()];
      return { x1: rs[0].left + 1, y1: rs[0].top + rs[0].height / 2, x2: rs.at(-1).right - 1, y2: rs.at(-1).top + rs.at(-1).height / 2 };
    }, ids.intro);
    await glide(phrase.x1, phrase.y1, 900); await page.mouse.down();
    await glide(phrase.x2, phrase.y2, 700); await page.mouse.up(); await sleep(700);
    const btn = await center('#commentSel'); await clickAt(btn.x, btn.y, 500); await sleep(500);
    await page.keyboard.type('Are we sure? Two of us only use the ORM, not raw SQL.', { delay: 38 }); await sleep(500);
    await page.keyboard.down('Control'); await page.keyboard.press('Enter'); await page.keyboard.up('Control');
    await sleep(1500);

    // 2. Claude answers in the thread and edits the block (played through the CLI, as Claude would)
    const comment = JSON.parse(fs.readFileSync(path.join(env.VIBE_UI_DIR, 'demo', 'comments.json'), 'utf8')).at(-1);
    cli('reply', comment.id, 'Fair point. The ORM works the same on Postgres, and the monthly report is a single SQL view I can write. I will reword the sentence.');
    await sleep(2600);
    cli('edit', 'demo', ids.intro, 'Start with managed Postgres: it fits the joins and monthly reports this app needs, and it works with the ORM the team already uses.', '--comment', comment.id, '--reason', 'the team uses an ORM');
    await sleep(3400);
    fs.copyFileSync(frames.at(-1).f, path.join(OUT, 'screenshot-thread.png'));

    // 3. tick choices in the cards and approve the rest
    const cardTop = (blk) => page.evaluate((id) => document.querySelector('.blk[data-b="' + id + '"]').closest('.card').getBoundingClientRect().top + scrollY, blk);
    const pick = async (blk, n, ms) => { const c = await center(`.blk[data-b="${blk}"] .opt:nth-child(${n})`); await clickAt(c.x - 120, c.y, ms); };
    await scrollTo((await cardTop(ids.choice[0])) - 90, 1200); await sleep(900);
    await pick(ids.choice[1], 4, 900); await sleep(1100);
    await scrollTo((await cardTop(ids.choice[1])) - 90, 800); await sleep(500);
    await pick(ids.choice[2], 2, 800); await sleep(1300);
    const ap = await center('#approve'); await clickAt(ap.x, ap.y, 900); await sleep(1800);
    await scrollTo((await cardTop(ids.choice[0])) - 90, 900); await sleep(2400);
    recording = false; await grab;

    // screenshots for the README (the pointer is hidden)
    await page.evaluate(() => { document.getElementById('demo-pointer').style.display = 'none'; });
    await page.screenshot({ path: path.join(OUT, 'screenshot-choices.png') });
    await scrollTo(0, 10); await sleep(300);
    await page.evaluate((id) => showHistory(id), ids.intro); await sleep(600);
    await page.screenshot({ path: path.join(OUT, 'screenshot-history.png') });

    // assemble the gif: every frame lasts until the next one was taken
    const list = frames.map((fr, i) => `file '${fr.f}'\nduration ${(((frames[i + 1] || { t: fr.t + 1500 }).t - fr.t) / 1000).toFixed(3)}`).join('\n') + `\nfile '${frames.at(-1).f}'\n`;
    fs.writeFileSync(path.join(DIR, 'frames.txt'), list);
    const gif = path.join(OUT, 'demo.gif');
    execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(DIR, 'frames.txt'),
      '-vf', 'fps=12,split[a][b];[a]palettegen=max_colors=160:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle', '-loop', '0', gif]);
    console.log(`${frames.length} frames, ${((frames.at(-1).t - frames[0].t) / 1000).toFixed(1)} s, ${(fs.statSync(gif).size / 1048576).toFixed(2)} MB -> ${path.relative(ROOT, gif)}`);
    if (process.env.KEEP_FRAMES) console.log('frames kept in', FRAMES);
  } finally {
    await browser.close(); server.kill();
    if (!process.env.KEEP_FRAMES) fs.rmSync(DIR, { recursive: true, force: true });
  }
})().catch((e) => { console.error(e); process.exit(1); });
