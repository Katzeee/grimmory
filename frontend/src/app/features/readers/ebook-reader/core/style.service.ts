import {inject, Service} from '@angular/core';
import {ReaderSansSerifFont, ReaderSerifFont, ReaderState} from '../state/reader-state.service';
import {EpubCustomFontService} from '../features/fonts/custom-font.service';
import {BundledFont, bundledFontStylesheetUrl, LITERATA, notoSansCjk, notoSerifCjk} from '../features/fonts/bundled-fonts';
import {SANS_SERIF_VARIABLE, SERIF_VARIABLE} from '../features/fonts/font-families';
import {BookLayout} from './layout.service';

// The fonts a generic family resolves to, ahead of the generic family itself.
interface FontChain {
  families: string[];
  fontFaces: string[];
  stylesheets: string[];
}

const PLATFORM_FONTS: FontChain = {families: [], fontFaces: [], stylesheets: []};

// Marks annotated text whose reading a tap has revealed.
export const RUBY_REVEALED_CLASS = 'folio-ruby-revealed';

interface ReaderRenderer {
  setAttribute(name: string, value: string | number): void;
  removeAttribute(name: string): void;
  setStyles?(css: string): void;
}

@Service()
export class ReaderStyleService {
  private readonly epubCustomFontService = inject(EpubCustomFontService);

  generateCSS(state: ReaderState, layout?: BookLayout): string {
    const {lineHeight, justify, hyphenate, fontSize, theme, serifFont, sansSerifFont, fontOverride, writingMode, rubyDisplay} = state;
    const userStylesheet = '';
    const overrideFont = false;
    const mediaActiveClass = 'media-active';

    const serif = this.serifChain(serifFont, layout?.language);
    const sansSerif = this.sansSerifChain(sansSerifFont, layout?.language);
    const fontImports = [...serif.stylesheets, ...sansSerif.stylesheets]
      .map(stylesheet => `@import url("${bundledFontStylesheetUrl(stylesheet)}");`)
      .join('\n');
    const fontFaceRule = [...serif.fontFaces, ...sansSerif.fontFaces].join('\n');

    // Text the book leaves unstyled reads in the serif font, at zero specificity so any font the
    // book sets wins. Overriding the book's fonts sets one font on everything.
    const overrideVariable = fontOverride === 'serif' ? SERIF_VARIABLE : SANS_SERIF_VARIABLE;
    const fontRule = `
        :root {
            ${SERIF_VARIABLE}: ${[...serif.families, 'serif'].join(', ')};
            ${SANS_SERIF_VARIABLE}: ${[...sansSerif.families, 'sans-serif'].join(', ')};
        }
        :where(html) {
            font-family: var(${SERIF_VARIABLE});
        }${fontOverride === 'off' ? '' : `
        body {
            font-family: var(${overrideVariable}) !important;
        }
        body * {
            font-family: inherit !important;
        }`}`;

    // Books set their writing mode on the root, on body, or on a wrapper just inside it.
    const writingModeRule = writingMode === 'auto' ? '' : `
        html, body, body > * {
            writing-mode: ${writingMode === 'vertical' ? 'vertical-rl' : 'horizontal-tb'} !important;
        }`;

    // A hidden reading keeps its space, so changing how ruby shows never moves the text.
    const rubyRule = {
      shown: '',
      dimmed: `
        rt { opacity: 0.4; }`,
      // A dotted underline marks the words whose reading a tap reveals.
      tap: `
        rt { visibility: hidden; }
        ruby:not(.${RUBY_REVEALED_CLASS}) {
            text-decoration: underline dotted rgb(160 160 160 / 80%);
            text-underline-offset: 0.05em;
        }
        ruby.${RUBY_REVEALED_CLASS} rt { visibility: visible; }
        @media (hover: hover) {
            ruby:hover rt { visibility: visible; }
        }`,
      hidden: `
        rt { visibility: hidden; }`,
    }[rubyDisplay];

    return `${fontImports}
      @namespace epub "http://www.idpf.org/2007/ops";
      ${fontFaceRule}${fontRule}${writingModeRule}${rubyRule}
      @media print {
          html {
              column-width: auto !important;
              height: auto !important;
              width: auto !important;
          }
      }
      @media screen {
          html {
              color-scheme: light dark;
              color: ${theme.fg || theme.light.fg};
              font-size: ${fontSize}px;
          }
          a:any-link {
              color: ${theme.link || theme.light.link};
              text-decoration-color: light-dark(
                  color-mix(in srgb, currentColor 20%, transparent),
                  color-mix(in srgb, currentColor 40%, transparent));
              text-underline-offset: .1em;
          }
          a:any-link:hover {
              text-decoration-color: unset;
          }
          @media (prefers-color-scheme: dark) {
              html {
                  color: ${theme.fg || theme.dark.fg};
              }
              a:any-link {
                  color: ${theme.link || theme.dark.link};
              }
          }
          /* Sections load as HTML, where epub:type is a plain attribute name */
          aside[epub|type~="footnote"], aside[epub\\:type~="footnote"] {
              display: none;
          }
      }
      html {
          line-height: ${lineHeight};
          hanging-punctuation: allow-end last;
          orphans: 2;
          widows: 2;
      }
      [align="left"] { text-align: left; }
      [align="right"] { text-align: right; }
      [align="center"] { text-align: center; }
      [align="justify"] { text-align: justify; }
      :is(hgroup, header) p {
          text-align: unset;
          hyphens: unset;
      }
      h1, h2, h3, h4, h5, h6, hgroup, th {
          text-wrap: balance;
      }
      pre {
          white-space: pre-wrap !important;
          tab-size: 2;
      }
      @media screen and (prefers-color-scheme: light) {
          ${(theme.bg || theme.light.bg) !== '#ffffff' ? `
          html, body {
              color: ${theme.fg || theme.light.fg} !important;
              background: none !important;
          }
          body * {
              color: inherit !important;
              border-color: currentColor !important;
              background-color: ${theme.bg || theme.light.bg} !important;
          }
          a:any-link {
              color: ${theme.link || theme.light.link} !important;
          }
          svg, img {
              background-color: transparent !important;
              mix-blend-mode: multiply;
          }
          .${mediaActiveClass}, .${mediaActiveClass} * {
              color: ${theme.fg || theme.light.fg} !important;
              background: color-mix(in hsl, ${theme.fg || theme.light.fg}, #fff 50%) !important;
              background: color-mix(in hsl, ${theme.fg || theme.light.fg}, ${theme.bg || theme.light.bg} 85%) !important;
          }` : ''}
      }
      @media screen and (prefers-color-scheme: dark) {

          html, body {
              color: ${theme.fg || theme.dark.fg} !important;
              background: none !important;
          }
          body * {
              color: inherit !important;
              border-color: currentColor !important;
              background-color: ${theme.bg || theme.dark.bg} !important;
          }
          a:any-link {
              color: ${theme.link || theme.dark.link} !important;
          }
          .${mediaActiveClass}, .${mediaActiveClass} * {
              color: ${theme.fg || theme.dark.fg} !important;
              background: color-mix(in hsl, ${theme.fg || theme.dark.fg}, #000 50%) !important;
              background: color-mix(in hsl, ${theme.fg || theme.dark.fg}, ${theme.bg || theme.dark.bg} 75%) !important;
          }
      }
      p, li, blockquote, dd {
          line-height: ${lineHeight};
          text-align: ${justify ? 'justify' : 'start'} !important;
          hyphens: ${hyphenate ? 'auto' : 'none'};
      }
      ${overrideFont ? '' : ''}
      ${userStylesheet}
      ::selection {
          background-color: rgba(128, 128, 128, 0.3);
      }
      ::-moz-selection {
          background-color: rgba(128, 128, 128, 0.3);
      }
    `;
  }

  // Every choice but the platform's falls back to Noto CJK in the same style for the CJK text its
  // own font lacks.
  private serifChain(font: ReaderSerifFont, language?: string): FontChain {
    if (font === 'system') return PLATFORM_FONTS;
    const main = font === 'noto-serif' ? PLATFORM_FONTS
      : font === 'literata' ? this.bundledFontChain(LITERATA)
        : this.customFontChain(font);
    return this.withCjk(main, notoSerifCjk(language));
  }

  private sansSerifChain(font: ReaderSansSerifFont, language?: string): FontChain {
    if (font === 'system') return PLATFORM_FONTS;
    const main = font === 'noto-sans' ? PLATFORM_FONTS : this.customFontChain(font);
    return this.withCjk(main, notoSansCjk(language));
  }

  private bundledFontChain(font: BundledFont): FontChain {
    return {families: [font.family], fontFaces: [], stylesheets: font.stylesheets};
  }

  private withCjk(main: FontChain, cjk: BundledFont): FontChain {
    return {
      families: [...main.families, cjk.family],
      fontFaces: main.fontFaces,
      stylesheets: [...main.stylesheets, ...cjk.stylesheets],
    };
  }

  private customFontChain(font: string): FontChain {
    const customFontId = this.parseCustomFontId(font);
    if (customFontId === null) return PLATFORM_FONTS;
    const customFont = this.epubCustomFontService.getCustomFontById(customFontId);
    const blobUrl = this.epubCustomFontService.getBlobUrl(customFontId);
    if (!customFont || !blobUrl) return PLATFORM_FONTS;
    const sanitizedFontName = this.epubCustomFontService.sanitizeFontName(customFont.fontName);
    return {
      families: [`"${sanitizedFontName}"`],
      fontFaces: [`@font-face {
              font-family: "${sanitizedFontName}";
              src: url("${blobUrl}") format("truetype");
              font-weight: normal;
              font-style: normal;
              font-display: swap;
          }`],
      stylesheets: [],
    };
  }

  private parseCustomFontId(fontFamily: string): number | null {
    if (fontFamily.startsWith('custom:')) {
      const id = parseInt(fontFamily.substring(7), 10);
      return !isNaN(id) ? id : null;
    }

    const id = parseInt(fontFamily, 10);
    return !isNaN(id) && id.toString() === fontFamily ? id : null;
  }

  // The renderer splits a vertical page into stacked tiers once the page is taller than the max
  // inline size, so vertical lines take the longer window axis and run the full page height.
  maxInlineSize(state: ReaderState, layout: BookLayout): string {
    const size = layout.vertical
      ? Math.max(window.innerWidth, window.innerHeight, state.maxInlineSize)
      : state.maxInlineSize;
    return `${size}px`;
  }

  applyStylesToRenderer(renderer: ReaderRenderer | null | undefined, state: ReaderState, layout: BookLayout = {vertical: false}): void {
    if (!renderer) return;

    renderer.setAttribute('max-column-count', state.maxColumnCount);
    renderer.setAttribute('gap', `${state.gap * 100}%`);
    renderer.setAttribute('max-inline-size', this.maxInlineSize(state, layout));
    renderer.setAttribute('max-block-size', `${state.maxBlockSize}px`);
    if (typeof renderer.setStyles === 'function') {
      const css = this.generateCSS(state, layout);
      renderer.setStyles(css);
    }

    for (const side of ['top', 'right', 'bottom', 'left']) {
      if (state.flow === 'paginated') {
        renderer.setAttribute(`margin-${side}`, '40px');
      } else {
        renderer.removeAttribute(`margin-${side}`);
      }
    }
  }
}
