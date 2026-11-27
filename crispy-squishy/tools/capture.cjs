#!/usr/bin/env node
/* Store screenshots and the raw pictures for the icon and banners, taken from the real game.

     node crispy-squishy/tools/capture.cjs        # Node 22+, Chrome
     python3 crispy-squishy/tools/compose-art.py  # then build the icon and banners

   Screenshots are the page as a phone shows it (360x640 CSS px at 3x = 1080x1920), with nothing
   added. Every state is reached by playing: presses on the toy and taps on the game's own buttons. */
const fs = require('node:fs'), path = require('node:path');
const {game, repo, sleep, gameSession} = require('./lib/chrome.cjs');

const shots = path.join(game, 'store/screenshots'), raw = path.join(repo, 'dist/art');
fs.mkdirSync(shots, {recursive: true}); fs.mkdirSync(raw, {recursive: true});

async function screenshots() {
  const s = await gameSession({width: 360, height: 640, deviceScaleFactor: 3, mobile: true});
  const {send, evaluate, click} = s;
  let n = 0;
  const shot = async name => {
    const {data} = await send('Page.captureScreenshot', {format: 'jpeg', quality: 93});
    const file = path.join(shots, `${String(++n).padStart(2, '0')}-${name}.jpg`);
    fs.writeFileSync(file, Buffer.from(data, 'base64')); console.log('  ' + path.relative(repo, file));
  };
  const top = y => evaluate(`scrollTo(0,${y});await wait(250)`);
  try {
    // 1. A fresh strawberry on the bench.
    await s.open({toy: 'strawberry'}); await top(0); await shot('fresh');

    // 2. Mid-squeeze: the shell cracks and the filling squirts.
    await s.open({toy: 'berry'});
    await evaluate(`await press(0.42,0.42,300);fire('pointerdown',0.6,0.56);await wait(260)`);
    await shot('crack');
    await evaluate(`fire('pointerup',0.6,0.56)`);

    // 3. Caramel toast squeezed open: cream, shards stuck to it, beans earned.
    await s.open({toy: 'toast', coat: 'caramel'});
    await evaluate(`for(const [x,y] of [[0.45,0.42],[0.58,0.55],[0.4,0.6],[0.55,0.38],[0.5,0.5],[0.62,0.44],[0.36,0.48]])await press(x,y,250);await wait(500)`);
    await shot('squeezed');

    // 4. The fizzy drink bursting into bubbles.
    await s.open({toy: 'soda'});
    await evaluate(`await press(0.44,0.44,380);await press(0.58,0.56,320);fire('pointerdown',0.5,0.5);await wait(300)`);
    await shot('fizz');
    await evaluate(`fire('pointerup',0.5,0.5)`);

    // 5. Coatings: a matcha-milk egg dipped three times.
    await s.open({toy: 'egg', coat: 'matcha'});
    await click('#dip'); await sleep(900); await click('#dip'); await sleep(900);
    await click('[data-tab="coats"]'); await sleep(300); await top(150); await shot('coatings');

    // 6. The shelf: one sold, one waiting for a customer.
    await s.open({toy: 'popsicle', shelf: [{toy: 'pudding', coat: 'caramel', layers: 3, price: 125, inMs: -1000}, {toy: 'bao', coat: 'plain', layers: 2, price: 54, inMs: 47000}]});
    await click('[data-tab="shelf"]'); await sleep(300); await top(150); await shot('shelf');

    // 7. Everything there is to collect.
    await s.open({toy: 'friedegg'});
    await top(300); await shot('collection');

    // 8. The daily stamp.
    await s.open({toy: 'chocobar'});
    await click('[data-tab="sign"]'); await sleep(300); await top(150); await shot('sign-in');
    if (s.errors.length) throw new Error('page errors: ' + s.errors.join('\n'));
  } finally { s.close(); }
}

// The toy alone: interface labels hidden, stage square-cornered. Used for the icon and banners.
async function art() {
  const s = await gameSession({width: 600, height: 900, deviceScaleFactor: 2.4, mobile: true},
    {css: '.tag,.hint{display:none!important}.stage-box{border-radius:0!important}'});
  const {send, evaluate} = s;
  const clip = () => evaluate(`const r=document.getElementById('stage').getBoundingClientRect();return {x:r.left+scrollX,y:r.top+scrollY,width:r.width,height:r.height,scale:1}`);
  const save = (name, data) => { const file = path.join(raw, name); fs.writeFileSync(file, Buffer.from(data, 'base64')); console.log('  ' + path.relative(repo, file)); };
  try {
    // Icon: a cracked blueberry with its filling out, on the game's own stage.
    await s.open({toy: 'berry'});
    await evaluate(`await press(0.43,0.44,330);await press(0.6,0.55,280);await wait(1600)`);
    save('icon-src.png', (await send('Page.captureScreenshot', {format: 'png', clip: await clip()})).data);

    // Cut-outs with a transparent background, straight from the game's canvas.
    const cut = async (name, save0, play = '') => {
      await s.open(save0);
      await evaluate(`${play};await wait(1500)`);
      save(`cut-${name}.png`, (await evaluate(`return document.getElementById('stage').toDataURL('image/png')`)).split(',')[1]);
    };
    await cut('popsicle', {toy: 'popsicle'});
    await cut('strawberry', {toy: 'strawberry'});
    await cut('berry', {toy: 'berry'}, `await press(0.43,0.44,330);await press(0.6,0.55,280)`);
    await cut('friedegg', {toy: 'friedegg'});
    await cut('soda', {toy: 'soda'});
    await cut('toast', {toy: 'toast', coat: 'caramel'});
    await cut('pudding', {toy: 'pudding'});
    if (s.errors.length) throw new Error('page errors: ' + s.errors.join('\n'));
  } finally { s.close(); }
}

(async () => {
  console.log('screenshots'); await screenshots();
  console.log('icon and cut-outs'); await art();
})().catch(e => { console.error(e.message); process.exit(1); });
