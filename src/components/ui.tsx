import Link from "next/link";
import type { ReactNode } from "react";
import { BackIcon } from "./icons";


export function PageHeader({ title, sub, back, action }: { title: string; sub?: ReactNode; back?: string; action?: ReactNode }) {
  return (
    <header className="flex items-start gap-2 px-4 pt-5 pb-3 sm:px-6 lg:px-8 lg:pt-8">
      {back && (
        <Link href={back} aria-label="Wapas" className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink hover:bg-paper">
          <BackIcon />
        </Link>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="font-display text-[26px] font-bold leading-tight tracking-[-0.01em] lg:text-[32px]">{title}</h1>
        {sub && <div className="mt-0.5 text-[15px] text-muted">{sub}</div>}
      </div>
      {action}
    </header>
  );
}

export const Body = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <div className={`px-4 sm:px-6 lg:px-8 [&>*]:min-w-0 ${className}`}>{children}</div>
);

export function Panel({ title, aside, children, className = "" }: { title?: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-paper p-4 sm:p-5 ${className}`}>
      {title && (
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-display text-[17px] font-bold">{title}</h2>
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

const statusLabel: Record<string, string> = { milking: "Doodh de rahi", dry: "Khushk", pregnant: "Gaabhan", sick: "Beemar", calf: "Bacha", none: "Doodh nahi", active: "Active", sold: "Farokht", dead: "Wafat" };
const tagStyle: Record<string, string> = {
  milking: "bg-berseem-soft text-berseem-deep", dry: "bg-[#ebece6] text-[#4a524c]",
  pregnant: "bg-haldi-soft text-haldi-ink", sick: "bg-udhaar-soft text-udhaar",
  calf: "bg-neel-soft text-neel",
};
export const StatusTag = ({ status }: { status: string }) => (
  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${tagStyle[status] ?? "bg-ground text-muted"}`}>
    {statusLabel[status] ?? status}
  </span>
);

// Kept while older preview screens are replaced in focused commits.
export const Demo = () => <p className="px-4 pt-6 text-center text-xs text-muted sm:px-6 lg:hidden">Preview version. Sab figures dummy hain.</p>;
