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
  vertical: boolean;
}

const HORIZONTAL_WIDTH = 208;
const HORIZONTAL_HEIGHT = 56;
const VERTICAL_WIDTH = 56;
const VERTICAL_HEIGHT = 192;
const EDGE_GAP = 12;
const SELECTION_GAP = 8;
const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), Math.max(min, max));

export function placeMobileSelectionMenu(
  anchor: FolioSelectionAnchor,
  readingArea: {left: number; right: number; top: number; bottom: number},
  vertical: boolean,
): FolioSelectionMenuPosition {
  const leftEdge = readingArea.left + EDGE_GAP;
  const rightEdge = readingArea.right - EDGE_GAP;
  const topEdge = readingArea.top + SELECTION_GAP;
  const bottomEdge = readingArea.bottom - SELECTION_GAP;

  if (vertical) {
    const menuHeight = Math.min(VERTICAL_HEIGHT, Math.max(0, bottomEdge - topEdge));
    const leftSpace = anchor.first.left - leftEdge;
    const rightSpace = rightEdge - anchor.first.right;
    const side = leftSpace >= rightSpace ? 'left' : 'right';
    const requestedX = side === 'left'
      ? anchor.first.left - SELECTION_GAP - VERTICAL_WIDTH
      : anchor.first.right + SELECTION_GAP;

    return {
      x: clamp(requestedX, leftEdge, rightEdge - VERTICAL_WIDTH),
      y: clamp(
        (anchor.first.top + anchor.first.bottom - menuHeight) / 2,
        topEdge,
        bottomEdge - menuHeight,
      ),
      vertical: true,
    };
  }

  const menuWidth = Math.min(HORIZONTAL_WIDTH, Math.max(0, rightEdge - leftEdge));
  const aboveY = anchor.first.top - SELECTION_GAP - HORIZONTAL_HEIGHT;
  const belowY = anchor.last.bottom + SELECTION_GAP;
  const aboveSpace = anchor.first.top - SELECTION_GAP - topEdge;
  const belowSpace = bottomEdge - anchor.last.bottom - SELECTION_GAP;
  const side = aboveSpace >= HORIZONTAL_HEIGHT || aboveSpace >= belowSpace ? 'above' : 'below';

  return {
    x: clamp(
      (anchor.first.left + anchor.first.right - menuWidth) / 2,
      leftEdge,
      rightEdge - menuWidth,
    ),
    y: clamp(side === 'above' ? aboveY : belowY, topEdge, bottomEdge - HORIZONTAL_HEIGHT),
    vertical: false,
  };
}
