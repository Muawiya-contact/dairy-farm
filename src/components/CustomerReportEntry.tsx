"use client";

import { useSearchParams } from "next/navigation";
import FarmCustomers from "@/components/FarmCustomers";
import ReportCategoryPlaceholder from "@/components/ReportCategoryPlaceholder";

/** Keep deep-linked customer statements available while the report index is planned. */
export default function CustomerReportEntry() {
  const searchParams = useSearchParams();
  return searchParams.get("id")?.trim()
    ? <FarmCustomers />
    : <ReportCategoryPlaceholder title="Customer Report" />;
}
