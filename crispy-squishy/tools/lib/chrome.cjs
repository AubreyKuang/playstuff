/* Shared by the screenshot, store-art and video scripts: a static server for the game folder and
   headless Chrome over the DevTools protocol (Node 22+ for the global WebSocket). */
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), os = require('node:os');
const {spawn} = require('node:child_process');

const game = path.resolve(__dirname, '../..');            // crispy-squishy/
const repo = path.resolve(game, '..');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const TOYS = ['egg', 'block', 'berry', 'toast', 'strawberry', 'mochi', 'popsicle', 'mango', 'bao', 'pudding', 'friedegg', 'chocobar', 'soda', 'onigiri', 'yolkpastry', 'heart', 'star', 'cat', 'bear'];
const COATS = ['plain', 'milk', 'choco', 'matcha', 'caramel', 'berrymilk'];

// Runs before the game's own script on every load: a fixed random sequence, so pictures can be
// reproduced, and a save with everything unlocked, built in the page so shelf timers are current.
function preload({toy = 'strawberry', coat = 'plain', coins = 486, shelf = [], slots = 3} = {}) {
  return `{let s=20261127;Math.random=()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296};}
    try{localStorage.setItem('crispy-shop-v2',JSON.stringify({coins:${coins},toys:${JSON.stringify(TOYS)},coats:${JSON.stringify(COATS)},slots:${slots},
      shelf:${JSON.stringify(shelf)}.map(it=>({est:it.price,tag:'正常成交',...it,listedAt:Date.now()+it.inMs-(it.tookMs||600000),readyAt:Date.now()+it.inMs})),sign:{last:'',streak:0},ads:{day:'',free:0},toy:${JSON.stringify(toy)},coat:${JSON.stringify(coat)},made:12}))}catch(e){}`;
}

function serve() {
  const types = {'.html': 'text/html; charset=utf-8', '.json': 'application/json'};
  const server = http.createServer((req, res) => {
    const file = path.join(game, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!file.startsWith(game) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, {'content-type': types[path.extname(file)] || 'application/octet-stream'}); fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function chrome() {
  if (typeof WebSocket === 'undefined') throw new Error('Node 22 or newer is required');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'crispy-chrome-'));
  const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check',
    '--hide-scrollbars', '--mute-audio', '--autoplay-policy=no-user-gesture-required', `--user-data-dir=${profile}`, 'about:blank'], {stdio: ['ignore', 'ignore', 'pipe']});
  const port = await new Promise((resolve, reject) => {
    let log = ''; proc.stderr.on('data', d => { log += d; const m = log.match(/DevTools listening on ws:\/\/[^:]+:(\d+)/); if (m) resolve(m[1]); });
    proc.on('exit', () => reject(new Error('Chrome exited:\n' + log)));
  });
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const ws = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r, {once: true}));
  let id = 0; const waiting = new Map(), listeners = new Map();
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.method) { for (const fn of listeners.get(m.method) || []) fn(m.params); return; }
    if (waiting.has(m.id)) { const {resolve, reject} = waiting.get(m.id); waiting.delete(m.id); m.error ? reject(new Error(m.error.message)) : resolve(m.result); }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; waiting.set(n, {resolve, reject}); ws.send(JSON.stringify({id: n, method, params})); });
  const on = (method, fn) => { if (!listeners.has(method)) listeners.set(method, []); listeners.get(method).push(fn); };
  const close = () => { ws.close(); proc.on('exit', () => { try { fs.rmSync(profile, {recursive: true, force: true}); } catch { /* Chrome may still be flushing its profile. */ } }); proc.kill(); };
  const evaluate = async expression => {
    const r = await send('Runtime.evaluate', {expression: `(async()=>{${expression}})()`, awaitPromise: true, returnByValue: true});
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  return {send, on, evaluate, close};
}

// Opens the game; `save` picks the starting toy, coating and shelf, `css` is added to the page.
async function gameSession(viewport, {save = {}, css = ''} = {}) {
  const server = await serve(), url = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await chrome(), {send, evaluate} = browser;
  const errors = [];
  browser.on('Runtime.exceptionThrown', ({exceptionDetails}) => errors.push(exceptionDetails.exception?.description || exceptionDetails.text));
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', viewport);
  if (viewport.mobile) await send('Emulation.setTouchEmulationEnabled', {enabled: true, maxTouchPoints: 5});
  let script = null;
  const open = async (nextSave = save) => {
    if (script) await send('Page.removeScriptToEvaluateOnNewDocument', {identifier: script});
    script = (await send('Page.addScriptToEvaluateOnNewDocument', {source: preload(nextSave)})).identifier;
    await send('Page.navigate', {url});
    for (let i = 0; i < 100; i++) { await sleep(100); if (await evaluate(`return document.readyState==="complete"`).catch(() => false)) break; }
    if (css) await evaluate(`const s=document.createElement('style');s.textContent=${JSON.stringify(css)};document.head.appendChild(s)`);
    // Presses on the toy, given as fractions of the stage. The game listens for pointer events.
    await evaluate(`const cv=document.getElementById('stage');
      window.fire=(type,x,y,id=1)=>{const r=cv.getBoundingClientRect();cv.dispatchEvent(new PointerEvent(type,{pointerId:id,clientX:r.left+x*r.width,clientY:r.top+y*r.height,bubbles:true,cancelable:true,pointerType:'touch',isPrimary:true}));};
      window.wait=ms=>new Promise(r=>setTimeout(r,ms));
      window.press=async(x,y,ms=260)=>{fire('pointerdown',x,y);await wait(ms);fire('pointerup',x,y);await wait(170);};`);
    await sleep(900);
  };
  const click = async selector => {
    const box = await evaluate(`const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error("no element "+${JSON.stringify(JSON.stringify(selector))});
      e.scrollIntoView({block:"nearest"});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}`);
    for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', {type, x: box.x, y: box.y, button: 'left', clickCount: 1});
  };
  const close = () => { browser.close(); server.close(); };
  return {...browser, url, errors, open, click, close};
}

module.exports = {game, repo, sleep, gameSession, TOYS, COATS};
