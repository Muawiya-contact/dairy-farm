"use client";

import Image from "next/image";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { friendlyError } from "@/lib/errors";
import { refreshFarmViews } from "@/lib/query-refresh";
import { removeAnimalPhoto, replaceAnimalPhoto, signedAnimalPhotoUrl } from "@/lib/animal-photos";
import type { Animal, FarmData } from "@/lib/farm-data";
import { Panel } from "./ui";

export function AnimalProfilePhoto({ animal }: { animal: Animal }) {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const photo = useQuery({
    queryKey: ["animal-photo-url", animal.id, animal.photo_path],
    queryFn: () => signedAnimalPhotoUrl(animal.photo_path!),
    enabled: Boolean(animal.photo_path),
    staleTime: 50 * 60 * 1000,
  });

  const updateCachedPhotoPath = (photoPath: string | null) => {
    client.setQueriesData<FarmData>({ queryKey: ["farm-data"] }, (current) => current && ({
      ...current,
      animals: current.animals.map((row) => row.id === animal.id ? { ...row, photo_path: photoPath } : row),
    }));
  };

  const refreshViews = async () => {
    try {
      await refreshFarmViews(client, "animal");
      return false;
    } catch {
      return true;
    }
  };

  const upload = async (file: File | undefined) => {
    if (!file || busy) return;
    setBusy(true); setMessage("");
    try {
      const result = await replaceAnimalPhoto(animal, file);
      updateCachedPhotoPath(result.photoPath);
      const refreshWarning = await refreshViews();
      const warnings = [
        result.cleanupWarning && "Purani private file ki safai baad mein dobara koshish karein.",
        refreshWarning && "Profile refresh nahi ho saka; naye data ke liye page reload karein.",
      ].filter(Boolean).join(" ");
      setMessage(`Photo save ho gayi.${warnings ? ` ${warnings}` : ""}`);
    } catch (error) { setMessage(`Photo save nahi hui: ${friendlyError(error)}`); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    if (!animal.photo_path || busy || !window.confirm("Is janwar ki tasveer hata dein?")) return;
    setBusy(true); setMessage("");
    try {
      const result = await removeAnimalPhoto(animal);
      updateCachedPhotoPath(result.photoPath);
      const refreshWarning = await refreshViews();
      const warnings = [
        result.cleanupWarning && "Private file ki safai dobara koshish karein.",
        refreshWarning && "Profile refresh nahi ho saka; naye data ke liye page reload karein.",
      ].filter(Boolean).join(" ");
      setMessage(`Photo profile se hata di.${warnings ? ` ${warnings}` : ""}`);
    } catch (error) { setMessage(`Photo nahi hati: ${friendlyError(error)}`); }
    finally { setBusy(false); }
  };

  return <Panel title="Janwar ki tasveer">
    <div className="flex flex-wrap items-center gap-4">
      <div className="relative flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-ground">
        {photo.data ? <Image src={photo.data} alt={`${animal.tag} ki tasveer`} fill unoptimized sizes="128px" className="object-cover" />
          : <span className="px-2 text-center text-sm text-muted">{photo.isLoading ? "Tasveer load ho rahi hai" : animal.photo_path ? "Tasveer dastiyab nahi" : "Tasveer nahi"}</span>}
      </div>
      <div className="print:hidden grid gap-2">
        <label className="grid gap-1 text-sm font-semibold">Tasveer upload ya tabdeel karein
          <input type="file" accept="image/jpeg,image/png" aria-label="Tasveer upload karein" disabled={busy}
            onChange={(event) => { void upload(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }}
            className="min-h-11 max-w-full rounded-xl border border-line bg-paper px-2 py-2 text-sm" />
        </label>
        <p className="text-xs text-muted">Sirf JPEG ya PNG · 5 MB tak</p>
        {animal.photo_path && <button type="button" onClick={() => void remove()} disabled={busy}
          className="min-h-11 justify-self-start rounded-xl border border-line px-3 text-sm font-semibold disabled:opacity-50">Tasveer hata dein</button>}
      </div>
    </div>
    {photo.isError && <p role="alert" className="mt-3 text-sm text-udhaar">Photo load nahi hui: {friendlyError(photo.error)}</p>}
    {message && <p role={message.includes("nahi") ? "alert" : "status"} className="mt-3 text-sm text-muted">{message}</p>}
  </Panel>;
}
