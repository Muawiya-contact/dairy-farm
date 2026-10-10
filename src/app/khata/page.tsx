import type { Metadata } from "next";
import Link from "next/link";
import { customers } from "@/lib/mock-data";
import { customerBalance, customerLitres, rs } from "@/lib/calc";
import { Body, Demo, PageHeader } from "@/components/ui";
import { PlusIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Khata" };

export default function KhataPage() {
  const list = [...customers].sort((a, b) => customerBalance(b) - customerBalance(a));
  const totalDue = list.reduce((s, c) => s + Math.max(0, customerBalance(c)), 0);

  return (
    <>
      <PageHeader
        title="Khata"
        sub={`${customers.length} customers`}
        action={<button className="flex min-h-[44px] items-center gap-1.5 rounded-xl bg-berseem px-4 font-semibold text-white hover:bg-berseem-deep"><PlusIcon width={18} height={18} />Customer</button>}
      />
      <Body className="grid gap-4">
        <section className="flex items-end justify-between gap-4 rounded-2xl bg-udhaar p-5 text-white">
          <div>
            <p className="text-[15px] text-[#f6dcda]">Kul udhaar jo lena hai</p>
            <p className="font-display text-[40px] font-extrabold leading-none tnum">{rs(totalDue)}</p>
          </div>
          <p className="max-w-[12rem] text-right text-[14px] text-[#f6dcda]">{list.filter((c) => customerBalance(c) > 0).length} customers ke zimme</p>
        </section>

        <ul className="overflow-hidden rounded-2xl border border-line bg-paper">
          {list.map((c) => {
            const bal = customerBalance(c);
            return (
              <li key={c.id} className="border-b border-line last:border-b-0">
                <Link href={`/khata/${c.id}/`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-ground">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ground font-display font-bold text-muted">
                    {c.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{c.name}</span>
                    <span className="block text-[14px] text-muted">{c.area}, is maah {customerLitres(c)} L</span>
                  </span>
                  <span className="text-right">
                    <span className={`block font-bold tnum ${bal > 0 ? "text-udhaar" : "text-berseem"}`}>{bal > 0 ? rs(bal) : "Saaf"}</span>
                    <span className="block text-[12px] text-muted">{bal > 0 ? "baqi" : "koi udhaar nahi"}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </Body>
      <Demo />
    </>
  );
}
