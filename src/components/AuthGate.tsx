"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import LogoMark from "./LogoMark";

const requireAuth = process.env.NEXT_PUBLIC_REQUIRE_AUTH === "true";
const missingConfig = requireAuth && (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

export default function AuthGate({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const previousUser = useRef<string | null>(null);
  const [ready, setReady] = useState(!requireAuth || missingConfig);
  const [signedIn, setSignedIn] = useState(!requireAuth);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(missingConfig ? friendlyError(new Error("Supabase URL aur publishable key set nahi hain.")) : "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!requireAuth || missingConfig) return;
    const client = getSupabase();
    const applySession = (session: Session | null) => {
      const userId = session?.user.id ?? null;
      if (previousUser.current !== userId) queryClient.clear();
      previousUser.current = userId;
      setSignedIn(Boolean(session));
      setReady(true);
    };
    void client.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) throw sessionError;
      applySession(data.session);
    }).catch((sessionError: Error) => {
      setError(friendlyError(sessionError));
      applySession(null);
    });
    const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
      applySession(session);
    });
    return () => listener.subscription.unsubscribe();
  }, [queryClient]);

  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await getSupabase().auth.signInWithPassword({ email, password });
      if (result.error) setError(friendlyError(result.error));
    } catch (signInError) {
      setError(friendlyError(signInError));
    } finally {
      setPassword("");
      setBusy(false);
    }
  };

  if (!ready) return <main className="mx-auto max-w-sm p-8 text-muted">Account check ho raha hai…</main>;
  if (!signedIn) return (
    <main className="mx-auto max-w-sm px-5 py-16">
      <h1 className="flex items-center gap-3 font-display text-3xl font-bold"><LogoMark size={48} />Dairy Farm</h1>
      <p className="mt-2 text-muted">Production data ke liye owner account se sign in karein.</p>
      <form onSubmit={signIn} className="mt-6 grid gap-3 rounded-2xl border border-line bg-paper p-5">
        <label className="grid gap-1 font-semibold">Email<input type="email" autoComplete="email" required placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="min-h-12 rounded-xl border border-line px-3" /></label>
        <label className="grid gap-1 font-semibold">Password<input type="password" autoComplete="current-password" required placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="min-h-12 rounded-xl border border-line px-3" /></label>
        <button disabled={busy} className="min-h-12 rounded-xl bg-berseem font-bold text-white disabled:opacity-50">{busy ? "Sign in ho raha hai…" : "Sign in"}</button>
        {error && <p role="alert" className="text-udhaar">{error}</p>}
      </form>
    </main>
  );
  return <>{children}</>;
}
