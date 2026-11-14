type DateFormatHintProps = {
  kind: "date" | "month";
  optional?: boolean;
};

/** Native date controls ignore placeholder text in several browsers. */
export function DateFormatHint({ kind, optional = false }: DateFormatHintProps) {
  const example = kind === "month" ? "2026-11" : "2026-11-14";
  const label = kind === "month" ? "Maheena" : "Tareekh";
  return <span className="mt-1 block text-xs font-normal text-muted">{label} calendar se chunein — misal: {example}{optional ? " (optional)" : ""}.</span>;
}
