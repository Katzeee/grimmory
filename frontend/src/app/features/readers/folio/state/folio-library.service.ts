import {computed, inject, Injectable, signal} from '@angular/core';
import {firstValueFrom} from 'rxjs';
import {Annotation, AnnotationService, AnnotationStyle} from '../../../../shared/service/annotation.service';
import {BookMark, BookMarkService} from '../../../../shared/service/book-mark.service';
import {BookNoteV2, BookNoteV2Service} from '../../../../shared/service/book-note-v2.service';
import {
  FolioSearchResult,
  FolioSelectionDetail,
  FolioTocItem,
  FolioViewService,
} from '../core/folio-view.service';

export type FolioLibraryTab = 'contents' | 'search' | 'bookmarks' | 'notes';

export interface FolioTocEntry extends FolioTocItem {
  depth: number;
  pageLabel?: string;
}

interface FolioSearchState {
  query: string;
  results: FolioSearchResult[];
  progress: number;
  searching: boolean;
}

@Injectable()
export class FolioLibraryService {
  private readonly view = inject(FolioViewService);
  private readonly bookmarkApi = inject(BookMarkService);
  private readonly annotationApi = inject(AnnotationService);
  private readonly noteApi = inject(BookNoteV2Service);

  private bookId: number | null = null;
  private searchVersion = 0;

  private readonly tableOfContentsSignal = signal<FolioTocEntry[]>([]);
  private readonly bookmarksSignal = signal<BookMark[]>([]);
  private readonly annotationsSignal = signal<Annotation[]>([]);
  private readonly notesSignal = signal<BookNoteV2[]>([]);
  private readonly searchSignal = signal<FolioSearchState>({query: '', results: [], progress: 0, searching: false});

  readonly tableOfContents = this.tableOfContentsSignal.asReadonly();
  readonly bookmarks = this.bookmarksSignal.asReadonly();
  readonly annotations = this.annotationsSignal.asReadonly();
  readonly notes = this.notesSignal.asReadonly();
  readonly searchState = this.searchSignal.asReadonly();
  readonly noteItems = computed(() => [
    ...this.annotationsSignal().map(annotation => ({kind: 'annotation' as const, item: annotation})),
    ...this.notesSignal().map(note => ({kind: 'note' as const, item: note})),
  ].sort((left, right) => right.item.createdAt.localeCompare(left.item.createdAt)));

  async initialize(bookId: number): Promise<void> {
    this.bookId = bookId;
    const tableOfContents = this.flattenToc(this.view.getTableOfContents());
    this.tableOfContentsSignal.set(tableOfContents);

    const [locatedToc, bookmarks, annotations, notes] = await Promise.allSettled([
      this.addPageLabels(tableOfContents),
      firstValueFrom(this.bookmarkApi.getBookmarksForBook(bookId)),
      firstValueFrom(this.annotationApi.getAnnotationsForBook(bookId)),
      firstValueFrom(this.noteApi.getNotesForBook(bookId)),
    ]);
    if (locatedToc.status === 'fulfilled') this.tableOfContentsSignal.set(locatedToc.value);
    this.bookmarksSignal.set(bookmarks.status === 'fulfilled' ? bookmarks.value : []);
    this.annotationsSignal.set(annotations.status === 'fulfilled' ? annotations.value : []);
    this.notesSignal.set(notes.status === 'fulfilled' ? notes.value : []);
    this.view.renderAnnotations(this.annotationsSignal());
  }

  navigate(target: string): void {
    this.view.goTo(target);
  }

  async toggleBookmark(cfi: string | null | undefined, chapterTitle: string): Promise<void> {
    if (!this.bookId || !cfi) return;
    const existing = this.bookmarksSignal().find(bookmark => bookmark.cfi === cfi);
    if (existing) {
      await this.deleteBookmark(existing.id);
      return;
    }
    const created = await firstValueFrom(this.bookmarkApi.createBookmark({
      bookId: this.bookId,
      cfi,
      title: chapterTitle || 'Bookmark',
    }));
    this.bookmarksSignal.update(items => [...items, created]);
  }

  async deleteBookmark(bookmarkId: number): Promise<void> {
    await firstValueFrom(this.bookmarkApi.deleteBookmark(bookmarkId));
    this.bookmarksSignal.update(items => items.filter(item => item.id !== bookmarkId));
  }

  async createHighlight(
    selection: FolioSelectionDetail,
    color = '#facc15',
    style: AnnotationStyle = 'highlight',
    chapterTitle?: string,
  ): Promise<void> {
    if (!this.bookId) return;
    const annotation = await firstValueFrom(this.annotationApi.createAnnotation({
      bookId: this.bookId,
      cfi: selection.cfi,
      text: selection.text,
      color,
      style,
      chapterTitle,
    }));
    this.annotationsSignal.update(items => [...items, annotation]);
    this.view.addAnnotation(annotation);
    this.view.clearSelection();
  }

  async deleteAnnotation(annotation: Annotation): Promise<void> {
    await firstValueFrom(this.annotationApi.deleteAnnotation(annotation.id));
    this.annotationsSignal.update(items => items.filter(item => item.id !== annotation.id));
    this.view.deleteAnnotation(annotation.cfi);
  }

  async createNote(selection: FolioSelectionDetail, noteContent: string, color = '#facc15', chapterTitle?: string): Promise<void> {
    if (!this.bookId || !noteContent.trim()) return;
    const note = await firstValueFrom(this.noteApi.createNote({
      bookId: this.bookId,
      cfi: selection.cfi,
      selectedText: selection.text,
      noteContent: noteContent.trim(),
      color,
      chapterTitle,
    }));
    this.notesSignal.update(items => [...items, note]);
    this.view.clearSelection();
  }

  async deleteNote(noteId: number): Promise<void> {
    await firstValueFrom(this.noteApi.deleteNote(noteId));
    this.notesSignal.update(items => items.filter(item => item.id !== noteId));
  }

  async search(query: string): Promise<void> {
    const normalized = query.trim();
    const version = ++this.searchVersion;
    if (!normalized) {
      this.clearSearch();
      return;
    }

    this.searchSignal.set({query: normalized, results: [], progress: 0, searching: true});
    const results: FolioSearchResult[] = [];
    try {
      for await (const update of this.view.search(normalized)) {
        if (version !== this.searchVersion) return;
        if (update.results) results.push(...update.results);
        this.searchSignal.set({
          query: normalized,
          results: [...results],
          progress: update.done ? 1 : update.progress ?? this.searchSignal().progress,
          searching: !update.done,
        });
      }
    } finally {
      if (version === this.searchVersion) {
        this.searchSignal.update(state => ({...state, searching: false}));
      }
    }
  }

  clearSearch(): void {
    this.searchVersion++;
    this.view.clearSearch();
    this.searchSignal.set({query: '', results: [], progress: 0, searching: false});
  }

  reset(): void {
    this.searchVersion++;
    this.bookId = null;
    this.tableOfContentsSignal.set([]);
    this.bookmarksSignal.set([]);
    this.annotationsSignal.set([]);
    this.notesSignal.set([]);
    this.searchSignal.set({query: '', results: [], progress: 0, searching: false});
  }

  private flattenToc(items: FolioTocItem[], depth = 0): FolioTocEntry[] {
    return items.flatMap(item => [
      {...item, depth},
      ...this.flattenToc(item.subitems ?? [], depth + 1),
    ]);
  }

  private async addPageLabels(entries: FolioTocEntry[]): Promise<FolioTocEntry[]> {
    const result = entries.map(entry => ({...entry}));
    let cursor = 0;
    const worker = async (): Promise<void> => {
      while (cursor < result.length) {
        const index = cursor++;
        const location = await this.view.getLocationOf(result[index].href).catch(() => null);
        const pageLabel = location?.location
          ? String(location.location.current + 1)
          : location?.pageItem?.label;
        if (pageLabel) result[index] = {...result[index], pageLabel};
      }
    };
    await Promise.all(Array.from({length: Math.min(4, result.length)}, () => worker()));
    return result.map((entry, index) => {
      if (entry.pageLabel) return entry;
      for (let childIndex = index + 1; childIndex < result.length; childIndex++) {
        const candidate = result[childIndex];
        if (candidate.depth <= entry.depth) break;
        if (candidate.pageLabel) return {...entry, pageLabel: candidate.pageLabel};
      }
      const nextEntry = result[index + 1];
      if (nextEntry?.pageLabel) return {...entry, pageLabel: nextEntry.pageLabel};
      return entry;
    });
  }
}
