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

const NOTO_SERIF_JP: BundledFont = {family: '"Noto Serif JP Variable"', stylesheets: ['noto-serif-jp/index.css']};
const NOTO_SERIF_SC: BundledFont = {family: '"Noto Serif SC Variable"', stylesheets: ['noto-serif-sc/index.css']};
const NOTO_SERIF_TC: BundledFont = {family: '"Noto Serif TC Variable"', stylesheets: ['noto-serif-tc/index.css']};

// Chinese, Japanese and Korean share code points for Han characters, and each language draws
// some of them differently, so the serif follows the book's language. Books in other languages
// get the Simplified Chinese forms.
export function notoSerifCjk(language: string | undefined): BundledFont {
  const tag = language?.toLowerCase() ?? '';
  if (tag.startsWith('ja')) return NOTO_SERIF_JP;
  if (/^zh-(hant|tw|hk|mo)/.test(tag)) return NOTO_SERIF_TC;
  return NOTO_SERIF_SC;
}

// Book pages load from blob URLs, so stylesheet URLs are absolute.
export function bundledFontStylesheetUrl(stylesheet: string): string {
  return new URL(`/assets/fonts/${stylesheet}`, window.location.origin).href;
}
