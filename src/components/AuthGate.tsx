"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { isPasswordSetupLink, passwordRecoveryRedirect, passwordSetupError } from "@/lib/auth-password";
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
  const [forgotPassword, setForgotPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [needsPassword, setNeedsPassword] = useState(
    () => typeof window !== "undefined" && isPasswordSetupLink(window.location.href),
  );
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
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
    const { data: listener } = client.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") setNeedsPassword(true);
      applySession(session);
    });
    return () => listener.subscription.unsubscribe();
  }, [queryClient]);

  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    setNeedsPassword(false);
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

  const sendPasswordReset = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setResetSent(false);
    try {
      const { error: resetError } = await getSupabase().auth.resetPasswordForEmail(email.trim(), {
        redirectTo: passwordRecoveryRedirect(window.location.href),
      });
      if (resetError) throw resetError;
      setResetSent(true);
    } catch (resetError) {
      setError(friendlyError(resetError));
    } finally {
      setBusy(false);
    }
  };

  const setAccountPassword = async (event: FormEvent) => {
    event.preventDefault();
    const validationError = passwordSetupError(newPassword, confirmation);
    if (validationError) { setError(validationError); return; }
    setBusy(true);
    setError("");
    try {
      const { error: updateError } = await getSupabase().auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;
      setNewPassword("");
      setConfirmation("");
      setNeedsPassword(false);
    } catch (updateError) {
      setError(friendlyError(updateError));
    } finally {
      setBusy(false);
    }
  };

  if (!ready) return <main className="mx-auto max-w-sm p-8 text-muted">Account check ho raha hai…</main>;
  if (!signedIn) return (
    <main className="mx-auto max-w-sm px-5 py-16">
      <h1 className="flex items-center gap-3 font-display text-3xl font-bold"><LogoMark size={48} />Dairy Farm</h1>
      <p className="mt-2 text-muted">{forgotPassword ? "Apna email likhein; password badalne ka link bheja jayega." : "Production data ke liye apne farm account se sign in karein."}</p>
      {forgotPassword ? (
        <form onSubmit={sendPasswordReset} className="mt-6 grid gap-3 rounded-2xl border border-line bg-paper p-5">
          <label className="grid gap-1 font-semibold">Email<input type="email" autoComplete="email" required placeholder="name@example.com" value={email} onChange={(event) => { setEmail(event.target.value); setResetSent(false); }} className="min-h-12 rounded-xl border border-line px-3" /></label>
          <button disabled={busy || resetSent} className="min-h-12 rounded-xl bg-berseem font-bold text-white disabled:opacity-50">{busy ? "Bheja ja raha hai…" : "Reset link bhejein"}</button>
          {resetSent && <p role="status" className="text-muted">Agar is email ka farm account hai to reset link bhej diya gaya hai. Inbox aur Spam check karein.</p>}
          {error && <p role="alert" className="text-udhaar">{error}</p>}
          <button type="button" disabled={busy} onClick={() => { setForgotPassword(false); setError(""); setResetSent(false); }} className="min-h-12 rounded-xl border border-line font-semibold disabled:opacity-50">Wapas sign in</button>
        </form>
      ) : (
        <form onSubmit={signIn} className="mt-6 grid gap-3 rounded-2xl border border-line bg-paper p-5">
          <label className="grid gap-1 font-semibold">Email<input type="email" autoComplete="email" required placeholder="name@example.com" value={email} onChange={(event) => setEmail(event.target.value)} className="min-h-12 rounded-xl border border-line px-3" /></label>
          <label className="grid gap-1 font-semibold">Password<input type="password" autoComplete="current-password" required placeholder="Password" value={password} onChange={(event) => setPassword(event.target.value)} className="min-h-12 rounded-xl border border-line px-3" /></label>
          <button disabled={busy} className="min-h-12 rounded-xl bg-berseem font-bold text-white disabled:opacity-50">{busy ? "Sign in ho raha hai…" : "Sign in"}</button>
          <button type="button" disabled={busy} onClick={() => { setForgotPassword(true); setError(""); }} className="min-h-12 font-semibold text-berseem disabled:opacity-50">Password bhool gaye?</button>
          {error && <p role="alert" className="text-udhaar">{error}</p>}
        </form>
      )}
    </main>
  );
  if (needsPassword) return (
    <main className="mx-auto max-w-sm px-5 py-16">
      <h1 className="flex items-center gap-3 font-display text-3xl font-bold"><LogoMark size={48} />Dairy Farm</h1>
      <p className="mt-2 text-muted">Apne farm account ka naya password banayein.</p>
      <form onSubmit={setAccountPassword} className="mt-6 grid gap-3 rounded-2xl border border-line bg-paper p-5">
        <label className="grid gap-1 font-semibold">Naya password<input type="password" autoComplete="new-password" required minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="min-h-12 rounded-xl border border-line px-3" /></label>
        <label className="grid gap-1 font-semibold">Password dobara<input type="password" autoComplete="new-password" required minLength={8} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="min-h-12 rounded-xl border border-line px-3" /></label>
        <button disabled={busy} className="min-h-12 rounded-xl bg-berseem font-bold text-white disabled:opacity-50">{busy ? "Save ho raha hai…" : "Password save karein"}</button>
        {error && <p role="alert" className="text-udhaar">{error}</p>}
      </form>
    </main>
  );
  return <>{children}</>;
}
