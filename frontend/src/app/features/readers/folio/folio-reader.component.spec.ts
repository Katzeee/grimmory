import {signal, WritableSignal} from '@angular/core';
import {describe, expect, it, vi} from 'vitest';
import {FolioSelectionDetail} from './core/folio-view.service';
import {FolioReaderComponent} from './folio-reader.component';
import {DEFAULT_FOLIO_SETTINGS, FolioSettings} from './state/folio-settings';

interface FolioReaderTestAccess {
  selection: WritableSignal<FolioSelectionDetail | null>;
  selectionMenuVisible: WritableSignal<boolean>;
  noteEditorVisible: WritableSignal<boolean>;
  settings: WritableSignal<FolioSettings>;
  folioView: {
    clearSelection(): void;
    next(): void;
    previous(): void;
  };
  turnFromSide(side: 'left' | 'right'): void;
}

describe('FolioReaderComponent navigation', () => {
  it('clears an active text selection when turning the page', () => {
    const component = Object.create(FolioReaderComponent.prototype) as FolioReaderTestAccess;
    component.selection = signal({
      text: 'Selected passage',
      cfi: 'epubcfi(/6/4,/2:0,/2:8)',
      position: {x: 120, y: 88, vertical: false},
    });
    component.selectionMenuVisible = signal(true);
    component.noteEditorVisible = signal(true);
    component.settings = signal(DEFAULT_FOLIO_SETTINGS);
    component.folioView = {
      clearSelection: vi.fn(),
      next: vi.fn(),
      previous: vi.fn(),
    };

    component.turnFromSide('right');

    expect(component.selection()).toBeNull();
    expect(component.selectionMenuVisible()).toBe(false);
    expect(component.noteEditorVisible()).toBe(false);
    expect(component.folioView.clearSelection).toHaveBeenCalledOnce();
    expect(component.folioView.next).toHaveBeenCalledOnce();
  });
});
