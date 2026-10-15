import { useState } from "react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { ConfirmActionDialog } from "@/components/ConfirmActionDialog";
import { renderWithQuery } from "./utils";

it("keeps keyboard focus in the dialog and restores it after cancellation", async () => {
  const user = userEvent.setup();
  const confirm = vi.fn();
  function Example() {
    const [open, setOpen] = useState(false);
    return <>
      <button onClick={() => setOpen(true)}>Open action</button>
      {open && <ConfirmActionDialog title="Tasdeeq" message="Record band karein?"
        confirmLabel="Band karein" onConfirm={confirm} onCancel={() => setOpen(false)} />}
    </>;
  }
  renderWithQuery(<Example />);
  const opener = screen.getByRole("button", { name: "Open action" });
  await user.click(opener);
  const cancel = screen.getByRole("button", { name: "Wapas" });
  const accept = screen.getByRole("button", { name: "Band karein" });
  expect(cancel).toHaveFocus();
  await user.tab({ shift: true });
  expect(accept).toHaveFocus();
  await user.tab();
  expect(cancel).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(opener).toHaveFocus();
  expect(confirm).not.toHaveBeenCalled();
});

it("holds focus in the dialog while a confirmed action is saving", async () => {
  const user = userEvent.setup();
  function Example() {
    const [busy, setBusy] = useState(false);
    return <><button>Behind dialog</button><ConfirmActionDialog title="Tasdeeq"
      message="Record band karein?" confirmLabel="Band karein" busy={busy}
      onConfirm={() => setBusy(true)} onCancel={() => {}} /></>;
  }
  renderWithQuery(<Example />);
  await user.click(screen.getByRole("button", { name: "Band karein" }));
  const dialog = screen.getByRole("dialog");
  expect(dialog).toHaveFocus();
  await user.tab();
  expect(dialog).toHaveFocus();
  expect(screen.getByRole("button", { name: "Behind dialog" })).not.toHaveFocus();
});
