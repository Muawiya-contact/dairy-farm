"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { getSupabase } from "@/lib/supabase";

type Access = "checking" | "allowed" | "signed-out" | "denied" | "error";

export default function AuthGate({ children }: { children: ReactNode }) {
  const path = usePathname() || "/";
  const router = useRouter();
  const configError = !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const [access, setAccess] = useState<Access>("checking");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (configError) return;
    let mounted = true;
    let revision = 0;
    const supabase = getSupabase();

    const check = async () => {
      const current = ++revision;
      if (mounted) setAccess("checking");
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (!mounted || current !== revision) return;
      if (userError || !userData.user) {
        setAccess("signed-out");
        return;
      }
      const { data, error } = await supabase.from("settings").select("id").eq("id", 1).maybeSingle();
      if (!mounted || current !== revision) return;
      if (error) {
        setMessage(error.message);
        setAccess("error");
      } else {
        setAccess(data ? "allowed" : "denied");
      }
    };

    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "TOKEN_REFRESHED") {
        window.setTimeout(() => void check(), 0);
      }
    });
    void check();
    return () => {
      mounted = false;
      revision++;
      listener.subscription.unsubscribe();
    };
  }, [configError]);

  useEffect(() => {
    if (access === "signed-out" && path !== "/login") router.replace("/login/");
    if (access === "allowed" && path === "/login") router.replace("/");
  }, [access, path, router]);

  if (configError) {
    return <main className="grid min-h-dvh place-items-center px-4 text-center text-udhaar" role="alert">Supabase URL aur publishable key set nahi hain.</main>;
  }
  if (path === "/login") return <>{children}</>;
  if (access === "allowed") return <>{children}</>;
  if (access === "error" || access === "denied") {
    return (
      <main className="mx-auto mt-20 max-w-md rounded-2xl bg-paper p-6 text-center">
        <h1 className="font-display text-xl font-bold">Access nahi mila</h1>
        <p className="mt-2 text-muted">{access === "denied" ? "Is account ko farm ka access nahi diya gaya." : message}</p>
        <button className="mt-4 rounded-xl bg-berseem px-4 py-2 font-semibold text-white" onClick={() => window.location.reload()}>Dobara koshish karein</button>
      </main>
    );
  }
  return <main className="grid min-h-dvh place-items-center text-muted" role="status">Farm ka data check ho raha hai…</main>;
}
