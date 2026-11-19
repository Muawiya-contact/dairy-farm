import { Suspense } from "react";
import CustomerReportEntry from "@/components/CustomerReportEntry";
import ReportCategoryPlaceholder from "@/components/ReportCategoryPlaceholder";
export default function CustomerReportPage() {
  return <Suspense fallback={<ReportCategoryPlaceholder title="Customer Report" />}><CustomerReportEntry /></Suspense>;
}
