"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BookIcon, CanIcon, CoinsIcon, CowIcon, HomeIcon, WalletIcon } from "./icons";
import { useQuery } from "@tanstack/react-query";
import { getSettings } from "@/lib/settings";
import { getSupabase } from "@/lib/supabase";

const NAV = [
  { href: "/", label: "Home", Icon: HomeIcon },
  { href: "/janwar/", label: "Janwar", Icon: CowIcon },
  { href: "/doodh/", label: "Doodh", Icon: CanIcon },
  { href: "/khata/", label: "Khata", Icon: BookIcon },
  { href: "/galla/", label: "Galla", Icon: CoinsIcon },
  { href: "/kharcha/", label: "Kharcha", Icon: WalletIcon },
];

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href.replace(/\/$/, "")));

export default function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname() || "/";
  const settings = useQuery({ queryKey: ["settings"], queryFn: getSettings });

  return (
    <div className="min-h-dvh lg:flex">
      {/* Laptop: side menu */}
      <aside className="hidden lg:flex lg:w-60 lg:shrink-0 lg:flex-col lg:border-r lg:border-line lg:bg-paper lg:px-4 lg:py-6 lg:sticky lg:top-0 lg:h-dvh">
        <div className="px-3 pb-6">
          <div className="font-display text-xl font-bold leading-tight">{settings.data?.farm_name || "Dairy Farm"}</div>
          <div className="text-sm text-muted">Hisaab kitaab</div>
        </div>
        <nav aria-label="Main" className="flex flex-col gap-1">
          {NAV.map(({ href, label, Icon }) => {
            const on = isActive(path, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={on ? "page" : undefined}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-semibold ${on ? "bg-berseem-soft text-berseem-deep" : "text-muted hover:bg-ground hover:text-ink"}`}
              >
                <Icon className="nav-icon" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto px-3">
          <Link href="/settings/" className="mb-3 block text-sm font-semibold text-berseem underline">Settings</Link>
          {process.env.NEXT_PUBLIC_REQUIRE_AUTH === "true" && <button onClick={() => void getSupabase().auth.signOut()} className="mb-3 block text-sm font-semibold text-berseem underline">Sign out</button>}
          <p className="text-xs text-muted">Data Supabase se aa raha hai.</p>
        </div>
      </aside>

      <main className="flex-1 pb-28 lg:pb-12">
        <div className="flex justify-end gap-4 px-4 pt-2 lg:hidden"><Link href="/settings/" className="text-sm font-semibold text-berseem underline">Settings</Link>{process.env.NEXT_PUBLIC_REQUIRE_AUTH === "true" && <button onClick={() => void getSupabase().auth.signOut()} className="text-sm font-semibold text-berseem underline">Sign out</button>}</div>
        <div className="mx-auto w-full max-w-5xl">{children}</div>
      </main>

      {/* Phone: bottom menu */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-6 border-t border-line bg-paper/95 px-1 pt-1 pb-[max(10px,env(safe-area-inset-bottom))] backdrop-blur lg:hidden"
      >
        {NAV.map(({ href, label, Icon }) => {
          const on = isActive(path, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={on ? "page" : undefined}
              className={`flex min-h-[54px] flex-col items-center justify-center gap-0.5 text-[12px] font-semibold ${on ? "text-berseem" : "text-muted"}`}
            >
              <span className={`flex h-7 w-12 items-center justify-center rounded-full ${on ? "bg-berseem-soft" : ""}`}>
                <Icon className="nav-icon" width={21} height={21} />
              </span>
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
