import Image from "next/image";
import {
  CODING_MOVES_CONTACT_EMAIL,
  CODING_MOVES_CONTACT_URL,
  CODING_MOVES_DISPLAY_URL,
  CODING_MOVES_URL,
} from "@/lib/coding-moves";

/** A single, reusable developer credit for the one place it appears in the app. */
export function CodingMovesCredit() {
  return <div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1">
    <Image src="/brand/coding-moves-services.svg" width={24} height={24} alt="" aria-hidden="true" className="size-6" />
    <span>Developed by <a href={CODING_MOVES_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-berseem underline underline-offset-2">Coding Moves</a></span>
    <span aria-hidden="true">·</span>
    <a href={CODING_MOVES_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-berseem underline underline-offset-2">{CODING_MOVES_DISPLAY_URL}</a>
    <span aria-hidden="true">·</span>
    <a href={CODING_MOVES_CONTACT_URL} className="font-semibold text-berseem underline underline-offset-2">{CODING_MOVES_CONTACT_EMAIL}</a>
  </div>;
}
