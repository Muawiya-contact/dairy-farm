import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { animals, TODAY, GESTATION_DAYS } from "@/lib/mock-data";
import {
  ageText, avgMilk, childrenOf, daysBetween, expectedDelivery, findAnimal, isGivingMilk,
  kindLabel, litres, longDate, monthlyEarning, monthlyNet, rs, AVG_RATE,
} from "@/lib/calc";
import { Body, Demo, PageHeader, Panel, StatusTag } from "@/components/ui";
import { PlusIcon } from "@/components/icons";

export const dynamicParams = false;
export function generateStaticParams() {
  return animals.map((a) => ({ id: a.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: id };
}

const dotColor = { vaccine: "bg-berseem", illness: "bg-udhaar", delivery: "bg-neel", checkup: "bg-muted" } as const;
const WEEK = ["4 Oct", "5", "6", "7", "8", "9", "Aaj"];

export default async function AnimalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = findAnimal(id);
  if (!a) notFound();

  const due = expectedDelivery(a);
  const left = due ? daysBetween(TODAY, due) : undefined;
  const kids = childrenOf(a.id);
  const max = Math.max(...a.last7, 1);
  const net = monthlyNet(a);
  const milky = isGivingMilk(a);
  const trend = a.last7[6] - a.last7[0];

  return (
    <>
      <PageHeader back="/janwar/" title={a.id} sub={<span className="flex flex-wrap items-center gap-2">{a.breed} {kindLabel[a.kind].toLowerCase()}, {a.sex === "female" ? "maada" : "nar"} <StatusTag status={a.status} /></span>} />

      <Body className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
            <div><dt className="text-[14px] text-muted">Umar</dt><dd className="text-[17px] font-bold">{ageText(a.born)}</dd></div>
            <div><dt className="text-[14px] text-muted">Paidaish</dt><dd className="text-[17px] font-bold">{longDate(a.born)}</dd></div>
            {a.purchasePrice ? (
              <>
                <div><dt className="text-[14px] text-muted">Qeemat-e-khareed</dt><dd className="text-[17px] font-bold tnum">{rs(a.purchasePrice)}</dd></div>
                <div><dt className="text-[14px] text-muted">Khareedi</dt><dd className="text-[17px] font-bold">{longDate(a.purchaseDate!)}</dd></div>
              </>
            ) : (
              <div className="col-span-2"><dt className="text-[14px] text-muted">Farm par paida hua</dt><dd className="text-[17px] font-bold">Maa: <Link className="text-berseem underline underline-offset-4" href={`/janwar/${a.motherId}/`}>{a.motherId}</Link></dd></div>
            )}
          </dl>
          {kids.length > 0 && (
            <p className="mt-4 border-t border-line pt-3 text-[15px]">
              Bachay:{" "}
              {kids.map((k, i) => (
                <span key={k.id}>{i > 0 && ", "}<Link className="font-semibold text-berseem underline underline-offset-4" href={`/janwar/${k.id}/`}>{k.id}</Link></span>
              ))}
            </p>
          )}
        </Panel>

        {milky ? (
          <Panel title="Pichle 7 din ka doodh" aside={<span className="font-bold tnum">{litres(Math.round(avgMilk(a) * 10) / 10)} roz</span>}>
            <div className="flex h-28 items-end gap-2">
              {a.last7.map((v, i) => (
                <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1">
                  <span className="text-[12px] font-semibold text-muted tnum">{v}</span>
                  <div className={`fill-rise w-full origin-bottom rounded-t-md ${i === 6 ? "bg-berseem" : "bg-[#a9c8a6]"}`} style={{ height: `${(v / max) * 80}px` }} />
                </div>
              ))}
            </div>
            <div className="mt-1.5 flex gap-2">{WEEK.map((w) => <span key={w} className="flex-1 truncate text-center text-[11px] text-muted">{w}</span>)}</div>
            {trend < -1 && <p className="mt-3 text-[14px] text-haldi-ink">Doodh {litres(Math.abs(Math.round(trend * 10) / 10))} kam hua hai is hafte. {a.status === "sick" ? "Ilaaj jaari rakhein." : due ? "Delivery qareeb hone ki wajah se ho sakta hai." : "Khuraak check karein."}</p>}
          </Panel>
        ) : (
          <Panel title="Doodh">
            <p className="text-muted">{a.status === "calf" ? "Bachha hai, abhi doodh nahi deta." : "Khushk hai, abhi doodh nahi de rahi."}</p>
          </Panel>
        )}

        {a.status !== "calf" && (
          <Panel title="Mahana andaza">
            <dl className="divide-y divide-line">
              <div className="flex justify-between py-2"><dt>Kamai</dt><dd className="font-bold tnum">{rs(monthlyEarning(a))}</dd></div>
              <div className="flex justify-between py-2"><dt>Khuraak, dawai ka kharcha</dt><dd className="font-bold tnum">{rs(a.monthCost)}</dd></div>
              <div className="flex items-baseline justify-between py-2"><dt className="font-semibold">Bachat</dt><dd className={`font-display text-[22px] font-extrabold tnum ${net < 0 ? "text-udhaar" : "text-berseem"}`}>{net < 0 ? "− " : "+ "}{rs(Math.abs(net))}</dd></div>
            </dl>
            <p className="mt-2 text-[13px] text-muted">Andaza: roz ka ausat doodh x 30 din x Rs {AVG_RATE} litre.</p>
          </Panel>
        )}

        {(a.inseminated || a.status === "pregnant") && due && (
          <section className="rounded-2xl border border-[#ecd9ac] bg-haldi-soft p-4 sm:p-5">
            <h2 className="font-display text-[17px] font-bold">Nasl kashi</h2>
            <dl className="mt-3 divide-y divide-[#ecd9ac]">
              <div className="flex justify-between py-2"><dt>Tukhm rezi (insemination)</dt><dd className="font-bold">{longDate(a.inseminated!)}</dd></div>
              <div className="flex justify-between py-2"><dt>Mutawaqqa delivery</dt><dd className="font-bold text-haldi-ink">{longDate(due)}</dd></div>
            </dl>
            <p className="mt-2 text-[14px] text-haldi-ink">
              {left! >= 0 ? `${left} din baqi.` : "Tareekh guzar chuki hai, check karein."} App khud {GESTATION_DAYS[a.kind]} din jor kar tareekh nikalti hai.
            </p>
          </section>
        )}

        <Panel
          title="Sehat ka record"
          className="lg:col-span-2"
          aside={<button className="flex min-h-[40px] items-center gap-1 rounded-lg border border-line px-3 text-[14px] font-semibold hover:border-muted"><PlusIcon width={16} height={16} />Shamil karein</button>}
        >
          <ol className="relative ml-1.5 border-l-2 border-line">
            {a.health.map((h) => (
              <li key={h.date + h.title} className="relative pb-4 pl-5 last:pb-0">
                <span className={`absolute top-1.5 -left-[7px] h-3 w-3 rounded-full ring-4 ring-paper ${dotColor[h.kind]}`} />
                <p className="font-semibold">{h.title}</p>
                <p className="text-[14px] text-muted">
                  {longDate(h.date)}
                  {h.note && `. ${h.note}`}
                  {h.cost ? `. ${rs(h.cost)}` : ""}
                </p>
              </li>
            ))}
          </ol>
        </Panel>
      </Body>
      <Demo />
    </>
  );
}
