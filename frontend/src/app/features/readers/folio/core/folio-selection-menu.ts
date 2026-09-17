export interface FolioSelectionLine {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface FolioSelectionAnchor {
  first: FolioSelectionLine;
  last: FolioSelectionLine;
}

export interface FolioSelectionMenuPosition {
  x: number;
  y: number;
}

const MENU_WIDTH = 160;
const MENU_HEIGHT = 56;
const EDGE_GAP = 12;
const SELECTION_GAP = 8;
const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), Math.max(min, max));

export function placeMobileSelectionMenu(
  anchor: FolioSelectionAnchor,
  readingArea: {left: number; right: number; top: number; bottom: number},
): FolioSelectionMenuPosition {
  const leftEdge = readingArea.left + EDGE_GAP;
  const rightEdge = readingArea.right - EDGE_GAP;
  const topEdge = readingArea.top + SELECTION_GAP;
  const bottomEdge = readingArea.bottom - SELECTION_GAP;
  const menuWidth = Math.min(MENU_WIDTH, Math.max(0, rightEdge - leftEdge));

  const aboveY = anchor.first.top - SELECTION_GAP - MENU_HEIGHT;
  const belowY = anchor.last.bottom + SELECTION_GAP;
  const aboveSpace = anchor.first.top - SELECTION_GAP - topEdge;
  const belowSpace = bottomEdge - anchor.last.bottom - SELECTION_GAP;
  const side = aboveSpace >= MENU_HEIGHT || aboveSpace >= belowSpace ? 'above' : 'below';

  return {
    x: clamp(
      (anchor.first.left + anchor.first.right - menuWidth) / 2,
      leftEdge,
      rightEdge - menuWidth,
    ),
    y: clamp(side === 'above' ? aboveY : belowY, topEdge, bottomEdge - MENU_HEIGHT),
  };
}
