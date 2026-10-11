"use client";

import { useQuery } from "@tanstack/react-query";
import { getSettings } from "@/lib/settings";

export default function DashboardGreeting() {
  const { data } = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  return <>{data?.owner_name || "Maalik"}</>;
}
