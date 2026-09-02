export type FolioWritingMode = 'publisher' | 'horizontal-tb' | 'vertical-rl';
export type FolioPageTurnDirection = 'left-to-right' | 'right-to-left';
export type FolioFlow = 'paginated' | 'scrolled';
export type FolioFontFamily = 'publisher' | 'cjk-serif' | 'cjk-sans';
export type FolioTheme = 'paper' | 'sepia' | 'night';
export type FolioTextAlign = 'publisher' | 'start' | 'justify';

export interface FolioSettings {
  writingMode: FolioWritingMode;
  pageTurnDirection: FolioPageTurnDirection;
  flow: FolioFlow;
  fontFamily: FolioFontFamily;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  paragraphSpacing: number;
  letterSpacing: number;
  wordSpacing: number;
  textIndent: number;
  textAlign: FolioTextAlign;
  hyphenate: boolean;
  columnGap: number;
  pageMargin: number;
  maxColumnCount: number;
  maxInlineSize: number;
  theme: FolioTheme;
}

export const DEFAULT_FOLIO_SETTINGS: Readonly<FolioSettings> = {
  writingMode: 'publisher',
  pageTurnDirection: 'left-to-right',
  flow: 'paginated',
  fontFamily: 'publisher',
  fontSize: 18,
  fontWeight: 400,
  lineHeight: 1.7,
  paragraphSpacing: 0,
  letterSpacing: 0,
  wordSpacing: 0,
  textIndent: 0,
  textAlign: 'justify',
  hyphenate: true,
  columnGap: 7,
  pageMargin: 40,
  maxColumnCount: 2,
  maxInlineSize: 720,
  theme: 'paper',
};
