#!/usr/bin/env node
/* Portrait gameplay video for the TapTap store page, recorded from the real game.

     node crispy-squishy/tools/record-video.cjs    # crispy-squishy/store/gameplay-1080x1920.mp4

   TapTap asks for at least 15 s, a short side of at least 540 px and core play within the first
   5 s, with no voice-over, subtitles or picture-in-picture. The clip opens on a blueberry and it
   is cracked open within the first two seconds; then a strawberry is dipped twice and put on the
   shelf, and a fizzy drink is squeezed. The only words on screen are the game's own interface.
   Needs Node 22+, Chrome and ffmpeg with libx264. */
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const {execFileSync} = require('node:child_process');
const {game, repo, sleep, gameSession} = require('./lib/chrome.cjs');

const output = path.join(game, 'store/gameplay-1080x1920.mp4');

async function main() {
  const frames = fs.mkdtempSync(path.join(os.tmpdir(), 'crispy-video-'));
  const s = await gameSession({width: 360, height: 640, deviceScaleFactor: 3, mobile: true}), {send, on, evaluate, click} = s;
  const recorded = []; let recording = false;
  on('Page.screencastFrame', ({data, metadata, sessionId}) => {
    send('Page.screencastFrameAck', {sessionId}).catch(() => {});
    if (!recording) return;
    const file = path.join(frames, `f${String(recorded.length).padStart(5, '0')}.jpg`);
    fs.writeFileSync(file, Buffer.from(data, 'base64')); recorded.push({file, t: metadata.timestamp});
  });
  const scroll = y => evaluate(`scrollTo({top:${y},behavior:'smooth'});await wait(450)`);
  try {
    await s.open({toy: 'berry', coins: 132});
    await send('Page.startScreencast', {format: 'jpeg', quality: 90, maxWidth: 1080, maxHeight: 1920, everyNthFrame: 1});
    recording = true; await sleep(600);

    // Crack the blueberry open, then knead what is left.
    await evaluate(`await press(0.43,0.43,360);await press(0.6,0.55,320);await press(0.48,0.62,300);
      for(const [x,y] of [[0.38,0.5],[0.56,0.4],[0.62,0.48],[0.45,0.36],[0.52,0.52],[0.36,0.6],[0.64,0.62]])await press(x,y,240);`);
    await sleep(600);

    // Make a strawberry, dip it twice more, and put it on the shelf.
    await scroll(230); await click('#t-strawberry'); await sleep(500); await scroll(0); await sleep(700);
    await click('#dip'); await sleep(900); await click('#dip'); await sleep(1000);
    await click('#sell'); await sleep(900);
    await click('[data-tab="shelf"]'); await sleep(400); await scroll(170); await sleep(1500);

    // A fizzy drink: squeeze until it bursts.
    await click('[data-tab="toys"]'); await sleep(300); await scroll(330); await click('#t-soda'); await sleep(400); await scroll(0); await sleep(700);
    await evaluate(`await press(0.45,0.44,420);await press(0.58,0.56,360);await press(0.5,0.5,400);await press(0.4,0.58,300);await press(0.6,0.42,300);`);
    await sleep(1400);
    recording = false; await send('Page.stopScreencast');
    if (s.errors.length) throw new Error('page errors: ' + s.errors.join('\n'));
  } finally { s.close(); }

  if (recorded.length < 100) throw new Error('too few frames recorded: ' + recorded.length);
  const list = recorded.map((f, i) => {
    const next = recorded[i + 1]?.t ?? f.t + 1 / 30;
    return `file '${f.file}'\nduration ${Math.max(next - f.t, 1 / 60).toFixed(4)}`;
  }).join('\n') + `\nfile '${recorded.at(-1).file}'\n`;
  fs.writeFileSync(path.join(frames, 'list.txt'), list);
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(frames, 'list.txt'),
    '-vf', 'fps=30,scale=1080:1920:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-profile:v', 'high', '-crf', '20', '-preset', 'slow',
    '-an', '-movflags', '+faststart', output], {stdio: 'inherit'});
  const seconds = recorded.at(-1).t - recorded[0].t;
  // keep three frames for a quick look without playing the file
  for (const [i, k] of [[1, 0.08], [2, 0.5], [3, 0.93]]) fs.copyFileSync(recorded[Math.floor(recorded.length * k)].file, path.join(repo, `dist/art/video-frame-${i}.jpg`));
  fs.rmSync(frames, {recursive: true, force: true});
  console.log(`${path.relative(repo, output)}  ${seconds.toFixed(1)}s  ${(fs.statSync(output).size / 1048576).toFixed(1)}MB  ${recorded.length} frames (${(recorded.length / seconds).toFixed(0)} fps captured)`);
}
main().catch(e => { console.error(e.message); process.exit(1); });
