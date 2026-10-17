// Mockup / prototype capture from the live build.
// usage: node scripts/mockup-capture.mjs <jobs.json> <device> <w> <h> <dpr>
// jobs: [{ url, out, theme, js?, full? }]. full = whole page length (prototype frames). Per job: sets the theme, hides demo labels
// (Oct 14 rule: no DEMO / "Live demo" in any prototype or mockup), switches every
// chart to its trend line except Leads (Oct 12), runs the job's own js (e.g. open
// Team chat, scroll), then screenshots the viewport.
// Desktop mockups are the 1440 design at density = export width / 1440:
//   13" 1440 936 1.7777778 · 16" 1440 931 2.4 · 5K 1440 810 3.5555556 · iPhone 402 786 3
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
const [jobsFile, device, w, h, dpr] = process.argv.slice(2);
const jobs = JSON.parse(readFileSync(jobsFile, 'utf8'));
const port = 9500 + Math.floor(Math.random() * 300);
const profile = `/tmp/growth-cap-${process.pid}`;
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`, `--window-size=${w},${h}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
for (let i = 0; i < 60 && !ws; i++) { try { const p = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); if (p) ws = new WebSocket(p.webSocketDebuggerUrl); } catch {} await sleep(200); }
if (ws.readyState !== 1) await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Page.enable'); await send('Runtime.enable');
const mobile = device === 'iphone';
await send('Emulation.setDeviceMetricsOverride', { width: +w, height: +h, deviceScaleFactor: +dpr, mobile });
if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true });
let script = null;
for (const j of jobs) {
  if (script) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: script });
  const r0 = await send('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('growth.theme','${j.theme}');localStorage.setItem('growth.welcome.v1','1');}catch(e){} document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent='.gr-demo-tag,.gr-welcome__pill{display:none!important}';document.head.appendChild(s);});` });
  script = r0.result?.identifier;
  await send('Page.navigate', { url: j.url });
  await sleep(2600);
  const r = await send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression: `(async()=>{
    await document.fonts.ready;
    const out = [];
    for (const ch of document.querySelectorAll('.gr-chart')) {
      const title = (ch.querySelector('.gr-chart__title, h2, h3')?.textContent || '').trim();
      const line = ch.querySelector('button[title="Line"]');
      if (!/^Leads/i.test(title) && line && line.getAttribute('aria-pressed') !== 'true') { line.click(); out.push('line:' + title); }
    }
    await new Promise(r => setTimeout(r, 500));
    ${j.js || ''}
    await new Promise(r => setTimeout(r, 400));
    return out.join(' | ') + ' || ' + (document.querySelector('h1')?.textContent || '');
  })()` });
  if (j.full) {
    /* Full length (prototype frames): the shell is fixed to the viewport and
       only the content column scrolls, so grow the viewport by however far the
       tallest scroller can scroll, then shoot. CAP keeps it sane. */
    const m = await send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
      let extra = Math.max(0, document.documentElement.scrollHeight - innerHeight);
      for (const el of document.querySelectorAll('*')) {
        const cs = getComputedStyle(el);
        if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) extra = Math.max(extra, el.scrollHeight - el.clientHeight);
      }
      return extra;
    })()` });
    const extra = Math.min(m.result?.result?.value || 0, +(process.env.CAP || 16000));
    await send('Emulation.setDeviceMetricsOverride', { width: +w, height: +h + extra, deviceScaleFactor: +dpr, mobile });
    await sleep(900);
  }
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  if (j.full) await send('Emulation.setDeviceMetricsOverride', { width: +w, height: +h, deviceScaleFactor: +dpr, mobile });
  writeFileSync(j.out, Buffer.from(shot.result.data, 'base64'));
  console.log(device, j.out.split('/').pop(), r.result?.result?.value ?? r.result?.exceptionDetails?.text);
}
chrome.kill(); try { rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(0);
