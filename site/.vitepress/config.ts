import { type DefaultTheme, defineConfig } from 'vitepress';
import llmstxt from 'vitepress-plugin-llms';
import typedocSidebar from '../api/typedoc-sidebar.json';

const guide: DefaultTheme.SidebarItem = {
  text: 'Guide',
  items: [
    { text: 'Getting started', link: '/guide/getting-started' },
    { text: 'Chip supply', link: '/guide/chip-supply' },
  ],
};

// Served from GitHub Pages at alanbickel.github.io/plinko-config/.
export default defineConfig({
  title: 'plinko-config',
  description:
    "Drive your app's settings with Plinko. A delightfully sinister, accessible, framework-agnostic UI component with zero runtime dependencies.",
  base: '/plinko-config/',
  cleanUrls: true,
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Demo', link: '/demo' },
      { text: 'API', link: '/api/' },
    ],
    sidebar: {
      '/guide/': [guide],
      '/api/': [{ text: 'API reference', link: '/api/', items: typedocSidebar }],
    },
    search: { provider: 'local' },
    socialLinks: [{ icon: 'github', link: 'https://github.com/alanbickel/plinko-config' }],
  },
  vite: {
    plugins: [
      // One level of sections only: vitepress-plugin-llms 1.14 drops the base path from links
      // in nested sections, so the TypeDoc groups (Classes, Interfaces, …) go in at the top.
      llmstxt({ sidebar: [guide, ...typedocSidebar] }),
    ],
  },
});
