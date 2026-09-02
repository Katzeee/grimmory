import {AfterViewInit, ChangeDetectionStrategy, Component, computed, DestroyRef, ElementRef, HostListener, inject, signal, ViewChild} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {ActivatedRoute, Router} from '@angular/router';
import {TranslocoPipe} from '@jsverse/transloco';
import {firstValueFrom} from 'rxjs';
import {Book} from '../../book/model/book.model';
import {BookFileService} from '../../book/service/book-file.service';
import {BookPatchService} from '../../book/service/book-patch.service';
import {BookService} from '../../book/service/book.service';
import {PageTitleService} from '../../../shared/service/page-title.service';
import {AppIconDirective} from '../../../shared/components/icon/app-icon.directive';
import {CoverComponent} from '../../../shared/components/cover/cover.component';
import {UrlHelperService} from '../../../shared/service/url-helper.service';
import {getProgressDirection, getTurnForSide, getTurnForSwipe, FolioSide, FolioSwipe, FolioTurn} from './core/folio-navigation';
import {FolioRelocateDetail, FolioViewService} from './core/folio-view.service';
import {FolioSelectionDetail} from './core/folio-view.service';
import {
  FolioFlow,
  FolioFontFamily,
  FolioPageTurnDirection,
  FolioTheme,
  FolioTextAlign,
  FolioWritingMode,
} from './state/folio-settings';
import {FolioSettingsService} from './state/folio-settings.service';
import {FolioLibraryService, FolioLibraryTab} from './state/folio-library.service';

@Component({
  selector: 'app-folio-reader',
  standalone: true,
  imports: [TranslocoPipe, AppIconDirective, CoverComponent],
  providers: [FolioViewService, FolioSettingsService, FolioLibraryService],
  templateUrl: './folio-reader.component.html',
  styleUrl: './folio-reader.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FolioReaderComponent implements AfterViewInit {
  @ViewChild('viewer', {static: true}) private viewer!: ElementRef<HTMLElement>;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly bookService = inject(BookService);
  private readonly bookFileService = inject(BookFileService);
  private readonly bookPatchService = inject(BookPatchService);
  private readonly pageTitle = inject(PageTitleService);
  private readonly urlHelper = inject(UrlHelperService);
  private readonly folioView = inject(FolioViewService);
  readonly settingsStore = inject(FolioSettingsService);
  readonly library = inject(FolioLibraryService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly book = signal<Book | null>(null);
  readonly progress = signal(0);
  readonly chapter = signal('');
  readonly currentLocation = signal<string | null>(null);
  readonly totalLocations = signal<number | null>(null);
  readonly currentPage = signal<number | null>(null);
  readonly totalPages = signal<number | null>(null);
  readonly currentTocHref = signal<string | null>(null);
  readonly chromeVisible = signal(true);
  readonly settingsVisible = signal(false);
  readonly libraryVisible = signal(false);
  readonly libraryTab = signal<FolioLibraryTab>('contents');
  readonly selection = signal<FolioSelectionDetail | null>(null);
  readonly noteEditorVisible = signal(false);
  readonly bookDetailsVisible = signal(false);
  readonly settings = this.settingsStore.state;
  readonly progressDirection = computed(() => getProgressDirection(this.settings().pageTurnDirection));
  readonly bookTitle = computed(() => this.book()?.metadata?.title || this.book()?.fileName || '');
  readonly bookAuthors = computed(() => (this.book()?.metadata?.authors ?? []).join(', '));
  readonly bookCoverUrl = computed(() => {
    const book = this.book();
    return book ? this.urlHelper.getDirectThumbnailUrl(book.id, book.metadata?.coverUpdatedOn) : null;
  });
  readonly currentBookFile = computed(() => {
    const book = this.book();
    return this.alternativeBookType
      ? book?.alternativeFormats?.find(file => file.bookType === this.alternativeBookType)
      : book?.primaryFile;
  });
  readonly bookFileSize = computed(() => {
    const sizeKb = this.currentBookFile()?.fileSizeKb;
    if (sizeKb == null) return '';
    return sizeKb >= 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${Math.round(sizeKb)} KB`;
  });

  private readonly bookId = Number(this.route.snapshot.paramMap.get('bookId'));
  private readonly alternativeBookType = this.route.snapshot.queryParamMap.get('bookType') ?? undefined;
  private bookFileId?: number;
  private currentCfi: string | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => this.folioView.destroy());
    this.folioView.events$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(event => {
        if (event.type === 'relocate') this.handleRelocate(event.detail);
        else if (event.type === 'swipe') this.turnFromSwipe(event.swipe);
        else if (event.type === 'center') this.chromeVisible.update(value => !value);
        else if (event.type === 'key') this.handleKey(event.key);
        else if (event.type === 'selection') this.selection.set(event.detail);
        else if (event.type === 'selection-cleared') this.clearSelectionState();
        else if (event.type === 'annotation') this.openLibrary('notes');
        else if (event.type === 'rendered-page') {
          this.currentPage.set(event.detail?.current ?? null);
          this.totalPages.set(event.detail?.total ?? null);
        }
        else if (event.type === 'error') this.error.set(String(event.detail));
      });
  }

  async ngAfterViewInit(): Promise<void> {
    await this.loadBook();
  }

  retry(): void {
    void this.loadBook();
  }

  @HostListener('document:keydown', ['$event'])
  handleDocumentKey(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (target?.matches('input, select, textarea, button') || target?.isContentEditable) return;
    if (['ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', ' ', 'Escape'].includes(event.key)) {
      event.preventDefault();
      this.handleKey(event.key);
    }
  }

  close(): void {
    void this.router.navigate(['/book', this.bookId]);
  }

  toggleSettings(): void {
    this.libraryVisible.set(false);
    this.bookDetailsVisible.set(false);
    this.settingsVisible.update(value => !value);
    this.chromeVisible.set(true);
  }

  toggleLibrary(tab: FolioLibraryTab = this.libraryTab()): void {
    this.settingsVisible.set(false);
    this.libraryTab.set(tab);
    if (this.libraryVisible()) this.bookDetailsVisible.set(false);
    this.libraryVisible.update(value => !value);
    this.chromeVisible.set(true);
  }

  openLibrary(tab: FolioLibraryTab): void {
    this.settingsVisible.set(false);
    this.bookDetailsVisible.set(false);
    this.libraryTab.set(tab);
    this.libraryVisible.set(true);
    this.chromeVisible.set(true);
  }

  closePanels(): void {
    this.settingsVisible.set(false);
    this.libraryVisible.set(false);
    this.noteEditorVisible.set(false);
    this.bookDetailsVisible.set(false);
  }

  openBookDetails(): void {
    this.bookDetailsVisible.set(true);
  }

  closeBookDetails(): void {
    this.bookDetailsVisible.set(false);
  }

  navigateTo(target: string): void {
    this.dismissSelection();
    this.folioView.goTo(target);
    this.libraryVisible.set(false);
  }

  search(query: string): void {
    void this.library.search(query).catch(cause => this.error.set(String(cause)));
  }

  clearSearch(): void {
    this.library.clearSearch();
  }

  toggleBookmark(): void {
    void this.library.toggleBookmark(this.currentCfi, this.chapter())
      .catch(cause => this.error.set(String(cause)));
  }

  deleteBookmark(bookmarkId: number): void {
    void this.library.deleteBookmark(bookmarkId).catch(cause => this.error.set(String(cause)));
  }

  createHighlight(): void {
    const selection = this.selection();
    if (!selection) return;
    void this.library.createHighlight(selection, '#facc15', 'highlight', this.chapter())
      .then(() => this.dismissSelection())
      .catch(cause => this.error.set(String(cause)));
  }

  showNoteEditor(): void {
    if (this.selection()) this.noteEditorVisible.set(true);
  }

  saveNote(noteContent: string): void {
    const selection = this.selection();
    if (!selection || !noteContent.trim()) return;
    void this.library.createNote(selection, noteContent, '#facc15', this.chapter())
      .then(() => this.dismissSelection())
      .catch(cause => this.error.set(String(cause)));
  }

  deleteAnnotation(annotation: Parameters<FolioLibraryService['deleteAnnotation']>[0]): void {
    void this.library.deleteAnnotation(annotation).catch(cause => this.error.set(String(cause)));
  }

  deleteNote(noteId: number): void {
    void this.library.deleteNote(noteId).catch(cause => this.error.set(String(cause)));
  }

  copySelection(): void {
    const selection = this.selection();
    if (!selection) return;
    void navigator.clipboard.writeText(selection.text).finally(() => this.dismissSelection());
  }

  dismissSelection(): void {
    this.clearSelectionState();
    this.folioView.clearSelection();
  }

  historyBack(): void {
    this.folioView.historyBack();
  }

  historyForward(): void {
    this.folioView.historyForward();
  }

  turnFromSide(side: FolioSide): void {
    this.turn(getTurnForSide(side, this.settings().pageTurnDirection));
  }

  turnFromSwipe(swipe: FolioSwipe): void {
    this.turn(getTurnForSwipe(swipe, this.settings().pageTurnDirection));
  }

  seekTo(percent: number): void {
    this.dismissSelection();
    this.folioView.goToFraction(percent / 100);
  }

  setWritingMode(value: FolioWritingMode): void {
    const next = this.settingsStore.update({writingMode: value});
    void this.folioView.reflow(next);
  }

  setPageTurnDirection(value: FolioPageTurnDirection): void {
    this.settingsStore.update({pageTurnDirection: value});
  }

  setFlow(value: FolioFlow): void {
    const next = this.settingsStore.update({flow: value});
    this.folioView.apply(next);
  }

  setFontFamily(value: FolioFontFamily): void {
    const next = this.settingsStore.update({fontFamily: value});
    this.folioView.apply(next);
  }

  setTheme(value: FolioTheme): void {
    const next = this.settingsStore.update({theme: value});
    this.folioView.apply(next);
  }

  setFontSize(value: number): void {
    const next = this.settingsStore.update({fontSize: value});
    this.folioView.apply(next);
  }

  setFontWeight(value: number): void {
    const next = this.settingsStore.update({fontWeight: value});
    this.folioView.apply(next);
  }

  setLineHeight(value: number): void {
    const next = this.settingsStore.update({lineHeight: value});
    this.folioView.apply(next);
  }

  setColumnGap(value: number): void {
    const next = this.settingsStore.update({columnGap: value});
    this.folioView.apply(next);
  }

  setParagraphSpacing(value: number): void {
    const next = this.settingsStore.update({paragraphSpacing: value});
    this.folioView.apply(next);
  }

  setLetterSpacing(value: number): void {
    const next = this.settingsStore.update({letterSpacing: value});
    this.folioView.apply(next);
  }

  setWordSpacing(value: number): void {
    const next = this.settingsStore.update({wordSpacing: value});
    this.folioView.apply(next);
  }

  setTextIndent(value: number): void {
    const next = this.settingsStore.update({textIndent: value});
    this.folioView.apply(next);
  }

  setTextAlign(value: FolioTextAlign): void {
    const next = this.settingsStore.update({textAlign: value});
    this.folioView.apply(next);
  }

  setHyphenate(value: boolean): void {
    const next = this.settingsStore.update({hyphenate: value});
    this.folioView.apply(next);
  }

  setPageMargin(value: number): void {
    const next = this.settingsStore.update({pageMargin: value});
    this.folioView.apply(next);
  }

  setMaxColumnCount(value: number): void {
    const next = this.settingsStore.update({maxColumnCount: value});
    this.folioView.apply(next);
  }

  private async loadBook(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const detail = await this.bookService.fetchFreshBookDetail(this.bookId, false);
      this.book.set(detail);
      this.pageTitle.setBookPageTitle(detail);

      const file = this.alternativeBookType
        ? detail.alternativeFormats?.find(item => item.bookType === this.alternativeBookType)
        : detail.primaryFile;
      if (!file?.id) throw new Error('Book file not found');
      this.bookFileId = file.id;
      await this.settingsStore.initialize(this.bookId, file.id);

      const blob = await firstValueFrom(this.bookFileService.getFileContent(this.bookId, this.alternativeBookType));
      this.folioView.destroy();
      await this.folioView.initialize(this.viewer.nativeElement);
      await this.folioView.open(
        blob,
        file.fileName ?? `book-${this.bookId}.epub`,
        this.settings(),
        detail.epubProgress?.cfi,
      );
      await this.library.initialize(this.bookId);
      this.bookService.updateLastReadTime(this.bookId);
    } catch (cause) {
      console.error('Failed to load book in Folio', cause);
      this.error.set(cause instanceof Error ? cause.message : String(cause));
    } finally {
      this.loading.set(false);
    }
  }

  private handleRelocate(detail: FolioRelocateDetail): void {
    if (this.selection()) this.dismissSelection();
    const fraction = Math.max(0, Math.min(1, detail.fraction ?? 0));
    this.progress.set(Math.round(fraction * 1000) / 10);
    this.chapter.set(detail.tocItem?.label ?? detail.pageItem?.label ?? '');
    this.currentLocation.set(detail.location ? String(detail.location.current + 1) : detail.pageItem?.label ?? null);
    this.totalLocations.set(detail.location?.total ?? null);
    this.currentTocHref.set(detail.tocItem?.href ?? null);
    this.currentCfi = detail.cfi ?? null;
    if (detail.cfi) {
      this.bookPatchService.saveEpubProgress(
        this.bookId,
        detail.cfi,
        detail.pageItem?.href ?? detail.tocItem?.href ?? '',
        fraction * 100,
        this.bookFileId,
      );
    }
  }

  private handleKey(key: string): void {
    if (key === 'ArrowLeft' || key === 'PageUp') this.turnFromSide('left');
    else if (key === 'ArrowRight' || key === 'PageDown') this.turnFromSide('right');
    else if (key === ' ') this.turn('next');
    else if (key === 'Escape') {
      this.settingsVisible.set(false);
      this.chromeVisible.set(true);
    }
  }

  private turn(turn: FolioTurn): void {
    this.dismissSelection();
    if (turn === 'next') this.folioView.next();
    else this.folioView.previous();
  }

  private clearSelectionState(): void {
    this.selection.set(null);
    this.noteEditorVisible.set(false);
  }
}
