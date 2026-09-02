import {describe, expect, it} from 'vitest';
import {getProgressDirection, getRenderedPage, getTurnForSide, getTurnForSwipe} from './folio-navigation';

describe('Folio navigation', () => {
  it('keeps physical page-turn direction independent from content layout', () => {
    expect(getTurnForSide('right', 'left-to-right')).toBe('next');
    expect(getTurnForSide('left', 'left-to-right')).toBe('previous');
    expect(getTurnForSide('left', 'right-to-left')).toBe('next');
    expect(getTurnForSide('right', 'right-to-left')).toBe('previous');
  });

  it('maps swipes to the configured physical page-turn direction', () => {
    expect(getTurnForSwipe('swipe-left', 'left-to-right')).toBe('next');
    expect(getTurnForSwipe('swipe-right', 'right-to-left')).toBe('next');
  });

  it('aligns progress controls with the configured page-turn direction', () => {
    expect(getProgressDirection('left-to-right')).toBe('ltr');
    expect(getProgressDirection('right-to-left')).toBe('rtl');
  });

  it('turns paginator fractions into chapter-relative rendered pages', () => {
    expect(getRenderedPage(0, 1 / 16)).toEqual({current: 1, total: 16});
    expect(getRenderedPage(13 / 16, 1 / 16)).toEqual({current: 14, total: 16});
    expect(getRenderedPage(14 / 16, 1 / 16)).toEqual({current: 15, total: 16});
    expect(getRenderedPage(0.5, undefined)).toBeNull();
  });
});
