// Fonts the reader ships under /assets/fonts. A book page imports a font's stylesheets when the
// font is in use, and the browser downloads only the slices that cover the text on screen.
export interface BundledFont {
  family: string;
  stylesheets: string[];
}

export const LITERATA: BundledFont = {
  family: '"Literata Variable"',
  stylesheets: ['literata/opsz.css', 'literata/opsz-italic.css'],
};

type CjkRegion = 'jp' | 'sc' | 'tc';

// Noto Serif CJK and Noto Sans CJK are one design in two styles, with a font per region.
const notoCjk = (style: 'serif' | 'sans'): Record<CjkRegion, BundledFont> => {
  const name = style === 'serif' ? 'Noto Serif' : 'Noto Sans';
  const font = (region: CjkRegion): BundledFont => ({
    family: `"${name} ${region.toUpperCase()} Variable"`,
    stylesheets: [`noto-${style}-${region}/index.css`],
  });
  return {jp: font('jp'), sc: font('sc'), tc: font('tc')};
};

const NOTO_SERIF_CJK = notoCjk('serif');
const NOTO_SANS_CJK = notoCjk('sans');

// Chinese, Japanese and Korean share code points for Han characters, and each language draws
// some of them differently, so the CJK fonts follow the book's language. Books in other
// languages get the Simplified Chinese forms.
function cjkRegion(language: string | undefined): CjkRegion {
  const tag = language?.toLowerCase() ?? '';
  if (tag.startsWith('ja')) return 'jp';
  if (/^zh-(hant|tw|hk|mo)/.test(tag)) return 'tc';
  return 'sc';
}

export function notoSerifCjk(language: string | undefined): BundledFont {
  return NOTO_SERIF_CJK[cjkRegion(language)];
}

export function notoSansCjk(language: string | undefined): BundledFont {
  return NOTO_SANS_CJK[cjkRegion(language)];
}

// Book pages load from blob URLs, so stylesheet URLs are absolute.
export function bundledFontStylesheetUrl(stylesheet: string): string {
  return new URL(`/assets/fonts/${stylesheet}`, window.location.origin).href;
}
