import {signal, WritableSignal} from '@angular/core';
import {describe, expect, it, vi} from 'vitest';
import {FolioSelectionDetail} from './core/folio-view.service';
import {FolioReaderComponent} from './folio-reader.component';
import {FolioLibraryTab} from './state/folio-library.service';

interface FolioReaderTestAccess {
  selection: WritableSignal<FolioSelectionDetail | null>;
  selectionMenuVisible: WritableSignal<boolean>;
  noteEditorVisible: WritableSignal<boolean>;
  libraryVisible: WritableSignal<boolean>;
  libraryTab: WritableSignal<FolioLibraryTab>;
  bookDetailsVisible: WritableSignal<boolean>;
  settingsVisible: WritableSignal<boolean>;
  chromeVisible: WritableSignal<boolean>;
  folioView: {clearSelection(): void};
  toggleSettings(): void;
  toggleLibrary(): void;
}

function selectedReader(): FolioReaderTestAccess {
  const component = Object.create(FolioReaderComponent.prototype) as FolioReaderTestAccess;
  component.selection = signal({
    text: 'Selected passage',
    cfi: 'epubcfi(/6/4,/2:0,/2:8)',
    position: {x: 120, y: 88},
  });
  component.selectionMenuVisible = signal(true);
  component.noteEditorVisible = signal(false);
  component.libraryVisible = signal(false);
  component.libraryTab = signal('contents');
  component.bookDetailsVisible = signal(false);
  component.settingsVisible = signal(false);
  component.chromeVisible = signal(false);
  component.folioView = {clearSelection: vi.fn()};
  return component;
}

describe('FolioReaderComponent panels', () => {
  it('dismisses the selection before opening settings', () => {
    const component = selectedReader();

    component.toggleSettings();

    expect(component.selection()).toBeNull();
    expect(component.selectionMenuVisible()).toBe(false);
    expect(component.settingsVisible()).toBe(true);
    expect(component.folioView.clearSelection).toHaveBeenCalledOnce();
  });

  it('dismisses the selection before opening the library', () => {
    const component = selectedReader();

    component.toggleLibrary();

    expect(component.selection()).toBeNull();
    expect(component.selectionMenuVisible()).toBe(false);
    expect(component.libraryVisible()).toBe(true);
    expect(component.folioView.clearSelection).toHaveBeenCalledOnce();
  });
});
