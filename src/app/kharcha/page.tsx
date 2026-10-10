import type { Metadata } from "next";
import Link from "next/link";
import { animals } from "@/lib/mock-data";
import { kindLabel, monthlyNet, octoberSales, rs } from "@/lib/calc";
import Expenses from "@/components/Expenses";
import { Body, Demo, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Kharcha" };

export default function KharchaPage() {
  const ranked = animals.filter((a) => a.status !== "calf").map((a) => ({ a, net: monthlyNet(a) })).sort((x, y) => y.net - x.net);
  const losing = ranked.filter((r) => r.net < 0);

  return (
    <>
      <PageHeader title="Kharcha aur munafa" sub="October, 1 se 10 tareekh" />
      <Body className="grid gap-4">
        <Expenses sales={octoberSales()} />

        <section className="rounded-2xl border border-line bg-paper p-4 sm:p-5">
          <h2 className="font-display text-[17px] font-bold">Har janwar ki bachat</h2>
          <p className="text-[14px] text-muted">Mahana andaza: doodh ki kamai minus khuraak aur dawai</p>
          <ul className="mt-3 grid gap-x-8 sm:grid-cols-2">
            {ranked.map(({ a, net }) => (
              <li key={a.id} className="border-b border-line">
                <Link href={`/janwar/${a.id}/`} className="flex items-center justify-between gap-3 py-2.5 hover:text-berseem">
                  <span><span className="font-display font-bold">{a.id}</span> <span className="text-[14px] text-muted">{a.breed} {kindLabel[a.kind].toLowerCase()}</span></span>
                  <span className={`font-semibold tnum ${net < 0 ? "text-udhaar" : "text-berseem"}`}>{net < 0 ? "− " : "+ "}{rs(Math.abs(net))}</span>
                </Link>
              </li>
            ))}
          </ul>
          {losing.length > 0 && (
            <p className="mt-4 rounded-xl bg-haldi-soft px-4 py-3 text-[15px] text-haldi-ink">
              {losing.map((r) => r.a.id).join(", ")} abhi kamai se zyada kharcha kar rahe hain. Khushk janwar delivery ke baad theek ho jate hain, magar beemar ya kam doodh wale janwar par ghaur karein.
            </p>
          )}
        </section>
      </Body>
      <Demo />
    </>
  );
}
