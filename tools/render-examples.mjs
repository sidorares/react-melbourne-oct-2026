// Renders the follow-along examples headlessly, into node-x11's in-process
// X server, and saves what each window shows: the screenshots on the
// "Try it" slides (public/img/hello.png, counter.png, todo.png).
//
//   cd examples && npm install
//   node --import tsx ../tools/render-examples.mjs [font.ttf]
//
// Each example is run unchanged except for one line: `createRoot()` gets the
// in-process connection instead of opening the desktop's. The counter is
// clicked and the to-do list typed into through their own handlers before
// the second capture. Default font: Arial from macOS.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const examples = `${here}../examples/`;
const require = createRequire(`${examples}package.json`);
const xserver = (await import(require.resolve('x11/lib/xserver/index.js'))).default;
const { createClient, StaticFontSource } = await import(require.resolve('ntk'));
const { PNG } = require('pngjs');

const fontFile = process.argv[2] ?? '/System/Library/Fonts/Supplemental/Arial.ttf';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function find(node, pred) {
  if (pred(node)) return node;
  for (const child of node.children ?? []) {
    const hit = find(child, pred);
    if (hit) return hit;
  }
  return null;
}

async function capture(app, name) {
  const win = app._rootChildren[0];
  win._scheduled = false;
  win.flush?.();
  await wait(300);
  const wnd = win.window;
  const ctx = wnd.getContext('2d');
  const img = await new Promise((resolve, reject) =>
    ctx.getImageData(0, 0, wnd.width, wnd.height, (e, d) => (e ? reject(e) : resolve(d))),
  );
  const png = new PNG({ width: wnd.width, height: wnd.height });
  png.data.set(img.data);
  for (let i = 3; i < png.data.length; i += 4) png.data[i] = 255;
  const out = `${here}../public/img/${name}.png`;
  writeFileSync(out, PNG.sync.write(png));
  console.log(`wrote ${out}`);
}

for (const name of ['hello', 'counter', 'todo']) {
  const server = xserver.createServer({ width: 800, height: 600 });
  const [serverEnd, clientEnd] = xserver.createStreamPair();
  server.addClientStream(serverEnd);
  const fonts = new StaticFontSource();
  fonts.add(readFileSync(fontFile), { family: 'UI Sans' });
  fonts.alias('sans-serif', 'UI Sans');
  const app = await createClient({ stream: clientEnd, fontSource: fonts });
  globalThis.__app = app;

  // the example, with createRoot() pointed at the in-process server
  const source = readFileSync(`${examples}${name}.jsx`, 'utf8').replace(
    'await createRoot()',
    'await createRoot({ app: globalThis.__app })',
  );
  const tmp = `${examples}.render-${name}.jsx`;
  writeFileSync(tmp, source);
  await import(pathToFileURL(tmp).href);
  await wait(500);
  const win = app._rootChildren[0];

  if (name === 'counter') {
    find(win, (n) => n.props?.onClick).props.onClick({});
    await wait(100);
  }
  if (name === 'todo') {
    const input = () => find(win, (n) => n.kind === 'textinput');
    input().props.onChange({ value: 'Show the demo' });
    await wait(100);
    input().props.onSubmit({});
    await wait(100);
    input().props.onChange({ value: 'Ask quest' });
    await wait(100);
  }
  await capture(app, name);
  (await import('node:fs')).rmSync(tmp);
  app.close?.();
}
process.exit(0);
