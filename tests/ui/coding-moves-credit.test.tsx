import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { CodingMovesCredit } from "@/components/CodingMovesCredit";

it("keeps the Settings credit to one official Coding Moves link", () => {
  render(<CodingMovesCredit />);

  expect(screen.getByRole("link", { name: "Developed by Coding Moves" })).toHaveAttribute("href", "https://codingmoves.com/");
  expect(screen.queryByText("contact@codingmoves.com")).not.toBeInTheDocument();
});
