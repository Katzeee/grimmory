import {inject, Injectable, signal} from '@angular/core';
import {firstValueFrom} from 'rxjs';
import {EbookViewerSetting} from '../../../book/model/book.model';
import {BookService} from '../../../book/service/book.service';
import {DEFAULT_FOLIO_SETTINGS, FolioSettings} from './folio-settings';

interface StoredFolioSettings {
  books: Record<string, Partial<FolioSettings>>;
}

@Injectable()
export class FolioSettingsService {
  private readonly bookService = inject(BookService);
  private readonly storageKey = 'grimmory.folio.settings';
  private bookId: number | null = null;
  private remoteSettings: EbookViewerSetting | null = null;
  private remoteSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly stateSignal = signal<FolioSettings>({...DEFAULT_FOLIO_SETTINGS});

  readonly state = this.stateSignal.asReadonly();

  async initialize(bookId: number, bookFileId: number): Promise<void> {
    this.bookId = bookId;
    const stored = this.readStored();
    let next = {
      ...DEFAULT_FOLIO_SETTINGS,
      ...stored.books[String(bookId)],
    };

    try {
      const bookSetting = await firstValueFrom(this.bookService.getBookSetting(bookId, bookFileId));
      this.remoteSettings = bookSetting?.ebookSettings ?? null;
      if (this.remoteSettings) next = {...next, ...this.fromRemote(this.remoteSettings)};
    } catch {
      this.remoteSettings = null;
    }

    this.stateSignal.set(next);
  }

  update(patch: Partial<FolioSettings>): FolioSettings {
    const next = {...this.stateSignal(), ...patch};
    this.stateSignal.set(next);

    if (this.bookId !== null) {
      const stored = this.readStored();
      stored.books[String(this.bookId)] = next;
      localStorage.setItem(this.storageKey, JSON.stringify(stored));
      this.queueRemoteSave(next);
    }

    return next;
  }

  private queueRemoteSave(settings: FolioSettings): void {
    if (this.bookId === null) return;
    if (this.remoteSaveTimer) clearTimeout(this.remoteSaveTimer);
    this.remoteSaveTimer = setTimeout(() => {
      this.remoteSaveTimer = null;
      if (this.bookId === null) return;
      const ebookSettings = this.toRemote(settings);
      this.remoteSettings = ebookSettings;
      void firstValueFrom(this.bookService.updateViewerSetting({ebookSettings}, this.bookId)).catch(() => undefined);
    }, 350);
  }

  private fromRemote(settings: EbookViewerSetting): Partial<FolioSettings> {
    const fontFamily = settings.fontFamily === 'serif'
      ? 'cjk-serif'
      : settings.fontFamily === 'sans-serif'
        ? 'cjk-sans'
        : 'publisher';
    const theme = settings.isDark ? 'night' : settings.theme === 'sepia' ? 'sepia' : 'paper';

    return {
      fontFamily,
      fontSize: settings.fontSize,
      lineHeight: settings.lineHeight,
      columnGap: Math.round(settings.gap * 100),
      hyphenate: settings.hyphenate,
      textAlign: settings.justify ? 'justify' : 'start',
      maxColumnCount: settings.maxColumnCount,
      maxInlineSize: settings.maxInlineSize,
      flow: settings.flow,
      theme,
    };
  }

  private toRemote(settings: FolioSettings): EbookViewerSetting {
    const fontFamily = settings.fontFamily === 'cjk-serif'
      ? 'serif'
      : settings.fontFamily === 'cjk-sans'
        ? 'sans-serif'
        : null;

    return {
      lineHeight: settings.lineHeight,
      justify: settings.textAlign === 'justify',
      hyphenate: settings.hyphenate,
      maxColumnCount: settings.maxColumnCount,
      gap: settings.columnGap / 100,
      fontSize: settings.fontSize,
      theme: settings.theme === 'sepia' ? 'sepia' : 'default',
      maxInlineSize: settings.maxInlineSize,
      maxBlockSize: this.remoteSettings?.maxBlockSize ?? 1440,
      fontFamily,
      isDark: settings.theme === 'night',
      flow: settings.flow,
    };
  }

  private readStored(): StoredFolioSettings {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return {books: {}};
      const parsed = JSON.parse(raw) as Partial<StoredFolioSettings>;
      return {books: parsed.books ?? {}};
    } catch {
      return {books: {}};
    }
  }
}
