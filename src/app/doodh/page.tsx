import type { Metadata } from "next";
import MilkEntry from "@/components/MilkEntry";
import { Body, Demo, PageHeader } from "@/components/ui";
import { TODAY } from "@/lib/mock-data";
import { dayName, longDate } from "@/lib/calc";

export const metadata: Metadata = { title: "Doodh entry" };

export default function DoodhPage() {
  return (
    <>
      <PageHeader title="Doodh entry" sub={`${dayName(TODAY)}, ${longDate(TODAY)}`} />
      <Body><MilkEntry /></Body>
      <Demo />
    </>
  );
}
