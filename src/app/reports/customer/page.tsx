import { Suspense } from "react";
import CustomerReportEntry from "@/components/CustomerReportEntry";
import { Body, PageHeader } from "@/components/ui";

function CustomerReportLoading() {
  return <><PageHeader title="Customer Report" sub="Sab customers ka baqaya aur wusooli ek jagah" back="/reports/" /><Body><p role="status">Customer Report load ho rahi hai…</p></Body></>;
}

export default function CustomerReportPage() {
  return <Suspense fallback={<CustomerReportLoading />}><CustomerReportEntry /></Suspense>;
}
