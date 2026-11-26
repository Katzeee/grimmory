import {Component, computed, inject, Input, OnInit, output, Renderer2} from '@angular/core';
import {DecimalPipe, DOCUMENT} from '@angular/common';
import {TranslocoDirective} from '@jsverse/transloco';
import {
  folioSettingsOf,
  ReaderFontOverride,
  ReaderPageDirection,
  ReaderRubyDisplay,
  ReaderSansSerifFont,
  ReaderSerifFont,
  ReaderStateService,
  ReaderWritingMode
} from '../state/reader-state.service';
import {ReaderViewManagerService} from '../core/view-manager.service';
import {ReaderLayoutService} from '../core/layout.service';
import {BookService} from '../../../book/service/book.service';
import {EbookViewerSetting} from '../../../book/model/book.model';
import {EpubCustomFontService} from '../features/fonts/custom-font.service';
import {bundledFontStylesheetUrl, LITERATA, notoSerifCjk} from '../features/fonts/bundled-fonts';

interface FontOption<T extends string> {
  value: T;
  name?: string;
  nameKey?: string;
  family: string;
  sample: string;
}

const isCustomFont = (value: string): value is `custom:${number}` => /^custom:\d+$/.test(value);

interface AnnotationColor {
  name: string;
  value: string;
  label: string;
}

@Component({
  selector: 'app-settings-dialog',
  standalone: true,
  imports: [DecimalPipe, TranslocoDirective],
  templateUrl: './settings-dialog.component.html',
  styleUrls: ['./settings-dialog.component.scss']
})
export class ReaderSettingsDialogComponent implements OnInit {
  private readonly bookService = inject(BookService);
  private readonly customFontService = inject(EpubCustomFontService);
  private readonly renderer = inject(Renderer2);
  private readonly document = inject(DOCUMENT);
  private readonly layout = inject(ReaderLayoutService);
  @Input() stateService!: ReaderStateService;
  @Input() viewManager!: ReaderViewManagerService;
  @Input() bookId!: number;

  readonly closed = output<void>();

  activeTab: 'theme' | 'typography' | 'layout' = 'theme';

  selectedAnnotationColor: string = '#FFFF00';

  annotationColors: AnnotationColor[] = [
    {name: 'yellow', value: '#FFFF00', label: 'Yellow'},
    {name: 'green', value: '#90EE90', label: 'Green'},
    {name: 'blue', value: '#87CEEB', label: 'Blue'},
    {name: 'pink', value: '#FFB6C1', label: 'Pink'},
    {name: 'orange', value: '#FFD580', label: 'Orange'}
  ];

  ngOnInit() {
    this.customFontService.injectCustomFontsStylesheet(this.renderer, this.document);
    this.linkBundledFonts();
    this.selectedAnnotationColor = this.getSelectedAnnotationColor();
  }

  getFontFamilyForPreview(fontValue: string): string {
    return this.customFontService.getFontFamilyForPreview(fontValue);
  }

  private readonly customFonts = computed<FontOption<`custom:${number}`>[]>(() => this.stateService.fonts()
    .flatMap(font => font.value && isCustomFont(font.value) ? [{
      value: font.value,
      name: font.name,
      family: this.getFontFamilyForPreview(font.value),
      sample: 'Aa',
    }] : []));

  readonly serifFonts = computed<FontOption<ReaderSerifFont>[]>(() => [
    {value: 'literata', name: 'Literata', family: LITERATA.family, sample: 'Aa'},
    {value: 'noto-serif', nameKey: 'notoSerifCjk', family: notoSerifCjk(this.layout.bookLanguage()).family, sample: '永'},
    {value: 'system', nameKey: 'systemFont', family: 'serif', sample: 'Aa'},
    ...this.customFonts(),
  ]);

  readonly sansSerifFonts = computed<FontOption<ReaderSansSerifFont>[]>(() => [
    {value: 'system', nameKey: 'systemFont', family: 'sans-serif', sample: 'Aa'},
    ...this.customFonts(),
  ]);

  readonly fontOverrides: ReaderFontOverride[] = ['off', 'serif', 'sans-serif'];

  // The font buttons preview each bundled font in the dialog's own document.
  private linkBundledFonts() {
    const stylesheets = [...LITERATA.stylesheets, ...notoSerifCjk(this.layout.bookLanguage()).stylesheets];
    for (const href of stylesheets.map(bundledFontStylesheetUrl)) {
      if (this.document.head.querySelector(`link[href="${href}"]`)) continue;
      const link = this.document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      this.renderer.appendChild(this.document.head, link);
    }
  }

  get state() {
    return this.stateService.state();
  }

  // Vertical pages hold one full-height column, so only the block size still shapes them.
  get vertical() {
    return this.layout.verticalWriting();
  }

  get themes() {
    return this.stateService.themes;
  }

  get fonts() {
    return this.stateService.fonts();
  }

  private syncSettingsToBackend() {
    const setting: EbookViewerSetting = {
      lineHeight: this.state.lineHeight,
      justify: this.state.justify,
      hyphenate: this.state.hyphenate,
      maxColumnCount: this.state.maxColumnCount,
      gap: this.state.gap,
      fontSize: this.state.fontSize,
      theme: this.state.theme.name,
      maxInlineSize: this.state.maxInlineSize,
      maxBlockSize: this.state.maxBlockSize,
      fontFamily: this.state.fontFamily,
      isDark: this.state.isDark,
      flow: this.state.flow,
      folio: folioSettingsOf(this.state),
    };
    this.bookService.updateViewerSetting({ebookSettings: setting}, this.bookId).subscribe();
  }

  setFontFamily(value: string | null) {
    this.stateService.setFontFamily(value);
    this.syncSettingsToBackend();
  }

  setSerifFont(value: ReaderSerifFont) {
    this.stateService.setSerifFont(value);
    this.syncSettingsToBackend();
  }

  setSansSerifFont(value: ReaderSansSerifFont) {
    this.stateService.setSansSerifFont(value);
    this.syncSettingsToBackend();
  }

  setFontOverride(value: ReaderFontOverride) {
    this.stateService.setFontOverride(value);
    this.syncSettingsToBackend();
  }

  readonly rubyDisplays: ReaderRubyDisplay[] = ['shown', 'dimmed', 'tap', 'hidden'];

  setRubyDisplay(value: ReaderRubyDisplay) {
    this.stateService.setRubyDisplay(value);
    this.syncSettingsToBackend();
  }

  increaseFontSize() {
    this.stateService.updateFontSize(1);
    this.syncSettingsToBackend();
  }

  decreaseFontSize() {
    this.stateService.updateFontSize(-1);
    this.syncSettingsToBackend();
  }

  increaseLineHeight() {
    this.stateService.updateLineHeight(0.1);
    this.syncSettingsToBackend();
  }

  decreaseLineHeight() {
    this.stateService.updateLineHeight(-0.1);
    this.syncSettingsToBackend();
  }

  increaseMaxColumnCount() {
    this.stateService.updateMaxColumnCount(1);
    this.syncSettingsToBackend();
  }

  decreaseMaxColumnCount() {
    this.stateService.updateMaxColumnCount(-1);
    this.syncSettingsToBackend();
  }

  setGap(value: number) {
    const delta = value - this.state.gap;
    this.stateService.updateGap(delta);
    this.syncSettingsToBackend();
  }

  toggleJustify() {
    this.stateService.toggleJustify();
    this.syncSettingsToBackend();
  }

  toggleHyphenate() {
    this.stateService.toggleHyphenate();
    this.syncSettingsToBackend();
  }

  increaseMaxInlineSize() {
    this.stateService.updateMaxInlineSize(40);
    this.syncSettingsToBackend();
  }

  decreaseMaxInlineSize() {
    this.stateService.updateMaxInlineSize(-40);
    this.syncSettingsToBackend();
  }

  increaseMaxBlockSize() {
    this.stateService.updateMaxBlockSize(60);
    this.syncSettingsToBackend();
  }

  decreaseMaxBlockSize() {
    this.stateService.updateMaxBlockSize(-60);
    this.syncSettingsToBackend();
  }

  toggleDarkMode() {
    this.stateService.toggleDarkMode();
    this.syncSettingsToBackend();
  }

  onThemeChange(themeName: string) {
    this.stateService.setThemeByName(themeName);
    this.syncSettingsToBackend();
  }

  setFlow(flow: 'paginated' | 'scrolled') {
    this.stateService.setFlow(flow);
    this.viewManager.getRenderer()?.setAttribute?.('flow', flow);
    this.syncSettingsToBackend();
  }

  setWritingMode(writingMode: ReaderWritingMode) {
    this.stateService.setWritingMode(writingMode);
    this.syncSettingsToBackend();
  }

  setPageDirection(pageDirection: ReaderPageDirection) {
    this.stateService.setPageDirection(pageDirection);
    this.syncSettingsToBackend();
  }

  setAnnotationColor(color: string): void {
    this.selectedAnnotationColor = color;
    localStorage.setItem('selectedAnnotationColor', color);
  }

  getSelectedAnnotationColor(): string {
    const stored = localStorage.getItem('selectedAnnotationColor');
    return stored || this.selectedAnnotationColor;
  }
}
