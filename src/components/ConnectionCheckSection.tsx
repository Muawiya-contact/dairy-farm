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
  const project = process.env.NEXT_PUBLIC_SUPABASE_URL?.includes("dlirssfoazlxzyamsltv") ? "aazmaishi"
    : process.env.NEXT_PUBLIC_SUPABASE_URL?.includes("ylipnghdygpyqlptqazx") ? "asli"
      : "maujooda";
  return <section className="max-w-2xl rounded-2xl border border-line bg-paper p-5">
    <h2 className="font-display text-xl font-bold">Data rabtay ki jaanch</h2>
    <p className="mt-1 text-sm text-muted">Yeh site {project} farm ke data se jurti hai. Jaanch sirf record parhti hai; kuch nahi badalti.</p>
    <button type="button" disabled={query.isFetching} onClick={() => void query.refetch()} className="mt-3 min-h-11 rounded-xl border border-berseem px-4 font-semibold text-berseem disabled:opacity-50">{query.isFetching ? "Jaanch ho rahi hai…" : "Data rabta jaanchein"}</button>
    {query.isSuccess && <p role="status" className="mt-2 text-sm text-berseem-deep">Data mil gaya. {query.data.animals} janwar, {query.data.customers} gahak.</p>}
    {query.isError && <p role="alert" className="mt-2 text-sm text-udhaar">Data kholne mein masla: {friendlyError(query.error)}</p>}
    <p className="mt-2 text-xs text-muted">Yeh jaanch sirf data parhti hai; nayi entry ki tasdeeq alag se karein.</p>
  </section>;
}
