import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { customers, FARM_NAME } from "@/lib/mock-data";
import {
  customerBalance, customerBill, customerLedger, customerLitres, customerPaid, findCustomer, num, rs,
} from "@/lib/calc";
import { Body, Demo, PageHeader } from "@/components/ui";
import KhataActions from "@/components/KhataActions";

export const dynamicParams = false;
export function generateStaticParams() {
  return customers.map((c) => ({ id: c.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: findCustomer(id)?.name ?? "Khata" };
}

export default async function CustomerKhata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = findCustomer(id);
  if (!c) notFound();

  const bal = customerBalance(c);
  const rows = customerLedger(c);
  const billText =
    `${FARM_NAME}\nAssalam o Alaikum ${c.name},\nOctober (1 se 10) ka hisaab:\n` +
    `Pichla baqaya: ${rs(c.openingBalance)}\n` +
    `Doodh: ${customerLitres(c)} L x Rs ${c.rate} = ${rs(customerBill(c))}\n` +
    `Wusooli: ${rs(customerPaid(c))}\n` +
    `Kul baqi: ${rs(bal)}\nShukriya.`;

  return (
    <>
      <PageHeader
        back="/khata/"
        title={c.name}
        sub={`${c.area}, ${c.phone}. Subah ${c.morning} L, shaam ${c.evening} L, Rs ${c.rate}/L`}
      />
      <Body className="grid gap-4 lg:grid-cols-[1fr_1.4fr] lg:items-start">
        <div className="grid gap-4">
          <section className={`rounded-2xl p-5 text-white ${bal > 0 ? "bg-udhaar" : "bg-berseem"}`}>
            <p className="text-[15px] text-white/80">{bal > 0 ? "Baqi raqam (udhaar)" : "Hisaab saaf hai"}</p>
            <p className="font-display text-[44px] font-extrabold leading-none tnum">{rs(bal)}</p>
          </section>

          <section className="rounded-2xl border border-line bg-paper p-4 sm:p-5">
            <h2 className="font-display text-[17px] font-bold">October ka bill</h2>
            <dl className="mt-2 divide-y divide-line">
              <div className="flex justify-between py-2"><dt>Pichla baqaya</dt><dd className="font-semibold tnum">{rs(c.openingBalance)}</dd></div>
              <div className="flex justify-between py-2"><dt>Doodh: {customerLitres(c)} L x Rs {c.rate}</dt><dd className="font-semibold tnum">{rs(customerBill(c))}</dd></div>
              <div className="flex justify-between py-2"><dt>Wusooli</dt><dd className="font-semibold text-berseem tnum">− {rs(customerPaid(c))}</dd></div>
              <div className="flex justify-between py-2"><dt className="font-bold">Kul baqi</dt><dd className={`font-bold tnum ${bal > 0 ? "text-udhaar" : "text-berseem"}`}>{rs(bal)}</dd></div>
            </dl>
          </section>

          <KhataActions name={c.name} phone={c.phone} balance={bal} billText={billText} />
        </div>

        {/* Bahi-khata register */}
        <section aria-labelledby="register" className="overflow-hidden rounded-2xl border border-line">
          <div className="flex items-center justify-between bg-[#eef3f8] px-4 py-3">
            <h2 id="register" className="font-display text-[17px] font-bold">Register</h2>
            <span className="text-[13px] text-muted">Rozana ka hisaab</span>
          </div>
          <div className="ledger-page">
            <div className="grid h-[52px] grid-cols-[54px_minmax(0,1fr)_auto_auto] items-center gap-x-3 pr-4 text-[12px] font-semibold text-muted">
              <span className="pl-2">Din</span>
              <span className="pl-2">Tafseel</span>
              <span className="w-[72px] text-right">Raqam</span>
              <span className="w-[72px] text-right">Baqaya</span>
            </div>
            <ol>
              {rows.map((r, i) => (
                <li key={i} className="grid h-[52px] grid-cols-[54px_minmax(0,1fr)_auto_auto] items-center gap-x-3 pr-4 text-[14px]">
                  <span className="pl-1.5 text-[13px] font-semibold tnum">{Number(r.date.slice(8))} Oct</span>
                  <span className={`truncate pl-2 ${r.credit ? "font-semibold text-berseem" : ""}`}>{r.text}</span>
                  <span className={`w-[72px] text-right font-semibold tnum ${r.credit ? "text-berseem" : ""}`}>
                    {r.credit ? `− ${num(r.credit)}` : r.debit ? num(r.debit) : "–"}
                  </span>
                  <span className="w-[72px] text-right font-bold tnum">{num(r.balance)}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </Body>
      <Demo />
    </>
  );
}
