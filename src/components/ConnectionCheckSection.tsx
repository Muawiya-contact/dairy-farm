"use client";

import { useQuery } from "@tanstack/react-query";
import { friendlyError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase";

async function checkConnection() {
  const supabase = getSupabase();
  const [settings, animals, customers] = await Promise.all([
    supabase.from("settings").select("id").eq("id", 1).single(),
    supabase.from("animals").select("id", { count: "exact", head: true }),
    supabase.from("customers").select("id", { count: "exact", head: true }),
  ]);
  if (settings.error) throw settings.error;
  if (animals.error) throw animals.error;
  if (customers.error) throw customers.error;
  return { animals: animals.count ?? 0, customers: customers.count ?? 0 };
}

export function ConnectionCheckSection() {
  const query = useQuery({ queryKey: ["connection-check"], queryFn: checkConnection, enabled: false });
  const project = process.env.NEXT_PUBLIC_SUPABASE_URL?.includes("dlirssfoazlxzyamsltv") ? "Staging demo"
    : process.env.NEXT_PUBLIC_SUPABASE_URL?.includes("ylipnghdygpyqlptqazx") ? "Production"
      : "Custom project";
  return <section className="max-w-2xl rounded-2xl border border-line bg-paper p-5">
    <h2 className="font-display text-xl font-bold">Connection check</h2>
    <p className="mt-1 text-sm text-muted">Yeh site {project} Supabase se jurti hai. Check sirf data parhta hai; koi record nahi badalta.</p>
    <button type="button" disabled={query.isFetching} onClick={() => void query.refetch()} className="mt-3 min-h-11 rounded-xl border border-berseem px-4 font-semibold text-berseem disabled:opacity-50">{query.isFetching ? "Check ho raha hai…" : "Connection check karein"}</button>
    {query.isSuccess && <p role="status" className="mt-2 text-sm text-berseem-deep">Supabase se data mila. {query.data.animals} janwar, {query.data.customers} customers.</p>}
    {query.isError && <p role="alert" className="mt-2 text-sm text-udhaar">Connection ya access mein masla: {friendlyError(query.error)}</p>}
    <p className="mt-2 text-xs text-muted">Yeh read check hai; writes, migration history, aur phone sharing ko release se pehle alag test karein.</p>
  </section>;
}
