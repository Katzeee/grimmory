import {inject, Service} from '@angular/core';
import {ReaderState} from '../state/reader-state.service';
import {EpubCustomFontService} from '../features/fonts/custom-font.service';
import {BundledFont, bundledFontStylesheetUrl, LITERATA, notoSerifCjk} from '../features/fonts/bundled-fonts';
import {BookLayout} from './layout.service';

interface FontChoice {
  families: string[];
  generic?: string;
  fontFace?: string;
  stylesheets?: string[];
}

const GENERIC_FAMILIES = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui']);

interface ReaderRenderer {
  setAttribute(name: string, value: string | number): void;
  removeAttribute(name: string): void;
  setStyles?(css: string): void;
}

@Service()
export class ReaderStyleService {
  private readonly epubCustomFontService = inject(EpubCustomFontService);

  generateCSS(state: ReaderState, layout?: BookLayout): string {
    const {lineHeight, justify, hyphenate, fontSize, theme, fontFamily, cjkFont, writingMode} = state;
    const userStylesheet = '';
    const overrideFont = false;
    const mediaActiveClass = 'media-active';

    const latin = this.latinFont(fontFamily);
    const cjk = cjkFont === 'noto-serif' ? this.bundledFont(notoSerifCjk(layout?.language), 'serif') : null;
    // Latin fonts carry no CJK glyphs, so CJK text falls through them to the CJK font. A generic
    // family covers every script, so it closes the stack.
    const fontStack = [...(latin?.families ?? []), ...(cjk?.families ?? []), latin?.generic ?? cjk?.generic]
      .filter(family => family !== undefined);
    const fontImports = [...(latin?.stylesheets ?? []), ...(cjk?.stylesheets ?? [])]
      .map(stylesheet => `@import url("${bundledFontStylesheetUrl(stylesheet)}");`)
      .join('\n');
    const fontFaceRule = latin?.fontFace ?? '';

    const fontFamilyRule = fontStack.length > 0 ? `
        body {
            font-family: ${fontStack.join(', ')} !important;
        }
        body * {
            font-family: inherit !important;
        }` : '';

    // Books set their writing mode on the root, on body, or on a wrapper just inside it.
    const writingModeRule = writingMode === 'auto' ? '' : `
        html, body, body > * {
            writing-mode: ${writingMode === 'vertical' ? 'vertical-rl' : 'horizontal-tb'} !important;
        }`;

    return `${fontImports}
      ${fontFaceRule}
      @namespace epub "http://www.idpf.org/2007/ops";${writingModeRule}
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
          }${fontFamilyRule}
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

  private latinFont(fontFamily: string | null): FontChoice | null {
    if (fontFamily === null) return null;
    if (fontFamily === 'literata') return this.bundledFont(LITERATA, 'serif');
    if (GENERIC_FAMILIES.has(fontFamily)) return {families: [], generic: fontFamily};

    const customFontId = this.parseCustomFontId(fontFamily);
    if (customFontId === null) return {families: [fontFamily]};

    const customFont = this.epubCustomFontService.getCustomFontById(customFontId);
    const blobUrl = this.epubCustomFontService.getBlobUrl(customFontId);
    if (!customFont || !blobUrl) return null;
    const sanitizedFontName = this.epubCustomFontService.sanitizeFontName(customFont.fontName);
    return {
      families: [`"${sanitizedFontName}"`],
      generic: 'sans-serif',
      fontFace: `@font-face {
              font-family: "${sanitizedFontName}";
              src: url("${blobUrl}") format("truetype");
              font-weight: normal;
              font-style: normal;
              font-display: swap;
          }`,
    };
  }

  private bundledFont(font: BundledFont, generic: string): FontChoice {
    return {families: [font.family], generic, stylesheets: font.stylesheets};
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
