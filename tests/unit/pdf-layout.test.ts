import { describe, expect, it } from "vitest";
import { needsPdfSectionPageBreak, nextPdfSectionYAfterEmptyState } from "@/lib/pdf/layout";

describe("PDF section layout", () => {
  it("starts a section on a new page when its heading and first rows would meet the footer", () => {
    expect(needsPdfSectionPageBreak(159, 210, 24)).toBe(true);
    expect(needsPdfSectionPageBreak(158, 210, 24)).toBe(false);
  });

  it("leaves a visible gap after an empty-section message box", () => {
    const sectionY = 36;
    const boxBottom = sectionY + 3 + 12;
    expect(nextPdfSectionYAfterEmptyState(sectionY) - boxBottom).toBe(6);
  });
});
