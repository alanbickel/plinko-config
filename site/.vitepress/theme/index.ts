import { useData } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import { h } from 'vue';
import './custom.css';

interface HeroFrontmatter {
  name?: string;
  text?: string;
  tagline?: string;
}

/**
 * The home hero's text block: the package name, the tagline as an italic byline under it, then
 * the headline. Replaces the default theme's name/text/tagline order. Reads the same `hero`
 * frontmatter, so llms.txt still gets the copy.
 */
const HeroInfo = {
  setup() {
    // biome-ignore lint/correctness/useHookAtTopLevel: a React rule; Vue composables belong in setup()
    const { frontmatter } = useData();
    return () => {
      const hero: HeroFrontmatter = frontmatter.value.hero ?? {};
      return [
        h('h1', { class: 'hero-name' }, hero.name),
        h('p', { class: 'hero-byline' }, hero.tagline),
        h('p', { class: 'hero-headline', innerHTML: hero.text }),
      ];
    };
  },
};

export default {
  extends: DefaultTheme,
  Layout: () => h(DefaultTheme.Layout, null, { 'home-hero-info': () => h(HeroInfo) }),
};
