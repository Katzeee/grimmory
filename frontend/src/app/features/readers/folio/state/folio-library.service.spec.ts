import {TestBed} from '@angular/core/testing';
import {of} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {AnnotationService} from '../../../../shared/service/annotation.service';
import {BookMarkService} from '../../../../shared/service/book-mark.service';
import {BookNoteV2Service} from '../../../../shared/service/book-note-v2.service';
import {FolioViewService} from '../core/folio-view.service';
import {FolioLibraryService} from './folio-library.service';

describe('FolioLibraryService', () => {
  const view = {
    getTableOfContents: vi.fn(),
    getLocationOf: vi.fn(),
    renderAnnotations: vi.fn(),
    addAnnotation: vi.fn(),
    deleteAnnotation: vi.fn(),
    clearSelection: vi.fn(),
    goTo: vi.fn(),
    clearSearch: vi.fn(),
    search: vi.fn(),
  };
  const bookmarkApi = {
    getBookmarksForBook: vi.fn(),
    createBookmark: vi.fn(),
    deleteBookmark: vi.fn(),
  };
  const annotationApi = {
    getAnnotationsForBook: vi.fn(),
    createAnnotation: vi.fn(),
    deleteAnnotation: vi.fn(),
  };
  const noteApi = {
    getNotesForBook: vi.fn(),
    createNote: vi.fn(),
    deleteNote: vi.fn(),
  };

  let service: FolioLibraryService;

  beforeEach(() => {
    vi.clearAllMocks();
    view.getTableOfContents.mockReturnValue([
      {label: 'Part one', href: 'part.xhtml', subitems: [{label: 'Chapter one', href: 'chapter.xhtml'}]},
    ]);
    view.getLocationOf.mockImplementation((href: string) => Promise.resolve({
      location: {current: href === 'part.xhtml' ? 3 : 7, total: 120},
    }));
    bookmarkApi.getBookmarksForBook.mockReturnValue(of([]));
    annotationApi.getAnnotationsForBook.mockReturnValue(of([]));
    noteApi.getNotesForBook.mockReturnValue(of([]));

    TestBed.configureTestingModule({
      providers: [
        FolioLibraryService,
        {provide: FolioViewService, useValue: view},
        {provide: BookMarkService, useValue: bookmarkApi},
        {provide: AnnotationService, useValue: annotationApi},
        {provide: BookNoteV2Service, useValue: noteApi},
      ],
    });
    service = TestBed.inject(FolioLibraryService);
  });

  it('loads Grimmory reading assets and flattens the engine table of contents', async () => {
    const annotation = {
      id: 2,
      bookId: 7,
      cfi: 'epubcfi(/6/2)',
      text: 'Selected text',
      color: '#facc15',
      style: 'highlight' as const,
      createdAt: '2026-09-02T00:00:00Z',
    };
    annotationApi.getAnnotationsForBook.mockReturnValue(of([annotation]));

    await service.initialize(7);

    expect(service.tableOfContents()).toEqual([
      expect.objectContaining({label: 'Part one', depth: 0, pageLabel: '4'}),
      expect.objectContaining({label: 'Chapter one', depth: 1, pageLabel: '8'}),
    ]);
    expect(view.renderAnnotations).toHaveBeenCalledWith([annotation]);
  });

  it('uses the first child page when a parent TOC target has no resolvable location', async () => {
    view.getLocationOf.mockImplementation((href: string) => Promise.resolve(
      href === 'part.xhtml' ? null : {location: {current: 7, total: 120}},
    ));

    await service.initialize(7);

    expect(service.tableOfContents()[0].pageLabel).toBe('8');
    expect(service.tableOfContents()[1].pageLabel).toBe('8');
  });

  it('uses the next entry page when a flat TOC heading has no resolvable location', async () => {
    view.getTableOfContents.mockReturnValue([
      {label: 'Part one', href: 'part.xhtml'},
      {label: 'Chapter one', href: 'chapter.xhtml'},
    ]);
    view.getLocationOf.mockImplementation((href: string) => Promise.resolve(
      href === 'part.xhtml' ? null : {location: {current: 7, total: 120}},
    ));

    await service.initialize(7);

    expect(service.tableOfContents()[0].pageLabel).toBe('8');
  });

  it('creates and removes a bookmark at the current CFI', async () => {
    bookmarkApi.createBookmark.mockReturnValue(of({
      id: 4,
      bookId: 7,
      cfi: 'epubcfi(/6/4)',
      title: 'Chapter two',
      createdAt: '2026-09-02T00:00:00Z',
    }));
    bookmarkApi.deleteBookmark.mockReturnValue(of(undefined));
    await service.initialize(7);

    await service.toggleBookmark('epubcfi(/6/4)', 'Chapter two');
    expect(service.bookmarks()).toHaveLength(1);

    await service.toggleBookmark('epubcfi(/6/4)', 'Chapter two');
    expect(bookmarkApi.deleteBookmark).toHaveBeenCalledWith(4);
    expect(service.bookmarks()).toEqual([]);
  });

  it('collects progressive engine search results and clears their highlights', async () => {
    view.search.mockImplementation(async function* () {
      yield {progress: 0.5};
      yield {results: [{
        cfi: 'epubcfi(/6/8)',
        excerpt: {pre: 'before ', match: 'needle', post: ' after'},
        sectionLabel: 'Chapter three',
      }]};
      yield {done: true};
    });
    await service.initialize(7);

    await service.search('needle');

    expect(service.searchState()).toEqual(expect.objectContaining({
      query: 'needle',
      progress: 1,
      searching: false,
    }));
    expect(service.searchState().results).toHaveLength(1);

    service.clearSearch();
    expect(view.clearSearch).toHaveBeenCalled();
    expect(service.searchState().results).toEqual([]);
  });

  it('persists and removes highlights through Grimmory annotations', async () => {
    const selection = {text: 'Selected text', cfi: 'epubcfi(/6/10)', position: {x: 10, y: 20}};
    const annotation = {
      id: 8,
      bookId: 7,
      cfi: selection.cfi,
      text: selection.text,
      color: '#facc15',
      style: 'highlight' as const,
      createdAt: '2026-09-02T00:00:00Z',
    };
    annotationApi.createAnnotation.mockReturnValue(of(annotation));
    annotationApi.deleteAnnotation.mockReturnValue(of(undefined));
    await service.initialize(7);

    await service.createHighlight(selection);
    expect(service.annotations()).toEqual([annotation]);
    expect(view.addAnnotation).toHaveBeenCalledWith(annotation);
    expect(view.clearSelection).toHaveBeenCalled();

    await service.deleteAnnotation(annotation);
    expect(service.annotations()).toEqual([]);
    expect(view.deleteAnnotation).toHaveBeenCalledWith(selection.cfi);
  });

  it('persists and removes notes through Grimmory book notes', async () => {
    const selection = {text: 'Selected text', cfi: 'epubcfi(/6/12)', position: {x: 10, y: 20}};
    const note = {
      id: 9,
      bookId: 7,
      cfi: selection.cfi,
      selectedText: selection.text,
      noteContent: 'Remember this',
      color: '#facc15',
      createdAt: '2026-09-02T00:00:00Z',
    };
    noteApi.createNote.mockReturnValue(of(note));
    noteApi.deleteNote.mockReturnValue(of(undefined));
    await service.initialize(7);

    await service.createNote(selection, '  Remember this  ');
    expect(service.notes()).toEqual([note]);
    expect(noteApi.createNote).toHaveBeenCalledWith(expect.objectContaining({noteContent: 'Remember this'}));
    expect(view.clearSelection).toHaveBeenCalled();

    await service.deleteNote(note.id);
    expect(service.notes()).toEqual([]);
  });
});
