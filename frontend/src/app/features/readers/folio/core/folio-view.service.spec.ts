import {describe, expect, it, vi} from 'vitest';
import {DEFAULT_FOLIO_SETTINGS} from '../state/folio-settings';
import {FolioViewService} from './folio-view.service';

interface FolioViewTestAccess {
  view: HTMLElement & {
    renderer?: EventTarget & {
      setAttribute(name: string, value: string | number): void;
      setStyles(styles: string): void;
    };
    getCFI(index: number, range: Range): string | null;
  };
  attachDocumentListeners(doc: Document, index: number): void;
  clearDocumentListeners(): void;
  attachRendererListener(): void;
  clearRendererListener(): void;
}

describe('FolioViewService', () => {
  it('emits a CFI selection when the EPUB document selection changes', async () => {
    const service = new FolioViewService();
    const access = service as unknown as FolioViewTestAccess;
    const view = document.createElement('div') as unknown as FolioViewTestAccess['view'];
    view.getCFI = vi.fn(() => 'epubcfi(/6/4,/2:0,/2:8)');
    access.view = view;

    const paragraph = document.createElement('p');
    paragraph.textContent = 'Selected passage';
    document.body.replaceChildren(paragraph);
    const range = document.createRange();
    range.setStart(paragraph.firstChild!, 0);
    range.setEnd(paragraph.firstChild!, 8);
    Object.defineProperty(range, 'getBoundingClientRect', {
      value: () => ({left: 20, top: 100, width: 80, height: 20, right: 100, bottom: 120}),
    });
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    const events: unknown[] = [];
    const subscription = service.events$.subscribe(event => events.push(event));
    access.attachDocumentListeners(document, 3);
    document.dispatchEvent(new Event('selectionchange'));
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(view.getCFI).toHaveBeenCalledWith(3, range);
    expect(events).toContainEqual({
      type: 'selection',
      detail: {
        text: 'Selected',
        cfi: 'epubcfi(/6/4,/2:0,/2:8)',
        position: {x: 120, y: 88},
      },
    });

    subscription.unsubscribe();
    access.clearDocumentListeners();
    selection.removeAllRanges();
    document.body.replaceChildren();
  });

  it('clears the selection tools when the EPUB document selection collapses', () => {
    const service = new FolioViewService();
    const access = service as unknown as FolioViewTestAccess;
    const view = document.createElement('div') as unknown as FolioViewTestAccess['view'];
    view.getCFI = vi.fn();
    access.view = view;
    window.getSelection()?.removeAllRanges();

    const events: unknown[] = [];
    const subscription = service.events$.subscribe(event => events.push(event));
    access.attachDocumentListeners(document, 0);
    document.dispatchEvent(new Event('selectionchange'));

    expect(events).toContainEqual({type: 'selection-cleared'});

    subscription.unsubscribe();
    access.clearDocumentListeners();
  });

  it('uses EPUB document clicks only to toggle the reader chrome', () => {
    const service = new FolioViewService();
    const access = service as unknown as FolioViewTestAccess;
    const view = document.createElement('div') as unknown as FolioViewTestAccess['view'];
    view.getCFI = vi.fn();
    access.view = view;
    window.getSelection()?.removeAllRanges();

    const events: unknown[] = [];
    const subscription = service.events$.subscribe(event => events.push(event));
    access.attachDocumentListeners(document, 0);
    document.body.dispatchEvent(new MouseEvent('click', {bubbles: true, clientX: 1}));
    document.body.dispatchEvent(new MouseEvent('click', {bubbles: true, clientX: 999}));

    expect(events).toEqual([{type: 'center'}, {type: 'center'}]);

    subscription.unsubscribe();
    access.clearDocumentListeners();
  });

  it('resolves generated and publisher page information for a TOC target', async () => {
    const service = new FolioViewService();
    const access = service as unknown as FolioViewTestAccess;
    const chapter = document.implementation.createHTMLDocument('Chapter');
    const paragraph = chapter.createElement('p');
    paragraph.textContent = 'Chapter text';
    chapter.body.append(paragraph);
    const view = Object.assign(document.createElement('div'), {
      book: {sections: [{createDocument: vi.fn(() => Promise.resolve(chapter))}]},
      resolveNavigation: vi.fn(() => ({index: 0, anchor: (doc: Document) => doc.body.firstElementChild!})),
      getCFI: vi.fn(() => 'epubcfi(/6/2)'),
      getCFIProgress: vi.fn(() => Promise.resolve({location: {current: 24, total: 400}})),
      getProgressOf: vi.fn(() => ({pageItem: {label: 'xv', href: 'chapter.xhtml#page'}})),
    }) as unknown as FolioViewTestAccess['view'];
    access.view = view;

    await expect(service.getLocationOf('chapter.xhtml')).resolves.toEqual({
      location: {current: 24, total: 400},
      pageItem: {label: 'xv', href: 'chapter.xhtml#page'},
    });
  });

  it('synchronizes the Foliate host background with the selected theme', () => {
    const service = new FolioViewService();
    const access = service as unknown as FolioViewTestAccess;
    const view = document.createElement('div') as unknown as FolioViewTestAccess['view'];
    view.getCFI = vi.fn();
    view.renderer = Object.assign(new EventTarget(), {setAttribute: vi.fn(), setStyles: vi.fn()});
    access.view = view;

    service.apply({...DEFAULT_FOLIO_SETTINGS, theme: 'night'});
    expect(view.style.backgroundColor).toBe('rgb(21, 23, 25)');

    service.apply({...DEFAULT_FOLIO_SETTINGS, theme: 'paper'});
    expect(view.style.backgroundColor).toBe('rgb(247, 243, 232)');
  });

  it('reports the rendered chapter page for paginated relocation events', () => {
    const service = new FolioViewService();
    const access = service as unknown as FolioViewTestAccess;
    const renderer = Object.assign(new EventTarget(), {setAttribute: vi.fn(), setStyles: vi.fn()});
    access.view = Object.assign(document.createElement('div'), {renderer}) as unknown as FolioViewTestAccess['view'];
    const events: unknown[] = [];
    const subscription = service.events$.subscribe(event => events.push(event));

    access.attachRendererListener();
    renderer.dispatchEvent(new CustomEvent('relocate', {detail: {fraction: 13 / 16, size: 1 / 16}}));

    expect(events).toContainEqual({type: 'rendered-page', detail: {current: 14, total: 16}});
    subscription.unsubscribe();
    access.clearRendererListener();
  });
});
