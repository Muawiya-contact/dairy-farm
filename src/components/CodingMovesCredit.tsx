import {
  CODING_MOVES_CONTACT_EMAIL,
  CODING_MOVES_CONTACT_URL,
  CODING_MOVES_DISPLAY_URL,
  CODING_MOVES_URL,
} from "@/lib/coding-moves";

/** A single, reusable developer credit for the one place it appears in the app. */
export function CodingMovesCredit() {
  return <div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1">
    <span aria-hidden="true" className="inline-flex size-6 items-center justify-center rounded-md bg-[#3b82f6] text-[10px] font-bold text-white">CM</span>
    <span>Developed by <a href={CODING_MOVES_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-berseem underline underline-offset-2">Coding Moves</a></span>
    <span aria-hidden="true">·</span>
    <a href={CODING_MOVES_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-berseem underline underline-offset-2">{CODING_MOVES_DISPLAY_URL}</a>
    <span aria-hidden="true">·</span>
    <a href={CODING_MOVES_CONTACT_URL} className="font-semibold text-berseem underline underline-offset-2">{CODING_MOVES_CONTACT_EMAIL}</a>
  </div>;
}
