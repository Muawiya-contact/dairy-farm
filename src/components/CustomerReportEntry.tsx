"use client";

import { useSearchParams } from "next/navigation";
import FarmCustomers from "@/components/FarmCustomers";
import KhataSummaryReport from "@/components/KhataSummaryReport";

/** Keep customer statements deep-linkable and use the saved Khata summary as the customer report index. */
export default function CustomerReportEntry() {
  const searchParams = useSearchParams();
  return searchParams.get("id")?.trim()
    ? <FarmCustomers />
    : <KhataSummaryReport title="Customer Report" />;
}
