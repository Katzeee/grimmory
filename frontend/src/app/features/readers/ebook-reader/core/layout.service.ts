import {Service, signal} from '@angular/core';
import {defer, Observable, of} from 'rxjs';
import {ReaderPageDirection} from '../state/reader-state.service';

/** How the book on screen is laid out, as the reader's styles need to know it. */
export interface BookLayout {
  vertical: boolean;
  language?: string;
}

interface LayoutRenderer {
  getContents(): {index: number; doc: Document}[];
  bookDir?: string;
  primaryIndex?: number;
  addEventListener(type: 'relocate', listener: (event: CustomEvent<{reason?: string}>) => void): void;
}

interface LayoutBook {
  dir?: string;
  metadata?: {language?: string | string[]};
}

interface LayoutView extends HTMLElement {
  book?: LayoutBook;
  renderer?: LayoutRenderer | null;
  lastLocation?: {cfi?: string; section?: {current: number}} | null;
  open(book: LayoutBook): Promise<void>;
  close(): void;
  goTo(target: string | number): Promise<void>;
}

// Renderer relocations that move the reader away from where a relayout anchored it.
const READER_MOVE_REASONS = new Set(['page', 'snap', 'scroll', 'selection']);

/**
 * Fits the open book to the reader's writing mode and page direction: measures how the book is
 * laid out, overrides the page progression it declares, and lays it out again where the reader is.
 */
@Service()
export class ReaderLayoutService {
  private view: LayoutView | null = null;
  private declaredBookDir: string | undefined;
  // Where relayouts reopen the book until the reader moves, so repeated relayouts don't drift
  // to the start of whatever spread the previous layout paired the position into.
  private relayoutAnchor: string | number | null = null;

  private readonly verticalWritingState = signal(false);
  // The writing mode of the section on screen, as last measured.
  readonly verticalWriting = this.verticalWritingState.asReadonly();
  private readonly rtlProgressionState = signal(false);
  // Whether pages turn right to left, as last applied by setPageDirection.
  readonly rtlProgression = this.rtlProgressionState.asReadonly();

  attach(view: HTMLElement): void {
    // SAFETY: the reader attaches the engine's foliate-view element.
    this.view = view as LayoutView;
  }

  // Records the page progression the book declares, which 'auto' goes back to.
  bookOpened(): void {
    this.declaredBookDir = this.view?.book?.dir;
  }

  // A navigation the reader asks for sets a new place to read from.
  clearAnchor(): void {
    this.relayoutAnchor = null;
  }

  measure(): BookLayout {
    return {vertical: this.measureVerticalWriting(), language: this.bookLanguage()};
  }

  bookLanguage(): string | undefined {
    const language = this.view?.book?.metadata?.language;
    // A book with several dc:language entries lists them all; the first is its main language.
    return [language].flat()[0];
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

  isRtlProgression(): boolean {
    const dir = this.view?.book?.dir;
    if (dir === 'rtl' || dir === 'ltr') return dir === 'rtl';
    const doc = this.view?.renderer?.getContents().at(0)?.doc;
    const body = doc?.querySelector('body');
    if (!body) return false;
    const style = doc?.defaultView?.getComputedStyle(body);
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
      view.renderer?.addEventListener('relocate', event => {
        if (READER_MOVE_REASONS.has(event.detail.reason ?? '')) this.relayoutAnchor = null;
      });
      prepare();
      await view.goTo(anchor ?? 0);
    });
  }

  private measureVerticalWriting(): boolean {
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

  // A spread can open on the last page of the previous section, which is where the location
  // points; the section being read is the renderer's primary one, from its start.
  private readingAnchor(view: LayoutView): string | number | null {
    const location = view.lastLocation;
    const primaryIndex = view.renderer?.primaryIndex;
    if (primaryIndex != null && location?.section && location.section.current !== primaryIndex) {
      return primaryIndex;
    }
    return location?.cfi ?? null;
  }
}
