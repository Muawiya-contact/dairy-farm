export const PDF_PAGE_CONTENT_TOP_MM = 36;
export const PDF_FOOTER_RESERVE_MM = 28;
export const PDF_EMPTY_SECTION_MINIMUM_HEIGHT_MM = 20;
export const PDF_TABLE_SECTION_MINIMUM_HEIGHT_MM = 24;

const EMPTY_STATE_TOP_GAP_MM = 3;
const EMPTY_STATE_BOX_HEIGHT_MM = 12;
const EMPTY_STATE_BOTTOM_GAP_MM = 4;

export function needsPdfSectionPageBreak(cursorY: number, pageHeight: number, minimumHeight: number): boolean {
  return cursorY + minimumHeight > pageHeight - PDF_FOOTER_RESERVE_MM;
}

export function nextPdfSectionYAfterEmptyState(cursorY: number): number {
  return cursorY + EMPTY_STATE_TOP_GAP_MM + EMPTY_STATE_BOX_HEIGHT_MM + EMPTY_STATE_BOTTOM_GAP_MM;
}
