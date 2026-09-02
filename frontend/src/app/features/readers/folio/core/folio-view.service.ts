import {Injectable} from '@angular/core';
import {Subject} from 'rxjs';
import {FolioSettings} from '../state/folio-settings';
import {FolioRenderedPage, FolioSwipe, getRenderedPage} from './folio-navigation';

export interface FolioTocItem {
  label: string;
  href: string;
  subitems?: FolioTocItem[];
}

export interface FolioSearchExcerpt {
  pre: string;
  match: string;
  post: string;
}

export interface FolioSearchResult {
  cfi: string;
  excerpt: FolioSearchExcerpt;
  sectionLabel?: string;
}

export interface FolioSelectionDetail {
  text: string;
  cfi: string;
  position: {x: number; y: number};
}

export interface FolioRenderableAnnotation {
  cfi: string;
  color: string;
  style: 'highlight' | 'underline' | 'strikethrough' | 'squiggly';
}

export interface FolioRelocateDetail {
  cfi?: string | null;
  fraction?: number;
  tocItem?: {label?: string; href?: string};
  pageItem?: {label?: string; href?: string};
  location?: {current: number; next?: number; total: number};
}

export interface FolioTargetLocation {
  location?: {current: number; next?: number; total: number};
  pageItem?: {label?: string; href?: string} | null;
}

type FolioViewEvent =
  | {type: 'relocate'; detail: FolioRelocateDetail}
  | {type: 'swipe'; swipe: FolioSwipe}
  | {type: 'center'}
  | {type: 'key'; key: string}
  | {type: 'selection'; detail: FolioSelectionDetail}
  | {type: 'selection-cleared'}
  | {type: 'annotation'; cfi: string}
  | {type: 'rendered-page'; detail: FolioRenderedPage | null}
  | {type: 'error'; detail: unknown};

interface FolioRenderer extends EventTarget {
  setAttribute(name: string, value: string | number): void;
  setStyles(styles: string): void;
}

interface FolioRendererRelocateDetail {
  fraction?: number;
  size?: number;
}

interface FoliateViewElement extends HTMLElement {
  renderer?: FolioRenderer;
  book?: {
    toc?: FolioTocItem[];
    sections: {createDocument(): Promise<Document>}[];
  };
  history?: {back(): void; forward(): void};
  lastLocation?: FolioRelocateDetail;
  open(file: File): Promise<void>;
  close?(): void;
  goTo(target: string | number): Promise<void>;
  goToFraction(fraction: number): Promise<void>;
  prev(): Promise<void> | void;
  next(): Promise<void> | void;
  getCFI(index: number, range?: Range): string | null;
  resolveNavigation(target: string): Promise<{index: number; anchor?: (doc: Document) => Node | Range | null}> | {index: number; anchor?: (doc: Document) => Node | Range | null} | undefined;
  getCFIProgress(cfi: string): Promise<{location?: FolioTargetLocation['location']} | null>;
  getProgressOf(index: number, range?: Range): {pageItem?: FolioTargetLocation['pageItem']};
  deselect(): void;
  addAnnotation(annotation: {value: string}): Promise<unknown> | void;
  deleteAnnotation(annotation: {value: string}): Promise<void>;
  showAnnotation(annotation: {value: string}): Promise<void>;
  search(options: {query: string; matchCase?: boolean; matchWholeWords?: boolean}): AsyncGenerator<FoliateSearchEngineResult>;
  clearSearch(): void;
}

type FoliateSearchEngineResult =
  | {progress: number}
  | {label?: string; subitems?: {cfi: string; excerpt: FolioSearchExcerpt}[]}
  | 'done';

interface FolioDrawAnnotationDetail {
  draw: (
    renderer: (rects: DOMRectList, options: {color?: string}) => SVGElement,
    options: {color: string},
  ) => void;
  annotation: {value: string};
}

@Injectable()
export class FolioViewService {
  private static enginePromise: Promise<void> | null = null;
  private readonly eventSubject = new Subject<FolioViewEvent>();
  private readonly documentCleanups: (() => void)[] = [];
  private readonly annotations = new Map<string, FolioRenderableAnnotation>();
  private view: FoliateViewElement | null = null;
  private file: File | null = null;
  private rendererCleanup: (() => void) | null = null;

  readonly events$ = this.eventSubject.asObservable();

  async initialize(container: HTMLElement): Promise<void> {
    await this.loadEngine();
    this.view = document.createElement('foliate-view') as FoliateViewElement;
    Object.assign(this.view.style, {display: 'block', width: '100%', height: '100%'});
    this.view.setAttribute('autohide-cursor', '');
    this.view.addEventListener('load', this.handleLoad);
    this.view.addEventListener('relocate', this.handleRelocate);
    this.view.addEventListener('error', this.handleError);
    this.view.addEventListener('create-overlay', this.handleCreateOverlay);
    this.view.addEventListener('draw-annotation', this.handleDrawAnnotation);
    this.view.addEventListener('show-annotation', this.handleShowAnnotation);
    container.replaceChildren(this.view);
  }

  async open(blob: Blob, fileName: string, settings: FolioSettings, target?: string | null): Promise<void> {
    if (!this.view) throw new Error('Folio view is not initialized');
    this.file = new File([blob], fileName, {type: 'application/epub+zip'});
    await this.view.open(this.file);
    this.attachRendererListener();
    this.apply(settings);
    await this.view.goTo(target ?? 0);
  }

  apply(settings: FolioSettings): void {
    const renderer = this.view?.renderer;
    if (!renderer) return;
    const background = {
      paper: '#f7f3e8',
      sepia: '#eee1c5',
      night: '#151719',
    }[settings.theme];
    this.view!.style.backgroundColor = background;
    renderer.setAttribute('flow', settings.flow);
    renderer.setAttribute('gap', `${settings.columnGap}%`);
    renderer.setAttribute('margin', `${settings.pageMargin}px`);
    renderer.setAttribute('max-column-count', settings.maxColumnCount);
    renderer.setAttribute('max-inline-size', `${settings.maxInlineSize}px`);
    renderer.setAttribute('max-block-size', '1600px');
    renderer.setStyles(this.createContentStyles(settings));
  }

  async reflow(settings: FolioSettings): Promise<void> {
    if (!this.view || !this.file) return;
    const target = this.view.lastLocation?.cfi ?? 0;
    this.clearDocumentListeners();
    this.clearRendererListener();
    this.view.close?.();
    await this.view.open(this.file);
    this.attachRendererListener();
    this.apply(settings);
    await this.view.goTo(target);
  }

  previous(): void {
    void this.view?.prev();
  }

  next(): void {
    void this.view?.next();
  }

  goToFraction(fraction: number): void {
    void this.view?.goToFraction(Math.max(0, Math.min(1, fraction)));
  }

  goTo(target: string): void {
    void this.view?.goTo(target);
  }

  historyBack(): void {
    this.view?.history?.back();
  }

  historyForward(): void {
    this.view?.history?.forward();
  }

  getTableOfContents(): FolioTocItem[] {
    return this.view?.book?.toc ?? [];
  }

  async getLocationOf(target: string): Promise<FolioTargetLocation | null> {
    const view = this.view;
    if (!view?.book) return null;
    const resolved = await view.resolveNavigation(target);
    if (!resolved || resolved.index < 0) return null;

    const doc = await view.book.sections[resolved.index]?.createDocument();
    let range: Range | undefined;
    if (doc && resolved.anchor) {
      const fragment = resolved.anchor(doc);
      if (fragment instanceof Range) range = fragment;
      else if (fragment) {
        range = doc.createRange();
        range.selectNodeContents(fragment);
      }
    }

    const cfi = view.getCFI(resolved.index, range);
    const generated = cfi ? await view.getCFIProgress(cfi) : null;
    return {
      location: generated?.location,
      pageItem: view.getProgressOf(resolved.index, range).pageItem,
    };
  }

  async *search(query: string): AsyncGenerator<{progress?: number; results?: FolioSearchResult[]; done?: boolean}> {
    if (!this.view || !query.trim()) return;
    for await (const result of this.view.search({query: query.trim()})) {
      if (result === 'done') {
        yield {done: true};
      } else if ('progress' in result) {
        yield {progress: result.progress};
      } else if (result.subitems?.length) {
        yield {
          results: result.subitems.map(item => ({
            cfi: item.cfi,
            excerpt: item.excerpt,
            sectionLabel: result.label,
          })),
        };
      }
    }
  }

  clearSearch(): void {
    this.view?.clearSearch();
  }

  renderAnnotations(annotations: FolioRenderableAnnotation[]): void {
    this.annotations.clear();
    for (const annotation of annotations) {
      this.annotations.set(annotation.cfi, annotation);
      void this.view?.addAnnotation({value: annotation.cfi});
    }
  }

  addAnnotation(annotation: FolioRenderableAnnotation): void {
    this.annotations.set(annotation.cfi, annotation);
    void this.view?.addAnnotation({value: annotation.cfi});
  }

  deleteAnnotation(cfi: string): void {
    this.annotations.delete(cfi);
    void this.view?.deleteAnnotation({value: cfi});
  }

  showAnnotation(cfi: string): void {
    void this.view?.showAnnotation({value: cfi});
  }

  clearSelection(): void {
    this.view?.deselect();
  }

  destroy(): void {
    this.clearDocumentListeners();
    this.clearRendererListener();
    if (this.view) {
      this.view.removeEventListener('load', this.handleLoad);
      this.view.removeEventListener('relocate', this.handleRelocate);
      this.view.removeEventListener('error', this.handleError);
      this.view.removeEventListener('create-overlay', this.handleCreateOverlay);
      this.view.removeEventListener('draw-annotation', this.handleDrawAnnotation);
      this.view.removeEventListener('show-annotation', this.handleShowAnnotation);
      this.view.close?.();
      this.view.remove();
      this.view = null;
    }
    this.file = null;
    this.annotations.clear();
  }

  private loadEngine(): Promise<void> {
    if (customElements.get('foliate-view')) return Promise.resolve();
    if (FolioViewService.enginePromise) return FolioViewService.enginePromise;

    FolioViewService.enginePromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.type = 'module';
      script.src = '/assets/folio-engine/view.js';
      script.onload = () => customElements.whenDefined('foliate-view').then(() => resolve());
      script.onerror = () => {
        FolioViewService.enginePromise = null;
        script.remove();
        reject(new Error('Failed to load the Folio engine'));
      };
      document.head.appendChild(script);
    });
    return FolioViewService.enginePromise;
  }

  private readonly handleLoad = (event: Event): void => {
    const {doc, index} = (event as CustomEvent<{doc?: Document; index?: number}>).detail ?? {};
    if (doc && index !== undefined) this.attachDocumentListeners(doc, index);
  };

  private readonly handleRelocate = (event: Event): void => {
    this.eventSubject.next({
      type: 'relocate',
      detail: (event as CustomEvent<FolioRelocateDetail>).detail,
    });
  };

  private readonly handleError = (event: Event): void => {
    this.eventSubject.next({type: 'error', detail: (event as CustomEvent<unknown>).detail});
  };

  private readonly handleCreateOverlay = (): void => {
    for (const annotation of this.annotations.values()) {
      void this.view?.addAnnotation({value: annotation.cfi});
    }
  };

  private readonly handleDrawAnnotation = (event: Event): void => {
    const detail = (event as CustomEvent<FolioDrawAnnotationDetail>).detail;
    const annotation = this.annotations.get(detail.annotation.value);
    if (!annotation) return;
    detail.draw(this.getAnnotationRenderer(annotation.style), {color: annotation.color});
  };

  private readonly handleShowAnnotation = (event: Event): void => {
    const value = (event as CustomEvent<{value?: string}>).detail?.value;
    if (value) this.eventSubject.next({type: 'annotation', cfi: value});
  };

  private attachDocumentListeners(doc: Document, index: number): void {
    let touchStart: {x: number; y: number} | null = null;

    const click = (event: MouseEvent): void => {
      const target = event.target as Element | null;
      if (target?.closest('a, button, input, textarea, select')) return;
      const selection = doc.defaultView?.getSelection();
      if (selection && !selection.isCollapsed) return;

      this.eventSubject.next({type: 'center'});
    };

    const touchstart = (event: TouchEvent): void => {
      if (event.touches.length !== 1) return;
      touchStart = {x: event.touches[0].clientX, y: event.touches[0].clientY};
    };

    const touchend = (event: TouchEvent): void => {
      const selection = doc.defaultView?.getSelection();
      if (selection && !selection.isCollapsed) {
        this.emitSelection(doc, index);
        touchStart = null;
        return;
      }
      if (!touchStart || event.changedTouches.length !== 1) return;
      const touch = event.changedTouches[0];
      const dx = touch.clientX - touchStart.x;
      const dy = touch.clientY - touchStart.y;
      touchStart = null;
      if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.25) return;
      this.eventSubject.next({type: 'swipe', swipe: dx < 0 ? 'swipe-left' : 'swipe-right'});
    };

    const mouseup = (): void => this.emitSelection(doc, index);
    const selectionchange = (): void => {
      const selection = doc.defaultView?.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        this.eventSubject.next({type: 'selection-cleared'});
        return;
      }
      this.emitSelection(doc, index);
    };

    const keydown = (event: KeyboardEvent): void => {
      if ((event.target as HTMLElement | null)?.isContentEditable) return;
      if (['ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', ' ', 'Escape'].includes(event.key)) {
        event.preventDefault();
        this.eventSubject.next({type: 'key', key: event.key});
      }
    };

    doc.addEventListener('click', click);
    doc.addEventListener('touchstart', touchstart, {passive: true});
    doc.addEventListener('touchend', touchend, {passive: true});
    doc.addEventListener('mouseup', mouseup);
    doc.addEventListener('selectionchange', selectionchange);
    doc.addEventListener('keydown', keydown);
    this.documentCleanups.push(() => {
      doc.removeEventListener('click', click);
      doc.removeEventListener('touchstart', touchstart);
      doc.removeEventListener('touchend', touchend);
      doc.removeEventListener('mouseup', mouseup);
      doc.removeEventListener('selectionchange', selectionchange);
      doc.removeEventListener('keydown', keydown);
    });
  }

  private emitSelection(doc: Document, index: number): void {
    setTimeout(() => {
      const selection = doc.defaultView?.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0);
      const text = range.toString().trim();
      if (!text) return;
      const cfi = this.view?.getCFI(index, range);
      if (!cfi) return;
      const frame = doc.defaultView?.frameElement as HTMLIFrameElement | null;
      const frameRect = frame?.getBoundingClientRect();
      const rangeRect = range.getBoundingClientRect();
      this.eventSubject.next({
        type: 'selection',
        detail: {
          text,
          cfi,
          position: {
            x: Math.max(120, Math.min((frameRect?.left ?? 0) + rangeRect.left + rangeRect.width / 2, window.innerWidth - 120)),
            y: Math.max(72, (frameRect?.top ?? 0) + rangeRect.top - 12),
          },
        },
      });
    }, 10);
  }

  private clearDocumentListeners(): void {
    for (const cleanup of this.documentCleanups.splice(0)) cleanup();
  }

  private attachRendererListener(): void {
    this.clearRendererListener();
    const renderer = this.view?.renderer;
    if (!renderer) return;
    const relocate = (event: Event): void => {
      const {fraction, size} = (event as CustomEvent<FolioRendererRelocateDetail>).detail ?? {};
      this.eventSubject.next({type: 'rendered-page', detail: getRenderedPage(fraction, size)});
    };
    renderer.addEventListener('relocate', relocate);
    this.rendererCleanup = () => renderer.removeEventListener('relocate', relocate);
  }

  private clearRendererListener(): void {
    this.rendererCleanup?.();
    this.rendererCleanup = null;
  }

  private createContentStyles(settings: FolioSettings): string {
    const colors = {
      paper: {background: '#f7f3e8', foreground: '#24211c', link: '#6d4d2e'},
      sepia: {background: '#eee1c5', foreground: '#342a20', link: '#7b4b2b'},
      night: {background: '#151719', foreground: '#e3ded3', link: '#c6a46a'},
    }[settings.theme];
    const fontFamily = {
      publisher: null,
      'cjk-serif': '"Noto Serif CJK SC", "Source Han Serif SC", "Songti SC", SimSun, serif',
      'cjk-sans': '"Noto Sans CJK SC", "Source Han Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
    }[settings.fontFamily];
    const writingMode = settings.writingMode === 'publisher' ? '' : `
      html, body {
        writing-mode: ${settings.writingMode} !important;
        -webkit-writing-mode: ${settings.writingMode} !important;
        direction: ltr !important;
      }
    `;

    return `
      :root {
        color-scheme: ${settings.theme === 'night' ? 'dark' : 'light'};
        font-size: ${settings.fontSize}px;
        font-weight: ${settings.fontWeight};
        line-height: ${settings.lineHeight};
        background: ${colors.background};
        color: ${colors.foreground};
      }
      html, body {
        background: ${colors.background} !important;
        color: ${colors.foreground} !important;
        hanging-punctuation: allow-end last;
        orphans: 2;
        widows: 2;
      }
      ${fontFamily ? `body { font-family: ${fontFamily} !important; }` : ''}
      ${writingMode}
      p, li, blockquote, dd {
        line-height: ${settings.lineHeight} !important;
        letter-spacing: ${settings.letterSpacing}em !important;
        word-spacing: ${settings.wordSpacing}em !important;
        ${settings.textAlign === 'publisher' ? '' : `text-align: ${settings.textAlign} !important;`}
        ${settings.hyphenate ? 'hyphens: auto;' : 'hyphens: none !important;'}
      }
      p { margin-block: ${settings.paragraphSpacing}em !important; text-indent: ${settings.textIndent}em !important; }
      a:any-link { color: ${colors.link} !important; }
      img, svg, video { max-inline-size: 100%; }
      ruby { ruby-position: over; }
      ::selection { background: color-mix(in srgb, ${colors.link} 35%, transparent); }
    `;
  }

  private getAnnotationRenderer(style: FolioRenderableAnnotation['style']): (rects: DOMRectList, options: {color?: string}) => SVGElement {
    const create = (tag: string): SVGElement => document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (style === 'highlight') {
      return (rects, {color = '#facc15'} = {}) => {
        const group = create('g');
        group.setAttribute('fill', color);
        group.style.opacity = '0.35';
        for (const rect of Array.from(rects)) {
          const element = create('rect');
          element.setAttribute('x', String(rect.left));
          element.setAttribute('y', String(rect.top));
          element.setAttribute('width', String(rect.width));
          element.setAttribute('height', String(rect.height));
          group.append(element);
        }
        return group;
      };
    }

    return (rects, {color = '#eab308'} = {}) => {
      const group = create('g');
      group.setAttribute('fill', style === 'squiggly' ? 'none' : color);
      group.setAttribute('stroke', color);
      group.setAttribute('stroke-width', '2');
      for (const rect of Array.from(rects)) {
        const line = create('line');
        const y = style === 'strikethrough' ? rect.top + rect.height / 2 : rect.bottom - 1;
        line.setAttribute('x1', String(rect.left));
        line.setAttribute('x2', String(rect.right));
        line.setAttribute('y1', String(y));
        line.setAttribute('y2', String(y));
        group.append(line);
      }
      return group;
    };
  }
}
