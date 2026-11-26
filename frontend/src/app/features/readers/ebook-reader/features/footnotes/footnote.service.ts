import {inject, Service, signal} from '@angular/core';
import {ReaderStateService} from '../../state/reader-state.service';
import {ReaderStyleService} from '../../core/style.service';
import {ReaderLayoutService} from '../../core/layout.service';

const FOOTNOTES_URL = '/assets/foliate/footnotes.js';

// A note larger than these shares of the window scrolls inside the popup.
const MAX_HEIGHT_RATIO = 0.45;
const MAX_WIDTH_RATIO = 0.92;
const MAX_WIDTH = 640;
// The popup's padding, outside the size it is given.
const PADDING_X = 40;
const PADDING_Y = 32;

export interface FootnotePopupSize {
  width: number;
  height: number;
}

interface FootnoteRenderer {
  getContents(): {doc: Document}[];
  setAttribute(name: string, value: string): void;
  setStyles?(css: string): void;
  addEventListener(type: 'relocate', listener: () => void, options?: AddEventListenerOptions): void;
}

interface FootnoteView extends HTMLElement {
  renderer: FootnoteRenderer;
  close?(): void;
}

interface LinkDetail {
  a: Element;
  href: string;
}

// The open book, which the engine's footnote handler resolves links against.
interface FootnoteBook {
  readonly sections: unknown;
}

// The engine's view, which dispatches link events and holds the open book.
interface LinkSource extends EventTarget {
  book: FootnoteBook | undefined;
}

interface FootnoteHandlerLike extends EventTarget {
  handle(book: FootnoteBook, event: Event): Promise<void> | undefined;
}

interface FootnotesModule {
  FootnoteHandler: new () => FootnoteHandlerLike;
  isFootnoteBacklink(a: Element): boolean;
}

/**
 * Shows the note a footnote reference points to in a popup over the page, so reading stays where
 * it is. The engine extracts the note into a view of its own; this service styles that view like
 * the book, places it in the popup and sizes the popup to the note.
 */
@Service()
export class ReaderFootnoteService {
  private readonly stateService = inject(ReaderStateService);
  private readonly styleService = inject(ReaderStyleService);
  private readonly layout = inject(ReaderLayoutService);

  private readonly openState = signal(false);
  readonly open = this.openState.asReadonly();
  private readonly sizeState = signal<FootnotePopupSize>({width: 0, height: 0});
  readonly size = this.sizeState.asReadonly();

  private module: FootnotesModule | null = null;
  private handler: FootnoteHandlerLike | null = null;
  private container: HTMLElement | null = null;
  private view: FootnoteView | null = null;
  private navigate: (href: string) => void = () => undefined;

  // A link is claimed while its click is dispatched, so the handler loads ahead of any click.
  async load(): Promise<void> {
    if (this.module) return;
    // SAFETY: the engine's footnotes module exports FootnoteHandler and isFootnoteBacklink.
    this.module = await import(/* @vite-ignore */ FOOTNOTES_URL) as FootnotesModule;
    this.handler = new this.module.FootnoteHandler();
    this.handler.addEventListener('before-render', event => this.prepare(this.viewOf(event)));
    this.handler.addEventListener('render', event => this.show(this.viewOf(event)));
  }

  attachContainer(container: HTMLElement | null): void {
    this.container = container;
  }

  /**
   * Opens the note behind a link the reader clicked. A link that is not a note is left to
   * navigate as usual, and one that looked like a note but leads to none navigates instead.
   */
  handleLink(event: Event, navigate: (href: string) => void): void {
    // SAFETY: the reader listens for link events on the engine's view.
    const book = (event.currentTarget as LinkSource | null)?.book;
    if (!this.handler || !book) return;
    this.navigate = navigate;
    // SAFETY: the view's link event carries the clicked anchor and its resolved href.
    const {href} = (event as CustomEvent<LinkDetail>).detail;
    this.handler.handle(book, event)?.catch(() => {
      this.close();
      navigate(href);
    });
  }

  close(): void {
    this.openState.set(false);
    this.view?.close?.();
    this.view = null;
    this.container?.replaceChildren();
  }

  private viewOf(event: Event): FootnoteView {
    // SAFETY: the footnote handler's events carry the note's view.
    return (event as CustomEvent<{view: FootnoteView}>).detail.view;
  }

  // The view goes into the popup before the note loads and lays it out as one scrolled column.
  private prepare(view: FootnoteView): void {
    this.view?.close?.();
    this.view = view;
    this.sizeState.set(this.maxSize());
    view.style.display = 'block';
    view.style.width = '100%';
    view.style.height = '100%';
    this.container?.replaceChildren(view);

    const {renderer} = view;
    renderer.setAttribute('flow', 'scrolled');
    // The note alone: scrolled flow would otherwise run on into the sections after it.
    renderer.setAttribute('no-preload', '');
    for (const side of ['top', 'right', 'bottom', 'left']) {
      renderer.setAttribute(`margin-${side}`, '0px');
    }
    renderer.setAttribute('gap', '0%');
    renderer.setStyles?.(this.styleService.generateCSS(this.stateService.state(), this.layout.measure()));

    view.addEventListener('link', event => this.followNoteLink(event));
  }

  private show(view: FootnoteView): void {
    view.renderer.addEventListener('relocate', () => {
      this.sizeState.set(this.fitSize(view));
      this.openState.set(true);
    }, {once: true});
  }

  private maxSize(): FootnotePopupSize {
    return {
      width: Math.round(Math.min(window.innerWidth * MAX_WIDTH_RATIO - PADDING_X, MAX_WIDTH)),
      height: Math.round(window.innerHeight * MAX_HEIGHT_RATIO - PADDING_Y),
    };
  }

  // The note is laid out at the largest size first; the popup then shrinks along the direction
  // its lines stack in, down to what the note fills.
  private fitSize(view: FootnoteView): FootnotePopupSize {
    const max = this.maxSize();
    const doc = view.renderer.getContents().at(0)?.doc;
    // A section's document has no body while it is still loading.
    const body = doc?.querySelector('body');
    const win = doc?.defaultView;
    if (!doc || !body || !win) return max;
    const root = doc.documentElement;
    if (win.getComputedStyle(body).writingMode.startsWith('vertical')) {
      return {...max, width: Math.min(max.width, Math.ceil(root.scrollWidth))};
    }
    return {...max, height: Math.min(max.height, Math.ceil(root.scrollHeight))};
  }

  // A link inside a note leads back into the book: a backlink returns to where the reader already
  // is, and any other link closes the note and goes there.
  private followNoteLink(event: Event): void {
    event.preventDefault();
    // SAFETY: the view's link event carries the clicked anchor and its resolved href.
    const {a, href} = (event as CustomEvent<LinkDetail>).detail;
    const backlink = this.module?.isFootnoteBacklink(a) ?? false;
    this.close();
    if (!backlink) this.navigate(href);
  }
}
