// Reproduces the Text section's glyph slides: draws a word through ntk into
// node-x11's in-process X server, prints the AddGlyphs and CompositeGlyphs
// requests as they went over the socket, and writes the magnified,
// annotated picture of what the server drew (public/img/type-glyphs.png).
//
//   cd examples && npm install            # brings react-x11, ntk, x11, pngjs
//   node ../tools/capture-glyphs.mjs [font.ttf] [word] [out.png]
//
// Defaults: Arial from macOS, "Type", ../public/img/type-glyphs.png. With
// another font or word the pen lines drawn on the picture (which are for
// "Type" in Arial 32px) will not line up; the printed bytes are always true.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const require = createRequire(`${here}../examples/package.json`);
const xserver = (await import(require.resolve('x11/lib/xserver/index.js'))).default;
const { createClient, StaticFontSource } = await import(require.resolve('ntk'));
const { PNG } = require('pngjs');

const fontFile = process.argv[2] ?? '/System/Library/Fonts/Supplemental/Arial.ttf';
const word = process.argv[3] ?? 'Type';
const out = process.argv[4] ?? `${here}../public/img/type-glyphs.png`;

const server = xserver.createServer({ width: 640, height: 480 });
const [serverEnd, clientEnd] = xserver.createStreamPair();
server.addClientStream(serverEnd);

// tee what the client writes, so the requests can be printed byte for byte
let capture = null;
const write = clientEnd.write.bind(clientEnd);
clientEnd.write = (buf, ...rest) => {
  if (capture && Buffer.isBuffer(buf)) capture.push(Buffer.from(buf));
  return write(buf, ...rest);
};

const fonts = new StaticFontSource();
fonts.add(readFileSync(fontFile), { family: 'Capture' });
const app = await createClient({ stream: clientEnd, fontSource: fonts });
const wnd = app.createWindow({ width: 200, height: 160 });
wnd.map();
const ctx = wnd.getContext('2d');
const sync = () => new Promise((r) => app.X.GetInputFocus(() => r()));
await sync();

const RENDER = app.display.Render.majorOpcode;
const NAMES = { 17: 'CreateGlyphSet', 20: 'AddGlyphs', 23: 'CompositeGlyphs8', 24: 'CompositeGlyphs16', 25: 'CompositeGlyphs32' };

async function draw(label, x, y) {
  capture = [];
  ctx.fillStyle = '#000';
  ctx.font = '32px Capture';
  ctx.fillText(word, x, y);
  await sync();
  const all = Buffer.concat(capture);
  capture = null;
  console.log(`== ${label}: ${all.length} bytes written`);
  for (let off = 0; off + 4 <= all.length; ) {
    let len = all.readUInt16LE(off + 2) * 4;
    if (len === 0) len = all.readUInt32LE(off + 4) * 4; // BIG-REQUESTS
    if (all[off] === RENDER && NAMES[all[off + 1]]) {
      const hex = all.subarray(off, off + len).toString('hex').match(/.{1,8}/g).join(' ');
      console.log(`  ${NAMES[all[off + 1]]} (${len} bytes)\n    ${hex}`);
    }
    off += len;
  }
}

await draw('first draw (uploads the glyphs)', 20, 60);
await draw('second draw (cached)', 20, 100);

// the picture: white background, the word at (20, 100), read back and magnified
ctx.fillStyle = '#ffffff';
ctx.fillRect(0, 0, 200, 160);
ctx.fillStyle = '#000';
ctx.font = '32px Capture';
ctx.fillText(word, 20, 100);
await sync();
await new Promise((r) => setTimeout(r, 200));
await sync();

const X0 = 16, Y0 = 72, W = 76, H = 40, S = 14;
const img = await new Promise((resolve, reject) =>
  ctx.getImageData(X0, Y0, W, H, (e, d) => (e ? reject(e) : resolve(d))),
);
const png = new PNG({ width: W * S, height: H * S });
const bg = [0xfb, 0xfa, 0xf6];
const ink = [0x1a, 0x1f, 0x27];
for (let y = 0; y < H * S; y++) {
  for (let x = 0; x < W * S; x++) {
    const i = (Math.floor(y / S) * W + Math.floor(x / S)) * 4;
    const cov = 255 - img.data[i]; // straight RGBA, black on white
    let px = ink.map((c, k) => Math.round(bg[k] + ((c - bg[k]) * cov) / 255));
    if (x % S === 0 || y % S === 0) {
      px = cov < 20 ? [0xe9, 0xe6, 0xdd] : px.map((c, k) => Math.round(c * 0.9 + [0xd6, 0xd1, 0xc4][k] * 0.1));
    }
    png.data.set([...px, 255], (y * W * S + x) * 4);
  }
}
const put = (x, y, col) => png.data.set([...col, 255], (y * W * S + x) * 4);
const hline = (py, col) => {
  for (let t = -1; t < 2; t++) for (let x = 0; x < W * S; x++) put(x, (py - Y0) * S + t, col);
};
const vline = (px, col, dashed = false) => {
  for (let y = 0; y < H * S; y++) {
    if (dashed && Math.floor(y / 14) % 2) continue;
    for (let t = -1; t < 2; t++) put((px - X0) * S + t, y, col);
  }
};
hline(100, [0x1f, 0x6f, 0xa8]); // baseline
for (const p of [20, 38, 54, 72]) vline(p, [0xa8, 0x4b, 0x0c]); // glyph origins
vline(40, [0xa8, 0x4b, 0x0c], true); // where y would start without the kern
writeFileSync(out, PNG.sync.write(png));
console.log(`wrote ${out}`);
process.exit(0);
