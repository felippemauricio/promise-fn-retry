import { defineConfig } from 'vitepress';
import { fileURLToPath } from 'node:url';

// Published as a GitHub Pages project site at /promise-fn-retry/.
export default defineConfig({
  title: 'promise-fn-retry',
  description:
    'A tiny, typed, isomorphic promise retry — exponential backoff, jitter, timeouts, a total budget, cancellation and polling.',
  lang: 'en-AU',
  base: '/promise-fn-retry/',
  cleanUrls: true,
  lastUpdated: true,
  // Header dark/light switch that follows the OS preference on first visit,
  // then remembers the visitor's choice.
  appearance: true,
  head: [['meta', { name: 'theme-color', content: '#35e0c8' }]],

  vite: {
    resolve: {
      alias: {
        // The live demos run the real library, bundled from source.
        'promise-fn-retry': fileURLToPath(new URL('../../src/index.ts', import.meta.url)),
      },
    },
  },

  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'API', link: '/reference/api' },
      { text: 'Playground', link: '/playground' },
      { text: 'npm', link: 'https://www.npmjs.com/package/promise-fn-retry' },
    ],

    sidebar: [
      {
        text: 'Getting Started',
        items: [
          { text: 'What & why', link: '/guide/getting-started' },
          { text: 'Installation', link: '/guide/installation' },
        ],
      },
      {
        text: 'Guides',
        items: [
          { text: 'Backoff & jitter', link: '/guide/backoff' },
          { text: 'Retry forever', link: '/guide/forever' },
          { text: 'Per-attempt timeout', link: '/guide/attempt-timeout' },
          { text: 'Total time budget', link: '/guide/max-elapsed-time' },
          { text: 'Server-driven delay', link: '/guide/get-delay' },
          { text: 'Poll until done', link: '/guide/until' },
          { text: 'Give up early (BailError)', link: '/guide/bail-error' },
          { text: 'Selective retries', link: '/guide/should-retry' },
          { text: 'Cancellation', link: '/guide/abort-signal' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'API & options', link: '/reference/api' },
          { text: 'Migrating', link: '/guide/migrating' },
          { text: 'Playground', link: '/playground' },
        ],
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/felippemauricio/promise-fn-retry' },
      { icon: 'linkedin', link: 'https://www.linkedin.com/in/felippemauricio/' },
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright:
        '© 2018-present <a href="https://www.linkedin.com/in/felippemauricio/">Felippe Maurício</a>',
    },

    search: { provider: 'local' },
  },
});
