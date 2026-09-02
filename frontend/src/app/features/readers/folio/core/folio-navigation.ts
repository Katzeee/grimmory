import {FolioPageTurnDirection} from '../state/folio-settings';

export type FolioTurn = 'previous' | 'next';
export type FolioSide = 'left' | 'right';
export type FolioSwipe = 'swipe-left' | 'swipe-right';

export interface FolioRenderedPage {
  current: number;
  total: number;
}

export function getTurnForSide(side: FolioSide, direction: FolioPageTurnDirection): FolioTurn {
  const advancesOnRight = direction === 'left-to-right';
  return (side === 'right') === advancesOnRight ? 'next' : 'previous';
}

export function getTurnForSwipe(swipe: FolioSwipe, direction: FolioPageTurnDirection): FolioTurn {
  const advancesOnSwipeLeft = direction === 'left-to-right';
  return (swipe === 'swipe-left') === advancesOnSwipeLeft ? 'next' : 'previous';
}

export function getProgressDirection(direction: FolioPageTurnDirection): 'ltr' | 'rtl' {
  return direction === 'right-to-left' ? 'rtl' : 'ltr';
}

export function getRenderedPage(fraction?: number, pageFraction?: number): FolioRenderedPage | null {
  if (typeof fraction !== 'number' || typeof pageFraction !== 'number' || !Number.isFinite(fraction) || !Number.isFinite(pageFraction) || pageFraction <= 0) return null;
  const total = Math.max(1, Math.ceil(1 / pageFraction - 1e-6));
  const current = Math.min(total, Math.max(1, Math.floor(fraction / pageFraction + 1e-6) + 1));
  return {current, total};
}
