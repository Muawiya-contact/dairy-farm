import Image from "next/image";
import { CODING_MOVES_URL } from "@/lib/coding-moves";

/** A single, reusable developer credit for the one place it appears in the app. */
export function CodingMovesCredit() {
  return <a href={CODING_MOVES_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-berseem underline underline-offset-2">
    <Image src="/brand/coding-moves-services.svg" width={24} height={24} alt="" aria-hidden="true" className="size-6" />
    <span>Developed by Coding Moves</span>
  </a>;
}
