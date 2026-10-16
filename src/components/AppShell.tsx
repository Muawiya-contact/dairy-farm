"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { BackIcon, BookIcon, CanIcon, CoinsIcon, CowIcon, HomeIcon, SettingsIcon, SignOutIcon, WalletIcon } from "./icons";
import { useQuery } from "@tanstack/react-query";
import { getSettings } from "@/lib/settings";
import { getSupabase } from "@/lib/supabase";
import LogoMark from "./LogoMark";
import SubscriptionNotice from "./SubscriptionNotice";

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="min-h-dvh lg:flex">
      {/* Laptop: side menu */}
      <aside className={`hidden lg:sticky lg:top-0 lg:flex lg:h-dvh lg:shrink-0 lg:flex-col lg:border-r lg:border-line lg:bg-paper lg:py-6 ${sidebarCollapsed ? "lg:w-16 lg:px-2" : "lg:w-72 lg:px-4"}`}>
        <div className={`flex items-start pb-6 ${sidebarCollapsed ? "justify-center" : "justify-between gap-2 px-3"}`}>
          {!sidebarCollapsed && <div className="flex min-w-0 items-center gap-2">
            <LogoMark size={36} />
            <div className="min-w-0">
              <div className="truncate font-display text-base font-bold leading-tight" title={settings.data?.farm_name || "Dairy Farm"}>{settings.data?.farm_name || "Dairy Farm"}</div>
              <div className="text-xs text-muted">Hisaab kitaab</div>
            </div>
          </div>}
          <button
            type="button"
            aria-label={sidebarCollapsed ? "Menu dikhayein" : "Menu chhupayein"}
            aria-expanded={!sidebarCollapsed}
            aria-controls="desktop-main-nav"
            title={sidebarCollapsed ? "Menu dikhayein" : "Menu chhupayein"}
            onClick={() => setSidebarCollapsed((value) => !value)}
            className="flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-xl border border-line text-berseem hover:bg-berseem-soft"
          >
            <BackIcon width={18} height={18} className={sidebarCollapsed ? "rotate-180" : undefined} />
          </button>
        </div>
        <nav id="desktop-main-nav" aria-label="Main" className={sidebarCollapsed ? "hidden" : "flex flex-col gap-1"}>
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
        <div className={`mt-auto flex flex-col gap-2 ${sidebarCollapsed ? "items-center" : "px-3"}`}>
          <Link href="/settings/" aria-label="Settings" aria-current={isActive(path, "/settings/") ? "page" : undefined} title="Settings" className="flex min-h-10 w-10 items-center justify-center rounded-xl text-berseem hover:bg-berseem-soft">
            <SettingsIcon width={19} height={19} />
          </Link>
          {process.env.NEXT_PUBLIC_REQUIRE_AUTH === "true" && <button type="button" onClick={() => void getSupabase().auth.signOut()} aria-label="Bahar niklein" title={sidebarCollapsed ? "Bahar niklein" : undefined} className={`flex min-h-10 items-center gap-2 rounded-xl text-sm font-semibold text-berseem hover:bg-berseem-soft ${sidebarCollapsed ? "w-10 justify-center" : "px-2"}`}><SignOutIcon width={19} height={19} />{!sidebarCollapsed && "Bahar niklein"}</button>}
          {!sidebarCollapsed && <p className="text-xs text-muted">Farm ka hisaab</p>}
        </div>
      </aside>

      <main className="min-w-0 flex-1 pb-28 lg:pb-12">
        {process.env.NEXT_PUBLIC_APP_ENV === "staging" && <div role="status" className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-center text-sm font-semibold text-amber-950">DEMO: yeh asli data nahi. Asli maloomat yahan na likhein.</div>}
        <div className="flex items-center justify-between gap-3 px-4 pt-2 lg:hidden"><div className="flex min-w-0 items-center gap-2"><LogoMark size={32} /><span className="truncate font-display text-sm font-bold">{settings.data?.farm_name || "Dairy Farm"}</span></div><Link href="/settings/" aria-label="Settings kholein" title="Settings kholein" className="flex min-h-11 min-w-11 shrink-0 items-center justify-center text-berseem"><SettingsIcon width={21} height={21} /></Link></div>
        <div className="mx-auto w-full max-w-5xl"><SubscriptionNotice>{children}</SubscriptionNotice></div>
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
