"use client";

import Link from "next/link";
import { useState } from "react";
import { animals, type AnimalStatus } from "@/lib/mock-data";
import { ageText, avgMilk, kindLabel, litres, statusLabel, isGivingMilk } from "@/lib/calc";
import { StatusTag } from "./ui";
import { SearchIcon } from "./icons";

type Filter = "all" | "bhains" | "gaye" | AnimalStatus;

export default function AnimalList() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const count = (f: Filter) =>
    f === "all" ? animals.length
      : f === "bhains" || f === "gaye" ? animals.filter((a) => a.kind === f).length
      : animals.filter((a) => a.status === f).length;

  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: "Sab" },
    { key: "bhains", label: "Bhainsein" },
    { key: "gaye", label: "Gayein" },
    { key: "pregnant", label: statusLabel.pregnant },
    { key: "dry", label: statusLabel.dry },
    { key: "sick", label: statusLabel.sick },
    { key: "calf", label: "Bachay" },
  ];

  const term = q.trim().toLowerCase();
  const list = animals.filter((a) => {
      const okFilter = filter === "all" || a.kind === filter || a.status === filter;
      const okSearch = !term || a.id.toLowerCase().includes(term) || a.breed.toLowerCase().includes(term);
      return okFilter && okSearch;
  });

  return (
    <>
      <label className="flex min-h-[50px] items-center gap-2 rounded-xl border border-line bg-paper px-3 focus-within:border-berseem">
        <SearchIcon className="text-muted" />
        <span className="sr-only">Search</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tag number ya nasal likhein"
          className="w-0 min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted/80"
        />
      </label>

      <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={`min-h-[40px] shrink-0 whitespace-nowrap rounded-full border px-4 text-[14px] font-semibold ${filter === f.key ? "border-ink bg-ink text-white" : "border-line bg-paper text-ink hover:border-muted"}`}
          >
            {f.label} <span className={filter === f.key ? "text-white/70" : "text-muted"}>{count(f.key)}</span>
          </button>
        ))}
      </div>

      <ul className="mt-4 overflow-hidden rounded-2xl border border-line bg-paper lg:grid lg:grid-cols-2 lg:gap-px lg:bg-line">
        {list.map((a) => (
          <li key={a.id} className="border-b border-line last:border-b-0 lg:border-b-0 lg:bg-paper">
            <Link href={`/janwar/${a.id}/`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-ground">
              <span className={`flex h-12 w-14 shrink-0 items-center justify-center rounded-lg border-2 font-display text-[15px] font-bold ${a.kind === "bhains" ? "border-ink/80 text-ink" : "border-haldi-ink/70 text-haldi-ink"}`}>
                {a.id}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{a.breed} {kindLabel[a.kind].toLowerCase()}</span>
                <span className="block text-[14px] text-muted">
                  {ageText(a.born)}
                  {isGivingMilk(a) ? `, ${litres(Math.round(avgMilk(a) * 10) / 10)} roz` : a.motherId ? `, maa ${a.motherId}` : ""}
                </span>
              </span>
              <StatusTag status={a.status} />
            </Link>
          </li>
        ))}
        {list.length === 0 && (
          <li className="px-4 py-10 text-center text-muted lg:col-span-2">
            Is search se koi janwar nahi mila. Tag number check karein.
          </li>
        )}
      </ul>
    </>
  );
}
