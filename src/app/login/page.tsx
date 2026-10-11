"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { getSupabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const supabase = getSupabase();
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) {
        setError("Email ya password ghalat hai. Dobara koshish karein.");
        return;
      }
      const { data, error: dataError } = await supabase.from("settings").select("id").eq("id", 1).maybeSingle();
      if (dataError) throw dataError;
      if (!data) {
        await supabase.auth.signOut();
        setError("Is account ko farm ka access nahi diya gaya.");
        return;
      }
      router.replace("/");
    } catch (cause) {
      setError(cause instanceof Error && cause.message.includes("Supabase URL")
        ? cause.message : `Database se rabta nahi hua: ${cause instanceof Error ? cause.message : "dobara koshish karein"}`);
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl border border-line bg-paper p-6 shadow-sm">
        <h1 className="font-display text-2xl font-bold">Dairy Farm</h1>
        <p className="mt-1 text-muted">Maalik ka login</p>
        <label className="mt-6 block font-semibold" htmlFor="email">Email</label>
        <input id="email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 min-h-12 w-full rounded-xl border border-line px-3 outline-none focus:border-berseem" />
        <label className="mt-4 block font-semibold" htmlFor="password">Password</label>
        <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 min-h-12 w-full rounded-xl border border-line px-3 outline-none focus:border-berseem" />
        {error && <p role="alert" className="mt-3 text-udhaar">{error}</p>}
        <button disabled={pending} className="mt-6 min-h-12 w-full rounded-xl bg-berseem font-bold text-white disabled:opacity-50">{pending ? "Login ho raha hai…" : "Login"}</button>
      </form>
    </main>
  );
}
