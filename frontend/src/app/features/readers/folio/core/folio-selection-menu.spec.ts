import {describe, expect, it} from 'vitest';
import {placeMobileSelectionMenu} from './folio-selection-menu';

describe('Folio mobile selection menu placement', () => {
  const readingArea = {left: 0, right: 390, top: 44, bottom: 772};

  it('stays beside the selection and flips below text near the top', () => {
    const nearTop = placeMobileSelectionMenu({
      first: {left: 24, right: 96, top: 66, bottom: 88},
      last: {left: 24, right: 96, top: 66, bottom: 88},
    }, readingArea);
    expect(nearTop).toEqual({x: 12, y: 96});

    const nearBottom = placeMobileSelectionMenu({
      first: {left: 334, right: 382, top: 728, bottom: 751},
      last: {left: 334, right: 382, top: 728, bottom: 751},
    }, readingArea);
    expect(nearBottom).toEqual({x: 218, y: 664});
  });

  it('uses the same horizontal menu placement for vertical text', () => {
    const onRight = placeMobileSelectionMenu({
      first: {left: 330, right: 352, top: 350, bottom: 405},
      last: {left: 330, right: 352, top: 350, bottom: 405},
    }, readingArea);
    expect(onRight).toEqual({x: 218, y: 286});

    const onLeft = placeMobileSelectionMenu({
      first: {left: 30, right: 52, top: 350, bottom: 405},
      last: {left: 30, right: 52, top: 350, bottom: 405},
    }, readingArea);
    expect(onLeft).toEqual({x: 12, y: 286});
  });

  it('keeps the entire menu inside a narrow phone reading area', () => {
    const narrowReadingArea = {left: 0, right: 320, top: 44, bottom: 496};
    const selection = {
      first: {left: 280, right: 312, top: 460, bottom: 485},
      last: {left: 280, right: 312, top: 460, bottom: 485},
    };
    const position = placeMobileSelectionMenu(selection, narrowReadingArea);
    expect(position.x).toBeGreaterThanOrEqual(12);
    expect(position.x + 160).toBeLessThanOrEqual(308);
    expect(position.y).toBeGreaterThanOrEqual(52);
    expect(position.y + 56).toBeLessThanOrEqual(488);
  });
});
