/**
 * tools/render-audio.mjs — Build-time renderer for Dial's phone audio.
 *
 * Renders generative tracks to MP3 via the engine's offline renderer
 * (puppeteer + real Chromium OfflineAudioContext), then encodes with
 * ffmpeg. Output lands in public/audio/<id>.mp3, which vite copies into
 * dist/ and the daemon serves over HTTP for the phone to fetch.
 *
 * The rendered WAV is POSTed from the page as binary (puppeteer's
 * evaluate return path can't transfer Float32Arrays intact).
 *
 * Usage: node tools/render-audio.mjs [t01,t02,...]  (default: all TRACKS)
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(root, 'public', 'audio');
fs.mkdirSync(outDir, { recursive: true });

const lib = await import(path.join(root, 'src/core/library.js'));
const all = lib.TRACKS;
const arg = process.argv[2];
const tracks = arg ? all.filter((t) => arg.split(',').includes(t.id)) : all;
if (!tracks.length) { console.error('no tracks matched'); process.exit(1); }

const uploads = new Map(); // id -> { resolve, chunks }
const server = http.createServer((req, res) => {
  const m = /^\/upload\/([a-z0-9]+)$/.exec(req.url || '');
  if (req.method === 'POST' && m) {
    const id = m[1];
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const entry = uploads.get(id);
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
      if (entry) entry.resolve(Buffer.concat(chunks));
    });
    return;
  }
  let p = path.join(root, decodeURIComponent((req.url || '/').split('?')[0]));
  if (req.url === '/' || req.url === '/r.html') p = path.join(root, 'tools/render-page.html');
  fs.readFile(p, (e, d) => {
    if (e) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html' : 'text/javascript' });
    res.end(d);
  });
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
await page.goto(`http://localhost:${port}/r.html`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__renderReady === true', { timeout: 15000 });

for (const t of tracks) {
  const secs = t.durationSec || 150;
  process.stdout.write(`render ${t.id} (${t.title}) ${secs}s ... `);
  const wavPromise = new Promise((resolve) => uploads.set(t.id, { resolve }));
  await page.evaluate(async (trackId, seconds, upPort) => {
    const eng = await import('./src/audio/engine.js');
    const libm = await import('./src/core/library.js');
    const track = libm.TRACK_BY_ID.get(trackId);
    const buf = await eng.renderTrack(track, seconds);
    const n = buf.length;
    const ch0 = buf.getChannelData(0);
    const ch1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : ch0;
    // Interleaved stereo float32 WAV.
    const ab = new ArrayBuffer(44 + n * 2 * 4);
    const dv = new DataView(ab);
    const wstr = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    wstr(0, 'RIFF'); dv.setUint32(4, 36 + n * 8, true); wstr(8, 'WAVE');
    wstr(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 3, true);
    dv.setUint16(22, 2, true); dv.setUint32(24, buf.sampleRate, true);
    dv.setUint32(28, buf.sampleRate * 8, true); dv.setUint16(32, 8, true); dv.setUint16(34, 32, true);
    wstr(36, 'data'); dv.setUint32(40, n * 8, true);
    const f32 = new Float32Array(ab, 44);
    for (let i = 0; i < n; i++) {
      const a = Math.max(-1, Math.min(1, ch0[i]));
      const b = Math.max(-1, Math.min(1, ch1[i]));
      f32[i * 2] = a; f32[i * 2 + 1] = b;
    }
    await fetch(`http://localhost:${upPort}/upload/${trackId}`, { method: 'POST', body: ab });
    return true;
  }, t.id, secs, port);
  const wavBuf = await wavPromise;
  uploads.delete(t.id);
  const wavPath = path.join(outDir, `${t.id}.wav`);
  const mp3Path = path.join(outDir, `${t.id}.mp3`);
  fs.writeFileSync(wavPath, wavBuf);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', wavPath, '-codec:a', 'libmp3lame', '-b:a', '96k', mp3Path]);
  fs.unlinkSync(wavPath);
  const kb = Math.round(fs.statSync(mp3Path).size / 1024);
  console.log(`done (${kb} KB)`);
}

await browser.close();
server.close();
console.log(`\n${tracks.length} track(s) in ${outDir}`);
