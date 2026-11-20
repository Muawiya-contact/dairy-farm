"use client";

import { useState, type FormEvent } from "react";
import { getSupabase } from "@/lib/supabase";
import { insertRow, longDate, shortDate, type AnimalCareTask } from "@/lib/farm-data";
import { Panel } from "./ui";

const field = "min-h-11 w-full rounded-xl border border-line bg-paper px-3";
const categoryLabels: Record<AnimalCareTask["category"], string> = {
  heat: "Agli heat", vaccination: "Vaccine", deworming: "Deworming",
  medicine: "Dawai", checkup: "Checkup", custom: "Doosra",
};

export function AnimalCareTasks({ animalId, tasks, today, active, busy, run }: {
  animalId: string;
  tasks: AnimalCareTask[];
  today: string;
  active: boolean;
  busy: boolean;
  run: (task: () => Promise<void>) => Promise<void>;
}) {
  const [completingId, setCompletingId] = useState<string | null>(null);
  const activeTasks = tasks.filter((task) => !task.completed_date).sort((a, b) => a.due_date.localeCompare(b.due_date));
  const completedTasks = tasks.filter((task) => task.completed_date).sort((a, b) => (b.completed_date ?? "").localeCompare(a.completed_date ?? ""));

  const addTask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const title = String(values.get("title") ?? "").trim();
    if (!title || title.length > 120) return;
    void run(async () => {
      await insertRow("animal_care_tasks", {
        animal_id: animalId,
        category: String(values.get("category")) as AnimalCareTask["category"],
        title,
        due_date: String(values.get("due_date")),
        notes: String(values.get("notes") ?? "").trim() || null,
      });
      form.reset();
    });
  };

  const completeTask = (event: FormEvent<HTMLFormElement>, task: AnimalCareTask) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const completedDate = String(values.get("completed_date") ?? "");
    if (!completedDate || completedDate > today) return;
    const completionNotes = String(values.get("completion_notes") ?? "").trim() || null;
    void run(async () => {
      const { data, error } = await getSupabase().from("animal_care_tasks").update({
        completed_date: completedDate,
        completion_notes: completionNotes,
      }).eq("id", task.id).eq("updated_at", task.updated_at).is("completed_date", null).select("id").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("CARE_TASK_STALE");
      setCompletingId(null);
    });
  };

  return <Panel title="Janwar ke yaad-dihani" className="lg:col-span-2">
    <p className="text-sm text-muted">Yeh yaad-dihani bell mein bhi dikhegi. Bell se chup karna task ko mukammal nahi karta.</p>
    {active && <form onSubmit={addTask} className="mt-3 grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-2 lg:grid-cols-3">
      <h3 className="font-semibold sm:col-span-2 lg:col-span-3">Naya follow-up</h3>
      <label className="text-sm font-semibold">Qism<select name="category" className={field} disabled={busy}>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="text-sm font-semibold">Task ka naam<input name="title" required maxLength={120} placeholder="Misal: FMD vaccine" className={field} disabled={busy} /></label>
      <label className="text-sm font-semibold">Due tareekh<input name="due_date" required type="date" defaultValue={today} className={field} disabled={busy} /></label>
      <label className="text-sm font-semibold sm:col-span-2">Note (optional)<input name="notes" maxLength={500} placeholder="Koi zaroori tafseel" className={field} disabled={busy} /></label>
      <button disabled={busy} className="min-h-11 rounded-xl bg-berseem px-4 font-bold text-white disabled:opacity-50">Yaad-dihani save</button>
    </form>}
    <section className="mt-4" aria-label="Khulay yaad-dihani tasks">
      <h3 className="font-semibold">Khulay tasks ({activeTasks.length})</h3>
      {activeTasks.length ? <ul className="mt-2 divide-y divide-line">{activeTasks.map((task) => <li key={task.id} className="py-3">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><strong>{task.title}</strong><p className="text-sm text-muted">{categoryLabels[task.category]} · {longDate(task.due_date)}{task.notes ? ` · ${task.notes}` : ""}</p></div>
          <button type="button" disabled={busy} onClick={() => setCompletingId(completingId === task.id ? null : task.id)} className="min-h-10 rounded-xl border border-berseem px-3 text-sm font-semibold text-berseem disabled:opacity-50">{completingId === task.id ? "Band karein" : "Mukammal karein"}</button>
        </div>
        {completingId === task.id && <form onSubmit={(event) => completeTask(event, task)} className="mt-3 grid gap-2 rounded-lg bg-ground p-3 sm:grid-cols-2">
          <label className="text-sm font-semibold">Asal mukammal hone ki tareekh<input name="completed_date" type="date" required max={today} defaultValue={today} className={field} disabled={busy} /></label>
          <label className="text-sm font-semibold">Mukammal hone ka note<input name="completion_notes" maxLength={500} placeholder="Kiya gaya kaam / dawa" className={field} disabled={busy} /></label>
          <button disabled={busy} className="min-h-11 rounded-xl bg-berseem px-4 font-bold text-white disabled:opacity-50 sm:col-span-2">Task mukammal save karein</button>
        </form>}
      </li>)}</ul> : <p className="mt-2 text-sm text-muted">Koi khula animal-care task nahi.</p>}
    </section>
    <section className="mt-4 border-t border-line pt-3" aria-label="Mukammal yaad-dihani tasks">
      <h3 className="font-semibold">Mukammal history ({completedTasks.length})</h3>
      {completedTasks.length ? <ul className="mt-2 divide-y divide-line">{completedTasks.map((task) => <li key={task.id} className="py-2 text-sm"><strong>{task.title}</strong> · {categoryLabels[task.category]} · Mukammal: {shortDate(task.completed_date!)}{task.completion_notes ? ` · ${task.completion_notes}` : ""}</li>)}</ul> : <p className="mt-2 text-sm text-muted">Abhi completed task history nahi.</p>}
    </section>
  </Panel>;
}
