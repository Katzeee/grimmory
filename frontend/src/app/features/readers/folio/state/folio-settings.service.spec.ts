import {TestBed} from '@angular/core/testing';
import {of} from 'rxjs';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {BookService} from '../../../book/service/book.service';
import {FolioSettingsService} from './folio-settings.service';

describe('FolioSettingsService', () => {
  const bookService = {
    getBookSetting: vi.fn(),
    updateViewerSetting: vi.fn(),
  };

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    bookService.getBookSetting.mockReset();
    bookService.updateViewerSetting.mockReset();
    bookService.updateViewerSetting.mockReturnValue(of(void 0));
    TestBed.configureTestingModule({
      providers: [
        FolioSettingsService,
        {provide: BookService, useValue: bookService},
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('combines server-backed reader settings with Folio-only local settings', async () => {
    localStorage.setItem('grimmory.folio.settings', JSON.stringify({
      books: {'7': {writingMode: 'vertical-rl', pageTurnDirection: 'right-to-left', fontSize: 15}},
    }));
    bookService.getBookSetting.mockReturnValue(of({
      ebookSettings: {
        lineHeight: 1.9,
        justify: false,
        hyphenate: false,
        maxColumnCount: 1,
        gap: 0.12,
        fontSize: 23,
        theme: 'sepia',
        maxInlineSize: 680,
        maxBlockSize: 1300,
        fontFamily: 'serif',
        isDark: false,
        flow: 'scrolled',
      },
    }));

    const service = TestBed.inject(FolioSettingsService);
    await service.initialize(7, 9);

    expect(bookService.getBookSetting).toHaveBeenCalledWith(7, 9);
    expect(service.state()).toMatchObject({
      writingMode: 'vertical-rl',
      pageTurnDirection: 'right-to-left',
      fontFamily: 'cjk-serif',
      fontSize: 23,
      lineHeight: 1.9,
      columnGap: 12,
      textAlign: 'start',
      flow: 'scrolled',
      theme: 'sepia',
    });
  });

  it('debounces compatible updates into Grimmory viewer settings', async () => {
    bookService.getBookSetting.mockReturnValue(of({}));
    const service = TestBed.inject(FolioSettingsService);
    await service.initialize(7, 9);

    service.update({fontSize: 20});
    service.update({fontSize: 21, fontFamily: 'cjk-sans', theme: 'night', columnGap: 9});
    await vi.advanceTimersByTimeAsync(350);

    expect(bookService.updateViewerSetting).toHaveBeenCalledOnce();
    expect(bookService.updateViewerSetting).toHaveBeenCalledWith({
      ebookSettings: expect.objectContaining({
        fontSize: 21,
        fontFamily: 'sans-serif',
        theme: 'default',
        isDark: true,
        gap: 0.09,
      }),
    }, 7);
    expect(JSON.parse(localStorage.getItem('grimmory.folio.settings')!)).toMatchObject({
      books: {'7': {fontSize: 21, fontFamily: 'cjk-sans', theme: 'night', columnGap: 9}},
    });
  });
});
