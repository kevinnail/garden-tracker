import { ROW_HEIGHT } from '@/src/constants/layout';
import { GridRowItem } from '@/src/types';

export const SECTION_FOOTER_HEIGHT  = 8;
export const SECTION_SPACER_HEIGHT  = 6;
export const GARDEN_FOOTER_HEIGHT   = 10;
export const GARDEN_SPACER_HEIGHT   = 8;
export const LOCATION_FOOTER_HEIGHT = 12;
export const LOCATION_SPACER_HEIGHT = 10;

export function getRowHeight(row: GridRowItem | undefined): number {
  if (row?.type === 'section_footer')  return SECTION_FOOTER_HEIGHT;
  if (row?.type === 'section_spacer')  return SECTION_SPACER_HEIGHT;
  if (row?.type === 'garden_footer')   return GARDEN_FOOTER_HEIGHT;
  if (row?.type === 'garden_spacer')   return GARDEN_SPACER_HEIGHT;
  if (row?.type === 'location_footer') return LOCATION_FOOTER_HEIGHT;
  if (row?.type === 'location_spacer') return LOCATION_SPACER_HEIGHT;
  return ROW_HEIGHT;
}

export function getRowOffsets(rows: GridRowItem[]): number[] {
  const offsets = new Array(rows.length + 1);
  let top = 0;

  offsets[0] = top;

  for (let index = 0; index < rows.length; index++) {
    top += getRowHeight(rows[index]);
    offsets[index + 1] = top;
  }

  return offsets;
}

export function getTotalRowsHeight(rows: GridRowItem[]): number {
  const offsets = getRowOffsets(rows);
  return offsets[offsets.length - 1] ?? 0;
}

export function getVisibleRowRange(
  rowOffsets: number[],
  scrollY: number,
  viewHeight: number,
): { rowStart: number; rowEnd: number } {
  const rowCount = Math.max(0, rowOffsets.length - 1);

  if (rowCount === 0) {
    return { rowStart: 0, rowEnd: -1 };
  }

  let rowStart = 0;
  while (rowStart < rowCount && rowOffsets[rowStart + 1] <= scrollY) {
    rowStart += 1;
  }
  rowStart = Math.max(0, rowStart - 1);

  const viewBottom = scrollY + viewHeight;
  let rowEnd = rowStart;
  while (rowEnd < rowCount && rowOffsets[rowEnd] < viewBottom) {
    rowEnd += 1;
  }
  rowEnd = Math.min(rowCount - 1, rowEnd + 1);

  return { rowStart, rowEnd };
}