import type { Metadata } from "next";
import { Suspense } from "react";
import FarmAnimals from "@/components/FarmAnimals";
export const metadata: Metadata = { title: "Janwar" };
export default function JanwarPage() { return <Suspense><FarmAnimals /></Suspense>; }
