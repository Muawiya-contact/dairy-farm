import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { DateFormatHint } from "@/components/DateFormatHint";

it("explains native date and month formats with a visible example", () => {
  render(<><DateFormatHint kind="month" /><DateFormatHint kind="date" optional /></>);

  expect(screen.getByText("Maheena calendar se chunein — misal: 2026-11.")).toBeVisible();
  expect(screen.getByText("Tareekh calendar se chunein — misal: 2026-11-14 (optional).")).toBeVisible();
});
