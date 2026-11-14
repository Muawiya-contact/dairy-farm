import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { CodingMovesCredit } from "@/components/CodingMovesCredit";

it("uses the official Coding Moves site and public contact address", () => {
  render(<CodingMovesCredit />);

  expect(screen.getAllByRole("link", { name: /Coding Moves|CodingMoves\.com/i })[0]).toHaveAttribute("href", "https://codingmoves.com/");
  expect(screen.getByRole("link", { name: "contact@codingmoves.com" })).toHaveAttribute("href", "mailto:contact@codingmoves.com");
});
