import type { Metadata } from "next";
import { Suspense } from "react";
import FarmCustomers from "@/components/FarmCustomers";
export const metadata: Metadata = { title: "Khata" };
export default function KhataPage() { return <Suspense><FarmCustomers /></Suspense>; }
