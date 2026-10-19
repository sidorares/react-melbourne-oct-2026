// Compile slide files and report MDX syntax errors, without a full build.
//   node scripts/check-mdx.mjs src/slides/05-phases.mdx [more files…]
//   node scripts/check-mdx.mjs            (every file in src/slides)
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from '@mdx-js/mdx';
import remarkGfm from 'remark-gfm';

const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync('src/slides')
      .filter((f) => f.endsWith('.mdx'))
      .map((f) => join('src/slides', f));

let failed = 0;
for (const file of files) {
  try {
    await compile(readFileSync(file, 'utf8'), { remarkPlugins: [remarkGfm] });
    const slides = (readFileSync(file, 'utf8').match(/^<Slide[\s>]/gm) ?? []).length;
    console.log(`ok   ${file} (${slides} slides)`);
  } catch (err) {
    failed++;
    console.log(`FAIL ${file}: ${err.message}`);
  }
}
process.exit(failed ? 1 : 0);
