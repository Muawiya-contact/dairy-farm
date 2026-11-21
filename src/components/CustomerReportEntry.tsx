"use client";

import { Suspense, useEffect, useState } from "react";
import FarmCustomers from "@/components/FarmCustomers";
import KhataSummaryReport from "@/components/KhataSummaryReport";
import { Body, PageHeader } from "@/components/ui";

function CustomerStatementLoading() {
  return <><PageHeader title="Customer Report" sub="Sab customers ka baqaya aur wusooli ek jagah" back="/reports/" /><Body><p role="status">Customer statement load ho rahi hai…</p></Body></>;
}

/** Keep customer statements deep-linkable and use the saved Khata summary as the customer report index. */
export default function CustomerReportEntry() {
  const [customerId, setCustomerId] = useState<string | null>(null);

  useEffect(() => {
    const readCustomerId = () => setCustomerId(new URLSearchParams(window.location.search).get("id")?.trim() || "");
    readCustomerId();
    window.addEventListener("popstate", readCustomerId);
    return () => window.removeEventListener("popstate", readCustomerId);
  }, []);

  if (customerId === null) return <><PageHeader title="Customer Report" sub="Sab customers ka baqaya aur wusooli ek jagah" back="/reports/" /><Body><p role="status">Customer Report load ho rahi hai…</p></Body></>;
  return customerId ? <Suspense fallback={<CustomerStatementLoading />}><FarmCustomers /></Suspense> : <KhataSummaryReport title="Customer Report" />;
}
