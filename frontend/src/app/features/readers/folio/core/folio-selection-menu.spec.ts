import {describe, expect, it} from 'vitest';
import {placeMobileSelectionMenu} from './folio-selection-menu';

describe('Folio mobile selection menu placement', () => {
  const readingArea = {left: 0, right: 390, top: 44, bottom: 772};

  it('stays beside the selection and flips below text near the top', () => {
    const nearTop = placeMobileSelectionMenu({
      first: {left: 24, right: 96, top: 66, bottom: 88},
      last: {left: 24, right: 96, top: 66, bottom: 88},
    }, readingArea, false);
    expect(nearTop).toEqual({x: 12, y: 96, vertical: false});

    const nearBottom = placeMobileSelectionMenu({
      first: {left: 334, right: 382, top: 728, bottom: 751},
      last: {left: 334, right: 382, top: 728, bottom: 751},
    }, readingArea, false);
    expect(nearBottom).toEqual({x: 170, y: 664, vertical: false});
  });

  it('places a compact vertical menu on the side with room', () => {
    const onRight = placeMobileSelectionMenu({
      first: {left: 330, right: 352, top: 350, bottom: 405},
      last: {left: 330, right: 352, top: 350, bottom: 405},
    }, readingArea, true);
    expect(onRight).toEqual({x: 266, y: 281.5, vertical: true});

    const onLeft = placeMobileSelectionMenu({
      first: {left: 30, right: 52, top: 350, bottom: 405},
      last: {left: 30, right: 52, top: 350, bottom: 405},
    }, readingArea, true);
    expect(onLeft).toEqual({x: 60, y: 281.5, vertical: true});
  });

  it('keeps the entire menu inside a narrow phone reading area', () => {
    const narrowReadingArea = {left: 0, right: 320, top: 44, bottom: 496};
    const selection = {
      first: {left: 280, right: 312, top: 460, bottom: 485},
      last: {left: 280, right: 312, top: 460, bottom: 485},
    };
    const horizontal = placeMobileSelectionMenu(selection, narrowReadingArea, false);
    expect(horizontal.x).toBeGreaterThanOrEqual(12);
    expect(horizontal.x + 208).toBeLessThanOrEqual(308);
    expect(horizontal.y).toBeGreaterThanOrEqual(52);
    expect(horizontal.y + 56).toBeLessThanOrEqual(488);

    const vertical = placeMobileSelectionMenu(selection, narrowReadingArea, true);
    expect(vertical.x).toBeGreaterThanOrEqual(12);
    expect(vertical.x + 56).toBeLessThanOrEqual(308);
    expect(vertical.y).toBeGreaterThanOrEqual(52);
    expect(vertical.y + 192).toBeLessThanOrEqual(488);
  });
});
