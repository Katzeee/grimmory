import {inject, Service, signal} from '@angular/core';
import {defer, from, Observable, of, throwError, timer} from 'rxjs';
import {catchError, map, switchMap} from 'rxjs/operators';
import {ReaderAnnotationService, Annotation} from '../features/annotations/annotation-renderer.service';
import {ReaderEventService, ViewEvent, TextSelection} from './event.service';
import {PageInfo, ThemeInfo, PageDecorator} from '../shared/header-footer.util';
import {EpubStreamingService, EpubBookInfo} from './epub-streaming.service';
import {ReaderPageDirection, ReaderStateService} from '../state/reader-state.service';
import {ReaderFootnoteService} from '../features/footnotes/footnote.service';

export type {ViewEvent, TextSelection} from './event.service';
export type {PageInfo, ThemeInfo} from '../shared/header-footer.util';

interface FoliateTocItem {
  label: string;
  href: string;
  subitems?: FoliateTocItem[];
}

interface TocItem {
  label: string;
  href: string;
  subitems?: TocItem[];
}

export interface BookMetadata {
  title?: string;
  authors?: string[];
  language?: string;
  publisher?: string;
  description?: string;
  identifier?: string;
  coverUrl?: string | null;

  [key: string]: unknown;
}

interface RendererContent {
  index: number;
  doc: Document;
}

export interface FoliateRenderer {
  heads?: HTMLElement[];
  feet?: HTMLElement[];
  getContents(): RendererContent[];
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string | number): void;
  removeAttribute(name: string): void;
  setStyles?(css: string): void;
  bookDir?: string;
  primaryIndex?: number;
  scrolled?: boolean;
  scrollProp?: string;
  containerPosition?: number;
  addEventListener?(type: 'relocate', listener: (event: CustomEvent<{ reason?: string }>) => void): void;
}

interface FoliateBook {
  dir?: string;
  toc?: FoliateTocItem[];
  metadata?: BookMetadata;
  getCover?(): Promise<Blob | null> | null;
}

interface FoliateSearchSubitem {
  cfi: string;
  excerpt: {
    pre: string;
    match: string;
    post: string;
  };
}

interface FoliateSearchProgress {
  progress: number;
}

interface FoliateSearchSectionResult {
  label?: string;
  subitems?: FoliateSearchSubitem[];
}

type FoliateSearchResult = FoliateSearchProgress | FoliateSearchSectionResult | 'done';

interface FoliateViewElement extends HTMLElement {
  isFixedLayout: boolean;
  renderer?: FoliateRenderer | null;
  book?: FoliateBook;
  lastLocation?: { cfi?: string; section?: { current: number } } | null;
  open(target: File | object): Promise<void>;
  close(): void;
  goTo(target: string | number): Promise<void>;
  goToFraction(fraction: number): Promise<void>;
  prev(): void;
  next(): void;
  getCFI(index: number, range: Range): string | null;
  deselect(): void;
  addAnnotation(annotation: { value: string }): void;
  deleteAnnotation(annotation: { value: string }): Promise<void>;
  showAnnotation(annotation: { value: string }): Promise<void>;
  getSectionFractions?(): number[];
  search?(opts: { query: string; matchCase?: boolean; matchWholeWords?: boolean }): AsyncGenerator<FoliateSearchResult>;
  clearSearch?(): void;
}

interface StreamingLoaderModule {
  makeStreamingBook: (
    bookId: number,
    baseUrl: string,
    bookInfo: EpubBookInfo,
    authToken: string | null,
    bookType?: string
  ) => Promise<object>;
}

const STREAMING_LOADER_URL = '/assets/foliate/streaming-loader.js';

// Renderer relocations that move the reader away from where a relayout anchored it.
const READER_MOVE_REASONS = new Set(['page', 'snap', 'scroll', 'selection']);

@Service()
export class ReaderViewManagerService {
  private readonly annotationService = inject(ReaderAnnotationService);
  private readonly eventService = inject(ReaderEventService);
  private readonly epubStreamingService = inject(EpubStreamingService);
  private readonly readerStateService = inject(ReaderStateService);
  private readonly footnoteService = inject(ReaderFootnoteService);
  private view: FoliateViewElement | null = null;
  private declaredBookDir: string | undefined;
  private readonly verticalWritingState = signal(false);
  // The writing mode of the section on screen, as last measured by isVerticalWriting.
  readonly verticalWriting = this.verticalWritingState.asReadonly();
  private readonly rtlProgressionState = signal(false);
  // Whether pages turn right to left, as last applied by setPageDirection.
  readonly rtlProgression = this.rtlProgressionState.asReadonly();
  // Where relayouts reopen the book until the reader moves, so repeated relayouts don't drift
  // to the start of whatever spread the previous layout paired the position into.
  private relayoutAnchor: string | number | null = null;

  public get events$(): Observable<ViewEvent> {
    return this.eventService.events$;
  }

  createView(container: HTMLElement): void {
    this.view = document.createElement('foliate-view') as FoliateViewElement;
    this.view.style.width = '100%';
    this.view.style.height = '100%';
    this.view.style.display = 'block';
    container.appendChild(this.view);

    this.footnoteService.load().catch((error: unknown) => console.error('Failed to load footnote support', error));
    this.view.addEventListener('link', event => {
      const view = this.view;
      this.footnoteService.handleLink(event, view?.book, href => void view?.goTo(href));
    });

    this.eventService.initialize(this.view, {
      prev: () => this.prev(),
      next: () => this.next(),
      getCFI: (index: number, range: Range) => this.view?.getCFI(index, range) ?? null,
      getContents: () => this.view?.renderer?.getContents() ?? null,
      isTapToTurnEnabled: () => this.readerStateService.state().tapToTurnPage,
      isRtlProgression: () => this.isRtlProgression()
    });
  }

  loadEpub(epubPath: string): Observable<void> {
    if (!this.view) {
      return throwError(() => new Error('View not created'));
    }

    const view = this.view;
    return timer(100).pipe(
      switchMap(() => from(fetch(epubPath))),
      switchMap(response => {
        if (!response.ok) {
          throw new Error(`EPUB not found: ${response.status}`);
        }
        return from(response.blob());
      }),
      switchMap(blob => {
        const file = new File([blob], epubPath.split('/').pop() || 'book.epub', {
          type: 'application/epub+zip'
        });
        return from(view.open(file));
      }),
      map(() => {
        this.declaredBookDir = view.book?.dir;
      }),
      catchError(err => throwError(() => err))
    );
  }

  loadEpubStreaming(bookId: number, bookType?: string): Observable<void> {
    if (!this.view) {
      return throwError(() => new Error('View not created'));
    }

    return this.epubStreamingService.getBookInfo(bookId, bookType).pipe(
      switchMap(bookInfo => from(this.openStreamingBook(bookId, bookInfo, bookType))),
      map(() => undefined),
      catchError(err => throwError(() => err))
    );
  }

  private async openStreamingBook(bookId: number, bookInfo: EpubBookInfo, bookType?: string): Promise<void> {
    const {makeStreamingBook} = await import(/* @vite-ignore */ STREAMING_LOADER_URL) as StreamingLoaderModule;
    const baseUrl = this.epubStreamingService.getBaseUrl();
    const authToken = this.epubStreamingService.getAuthToken();
    const book = await makeStreamingBook(bookId, baseUrl, bookInfo, authToken, bookType);
    const view = this.view;
    if (!view) {
      throw new Error('View not created');
    }
    await view.open(book);
    this.declaredBookDir = view.book?.dir;
  }

  /**
   * Overrides the page progression the book declares. The renderer reads it when it lays out
   * pages, so it applies from the next navigation; `reopen` applies it to an open book.
   */
  setPageDirection(direction: ReaderPageDirection): void {
    const book = this.view?.book;
    const renderer = this.view?.renderer;
    if (!book || !renderer) return;
    const dir = direction === 'auto' ? this.declaredBookDir : direction;
    book.dir = dir;
    renderer.bookDir = dir;
    this.rtlProgressionState.set(this.isRtlProgression());
  }

  // A spread can open on the last page of the previous section, which is where the location
  // points; the section being read is the renderer's primary one, from its start.
  private readingAnchor(view: FoliateViewElement): string | number | null {
    const location = view.lastLocation;
    const primaryIndex = view.renderer?.primaryIndex;
    if (primaryIndex != null && location?.section && location.section.current !== primaryIndex) {
      return primaryIndex;
    }
    return location?.cfi ?? null;
  }

  isVerticalWriting(): boolean {
    const renderer = this.view?.renderer;
    if (!renderer) return false;
    const contents = renderer.getContents();
    const content = contents.find(item => item.index === renderer.primaryIndex) ?? contents.at(0);
    // A section's document has no body while it is still loading.
    const body = content?.doc.querySelector('body');
    const win = content?.doc.defaultView;
    if (!body || !win) return false;
    const vertical = win.getComputedStyle(body).writingMode.startsWith('vertical');
    this.verticalWritingState.set(vertical);
    return vertical;
  }

  bookLanguage(): string | undefined {
    const language = this.view?.book?.metadata?.language;
    // A book with several dc:language entries lists them all; the first is its main language.
    return [language].flat()[0];
  }

  isRtlProgression(): boolean {
    const dir = this.view?.book?.dir;
    if (dir === 'rtl' || dir === 'ltr') return dir === 'rtl';
    const doc = this.view?.renderer?.getContents()[0]?.doc;
    if (!doc?.body) return false;
    const style = doc.defaultView?.getComputedStyle(doc.body);
    return style?.writingMode === 'vertical-rl' || style?.direction === 'rtl';
  }

  /**
   * Lays the open book out again from the current position. Writing mode and page progression
   * are read when a section loads, so changing either takes a fresh renderer. `prepare` runs on
   * the new renderer before it navigates.
   */
  reopen(prepare: () => void): Observable<void> {
    const view = this.view;
    const book = view?.book;
    if (!view || !book) return of(undefined);
    const anchor = this.relayoutAnchor ?? this.readingAnchor(view);
    this.relayoutAnchor = anchor;
    return defer(async () => {
      view.close();
      await view.open(book);
      view.renderer?.addEventListener?.('relocate', event => {
        if (READER_MOVE_REASONS.has(event.detail.reason ?? '')) this.relayoutAnchor = null;
      });
      prepare();
      await view.goTo(anchor ?? 0);
    });
  }

  destroy(): void {
    this.eventService.destroy();
    this.view?.remove();
    this.view = null;
  }

  goTo(target?: string | number | null): Observable<void> {
    const resolvedTarget = target ?? 0;
    if (!this.view) {
      return of(undefined);
    }
    const view = this.view;
    this.relayoutAnchor = null;
    return defer(() =>
      from(view.goTo(resolvedTarget))
    ).pipe(
      map(() => undefined)
    );
  }

  goToSection(index: number): Observable<void> {
    return this.goTo(index);
  }

  goToFraction(fraction: number): Observable<void> {
    if (!this.view) {
      return of(undefined);
    }
    const view = this.view;
    this.relayoutAnchor = null;
    return defer(() => from(view.goToFraction(fraction))).pipe(
      map(() => undefined)
    );
  }

  prev(): void {
    this.view?.prev();
  }

  next(): void {
    this.view?.next();
  }

  getRenderer(): FoliateRenderer | null {
    return this.view?.renderer ?? null;
  }

  getSelection(): TextSelection | null {
    const renderer = this.getRenderer();
    if (!renderer) return null;

    const contents = renderer.getContents();
    if (!contents || contents.length === 0) return null;

    const {index, doc} = contents[0];
    if (!doc) return null;

    const selection = doc.defaultView?.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;

    const range = selection.getRangeAt(0);
    const text = range.toString().trim();
    if (!text) return null;

    const cfi = this.view?.getCFI(index, range);
    if (!cfi) return null;

    return {text, cfi, range, index};
  }

  clearSelection(): void {
    this.view?.deselect();
  }

  addAnnotation(annotation: Annotation): Observable<{index: number; label: string} | undefined> {
    return this.annotationService.addAnnotation(this.view, annotation);
  }

  deleteAnnotation(cfi: string): Observable<void> {
    return this.annotationService.deleteAnnotation(this.view, cfi);
  }

  addAnnotations(annotations: Annotation[]): void {
    this.annotationService.addAnnotations(this.view, annotations);
  }

  updateHeadersAndFooters(chapterName: string, pageInfo?: PageInfo, theme?: ThemeInfo, timeRemainingLabel?: string): void {
    const renderer = this.getRenderer();
    PageDecorator.updateHeadersAndFooters(renderer, chapterName, pageInfo, theme, timeRemainingLabel);
  }

  getChapters(): TocItem[] {
    if (!this.view?.book?.toc) return [];

    const mapToc = (items: FoliateTocItem[]): TocItem[] =>
      items.map(item => ({
        label: item.label,
        href: item.href,
        subitems: item.subitems?.length ? mapToc(item.subitems) : undefined
      }));

    return mapToc(this.view.book.toc);
  }

  getSectionFractions(): number[] {
    if (!this.view?.getSectionFractions) return [];
    return this.view.getSectionFractions();
  }

  getMetadata(): Observable<BookMetadata> {
    if (!this.view?.book?.metadata) {
      return of({});
    }

    const {metadata} = this.view.book;

    return this.getCoverUrl().pipe(
      map(coverUrl => ({
        title: metadata.title,
        authors: metadata.authors,
        language: metadata.language,
        publisher: metadata.publisher,
        description: metadata.description,
        identifier: metadata.identifier,
        coverUrl,
        ...metadata
      }))
    );
  }

  getCover(): Observable<Blob | null> {
    if (!this.view?.book?.getCover) {
      return of(null);
    }
    const book = this.view.book;
    return defer(() => {
      const coverPromise = book.getCover?.();
      return coverPromise ? from(coverPromise) : of(null);
    });
  }

  getCoverUrl(): Observable<string | null> {
    return this.getCover().pipe(
      map(blob => blob ? URL.createObjectURL(blob) : null)
    );
  }

  async* search(opts: { query: string; matchCase?: boolean; matchWholeWords?: boolean }): AsyncGenerator<FoliateSearchResult> {
    const search = this.view?.search;
    if (!search) return;
    yield* search.call(this.view, opts);
  }

  clearSearch(): void {
    this.view?.clearSearch?.();
  }
}
