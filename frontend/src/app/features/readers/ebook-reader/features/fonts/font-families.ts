// The book keeps deciding where its text is serif or sans-serif; the reader decides which fonts
// those are. A book's generic families point at these variables, which the reader's styles set.
export const SERIF_VARIABLE = '--folio-serif';
export const SANS_SERIF_VARIABLE = '--folio-sans-serif';

// Japanese books made to the Denshokyo guide name the reading system's own fonts with these.
const SERIF_ALIASES = new Set(['serif-ja', 'serif-ja-v']);
const SANS_SERIF_ALIASES = new Set(['sans-serif-ja', 'sans-serif-ja-v']);

const MEDIA_TYPES = {css: 'text/css', xhtml: 'application/xhtml+xml', html: 'text/html'};

interface ResourceData {
  data: unknown;
  readonly type: string;
}

export interface TransformingBook {
  transformTarget?: EventTarget;
}

/** Points the generic font families in each stylesheet and page the book loads at the reader's fonts. */
export function pointBookFontsAtReader(book: TransformingBook): void {
  book.transformTarget?.addEventListener('data', event => {
    // SAFETY: the engine's data event carries the loaded resource and its media type.
    const detail = (event as CustomEvent<ResourceData>).detail;
    const rewrite = detail.type === MEDIA_TYPES.css ? pointStylesheetAtReader
      : detail.type === MEDIA_TYPES.xhtml || detail.type === MEDIA_TYPES.html ? pointDocumentAtReader
        : null;
    if (!rewrite) return;
    detail.data = Promise.resolve(detail.data).then(data => typeof data === 'string' ? rewrite(data) : data);
  });
}

// @font-face rules name fonts rather than choose them, so they are left as they are.
export function pointStylesheetAtReader(css: string): string {
  return css.split(/(@font-face\s*\{[^}]*\})/i)
    .map((part, index) => index % 2 === 1 ? part : part.replace(/(font-family\s*:)([^;{}]*)/gi, pointDeclaration))
    .join('');
}

function pointDocumentAtReader(html: string): string {
  return html
    .replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi,
      (_match: string, open: string, css: string, close: string) => open + pointStylesheetAtReader(css) + close)
    .replace(/(\sstyle\s*=\s*)(["'])([\s\S]*?)\2/gi,
      (_match: string, attribute: string, quote: string, css: string) => attribute + quote + pointStylesheetAtReader(css) + quote);
}

function pointDeclaration(_match: string, property: string, value: string): string {
  const important = /\s*!\s*important\s*$/i.exec(value);
  const families = important ? value.slice(0, important.index) : value;
  // `serif-ja, serif` points both families at the same fonts, which need naming once.
  const pointed = splitFamilies(families).map(pointFamily)
    .filter((family, index, all) => all.findIndex(other => other.trim() === family.trim()) === index);
  return property + pointed.join(',') + (important?.[0] ?? '');
}

function pointFamily(item: string): string {
  const name = item.trim();
  const unquoted = name.replace(/^(["'])(.*)\1$/, '$2').toLowerCase();
  // A quoted "serif" names a font; only the bare keyword is the generic family.
  const keyword = unquoted === name.toLowerCase() ? unquoted : null;
  const generic = keyword === 'serif' || SERIF_ALIASES.has(unquoted) ? 'serif'
    : keyword === 'sans-serif' || SANS_SERIF_ALIASES.has(unquoted) ? 'sans-serif'
      : null;
  if (!generic) return item;
  const variable = generic === 'serif' ? SERIF_VARIABLE : SANS_SERIF_VARIABLE;
  const leading = /^\s*/.exec(item)?.[0] ?? '';
  const trailing = /\s*$/.exec(item)?.[0] ?? '';
  return `${leading}var(${variable}, ${generic})${trailing}`;
}

// Commas inside quotes or var() fallbacks don't separate families.
function splitFamilies(value: string): string[] {
  const families: string[] = [];
  let start = 0;
  let depth = 0;
  let quote: string | null = null;
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '(') {
      depth++;
    } else if (char === ')') {
      depth--;
    } else if (char === ',' && depth === 0) {
      families.push(value.slice(start, index));
      start = index + 1;
    }
  }
  families.push(value.slice(start));
  return families;
}
