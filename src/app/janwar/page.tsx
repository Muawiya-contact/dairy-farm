import type { Metadata } from "next";
import AnimalList from "@/components/AnimalList";
import { Body, Demo, PageHeader } from "@/components/ui";
import { PlusIcon } from "@/components/icons";
import { herdCounts } from "@/lib/calc";

export const metadata: Metadata = { title: "Janwar" };

export default function JanwarPage() {
  const h = herdCounts();
  return (
    <>
      <PageHeader
        title="Janwar"
        sub={`${h.total} janwar, jin mein ${h.milking} doodh de rahe hain`}
        action={
          <button className="flex min-h-[44px] items-center gap-1.5 rounded-xl bg-berseem px-4 font-semibold text-white hover:bg-berseem-deep">
            <PlusIcon width={18} height={18} /><span className="hidden sm:inline">Naya janwar</span><span className="sm:hidden">Naya</span>
          </button>
        }
      />
      <Body><AnimalList /></Body>
      <Demo />
    </>
  );
}
