import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import mdx from '@mdx-js/rollup';
import remarkGfm from 'remark-gfm';
import rehypeShiki from '@shikijs/rehype';

export default defineConfig({
  // Relative asset paths: the built site works from any GitHub Pages path
  // (https://<user>.github.io/<repo>/) without knowing the repo name.
  base: './',
  plugins: [
    {
      enforce: 'pre',
      ...mdx({
        remarkPlugins: [remarkGfm],
        rehypePlugins: [[rehypeShiki, { theme: 'github-dark-default' }]],
      }),
    },
    react({ include: /\.(jsx|js|mdx)$/ }),
  ],
});
