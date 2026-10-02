import { type DefaultTheme, defineConfig } from 'vitepress';
import llmstxt from 'vitepress-plugin-llms';
import typedocSidebar from '../api/typedoc-sidebar.json';

const guide: DefaultTheme.SidebarItem = {
  text: 'Guide',
  items: [
    { text: 'Getting started', link: '/guide/getting-started' },
    { text: 'Chip supply', link: '/guide/chip-supply' },
    { text: 'Frameworks', link: '/guide/frameworks' },
    { text: 'Accessibility', link: '/guide/accessibility' },
  ],
};

/**
 * Flattens the TypeDoc sidebar into one level of sections ("plinko-config › Interfaces", …).
 * vitepress-plugin-llms 1.14 drops the base path from links in nested sections.
 */
function flattenForLlms(item: DefaultTheme.SidebarItem, path: string): DefaultTheme.SidebarItem[] {
  const children = item.items ?? [];
  const overview = item.link ? [{ text: `${item.text} overview`, link: item.link }] : [];
  const leaves = [...overview, ...children.filter((child) => !child.items)];
  const own = leaves.length > 0 ? [{ text: path, items: leaves }] : [];
  const nested = children
    .filter((child) => child.items)
    .flatMap((child) => flattenForLlms(child, `${path} › ${child.text}`));
  return [...own, ...nested];
}

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
      llmstxt({
        sidebar: [
          guide,
          ...typedocSidebar.flatMap((module) => flattenForLlms(module, module.text)),
        ],
      }),
    ],
  },
});
