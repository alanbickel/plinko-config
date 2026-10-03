import type { DefaultTheme } from 'vitepress';
import llmstxt from 'vitepress-plugin-llms';
import { withMermaid } from 'vitepress-plugin-mermaid';
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

const lifecycle: DefaultTheme.SidebarItem = {
  text: 'Lifecycle',
  items: [
    { text: 'Board', link: '/lifecycle/board' },
    { text: 'Chip', link: '/lifecycle/chip' },
  ],
};

const contracts: DefaultTheme.SidebarItem = {
  text: 'Contracts',
  items: [
    { text: 'Ownership', link: '/contracts/ownership' },
    { text: 'Callbacks', link: '/contracts/callbacks' },
    { text: 'Sizing', link: '/contracts/sizing' },
  ],
};

const internals: DefaultTheme.SidebarItem = {
  text: 'Internals',
  items: [
    { text: 'Structure', link: '/internals/structure' },
    { text: 'Data flow', link: '/internals/data-flow' },
    { text: 'Frame loop', link: '/internals/frame-loop' },
    { text: 'Physics', link: '/internals/physics' },
    { text: 'Sizing', link: '/internals/sizing' },
    { text: 'Rules', link: '/internals/rules' },
  ],
};

/** Guide, Lifecycle, Contracts, and Internals share one sidebar; the API reference has its own. */
const docs = [guide, lifecycle, contracts, internals];

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
export default withMermaid({
  title: 'plinko-config',
  description:
    "Drive your app's settings with Plinko. A delightfully sinister, accessible, framework-agnostic UI component with zero runtime dependencies.",
  base: '/plinko-config/',
  cleanUrls: true,
  // Mermaid's default is 14px; match the page's body text.
  mermaid: { themeVariables: { fontSize: '16px' } },
  themeConfig: {
    nav: [
      { text: 'Docs', link: '/guide/getting-started' },
      { text: 'API', link: '/api/' },
      { text: 'Demo', link: '/demo' },
    ],
    sidebar: {
      '/guide/': docs,
      '/lifecycle/': docs,
      '/contracts/': docs,
      '/internals/': docs,
      '/api/': [{ text: 'API reference', link: '/api/', items: typedocSidebar }],
    },
    search: { provider: 'local' },
    socialLinks: [{ icon: 'github', link: 'https://github.com/alanbickel/plinko-config' }],
  },
  vite: {
    // CommonJS dependencies of mermaid that vitepress-plugin-mermaid doesn't pre-bundle for dev.
    optimizeDeps: { include: ['fastdom', 'fastdom/extensions/fastdom-promised.js'] },
    plugins: [
      llmstxt({
        // The hero text has a <br> for layout; llms.txt gets it as plain text.
        description: 'Game-ify your settings. Drive your app with Plinko.',
        sidebar: [
          ...docs,
          ...typedocSidebar.flatMap((module) => flattenForLlms(module, module.text)),
        ],
      }),
    ],
  },
});
