import { getSupabase } from "./supabase";

export const ANIMAL_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const ANIMAL_PHOTO_MIME_TYPES = ["image/jpeg", "image/png"] as const;

export function validateAnimalPhoto(file: Pick<File, "type" | "size">): string | null {
  if (!(ANIMAL_PHOTO_MIME_TYPES as readonly string[]).includes(file.type)) return "JPEG ya PNG photo chunein.";
  if (file.size <= 0 || file.size > ANIMAL_PHOTO_MAX_BYTES) return "Photo 5 MB ya us se chhoti honi chahiye.";
  return null;
}

export async function signedAnimalPhotoUrl(path: string): Promise<string> {
  const { data, error } = await getSupabase().storage.from("animal-photos").createSignedUrl(path, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
}

export async function animalPhotoDataUrl(path: string): Promise<string> {
  const url = await signedAnimalPhotoUrl(path);
  const response = await fetch(url);
  if (!response.ok) throw new Error("ANIMAL_PHOTO_DOWNLOAD_FAILED");
  const blob = await response.blob();
  if (!(ANIMAL_PHOTO_MIME_TYPES as readonly string[]).includes(blob.type)) throw new Error("ANIMAL_PHOTO_TYPE_UNSUPPORTED");
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("ANIMAL_PHOTO_READ_FAILED"));
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("ANIMAL_PHOTO_READ_FAILED"));
    reader.readAsDataURL(blob);
  });
}

async function setAnimalPhotoPath(animalId: string, expectedUpdatedAt: string, photoPath: string | null): Promise<void> {
  const { data, error } = await getSupabase().from("animals").update({ photo_path: photoPath })
    .eq("id", animalId).eq("updated_at", expectedUpdatedAt).select("id").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("ANIMAL_STALE");
}

export async function replaceAnimalPhoto(animal: { id: string; updated_at: string; photo_path: string | null }, file: File): Promise<{ cleanupWarning: boolean; photoPath: string }> {
  const validation = validateAnimalPhoto(file);
  if (validation) throw new RangeError(validation);
  const extension = file.type === "image/png" ? "png" : "jpg";
  const path = `${animal.id}/${crypto.randomUUID()}.${extension}`;
  const storage = getSupabase().storage.from("animal-photos");
  const { error: uploadError } = await storage.upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) throw uploadError;
  try {
    await setAnimalPhotoPath(animal.id, animal.updated_at, path);
  } catch (error) {
    await storage.remove([path]).catch(() => ({ error: true }));
    throw error;
  }
  if (!animal.photo_path) return { cleanupWarning: false, photoPath: path };
  try {
    const { error: cleanupError } = await storage.remove([animal.photo_path]);
    return { cleanupWarning: Boolean(cleanupError), photoPath: path };
  } catch {
    return { cleanupWarning: true, photoPath: path };
  }
}

export async function removeAnimalPhoto(animal: { id: string; updated_at: string; photo_path: string | null }): Promise<{ cleanupWarning: boolean; photoPath: null }> {
  if (!animal.photo_path) return { cleanupWarning: false, photoPath: null };
  await setAnimalPhotoPath(animal.id, animal.updated_at, null);
  try {
    const { error } = await getSupabase().storage.from("animal-photos").remove([animal.photo_path]);
    return { cleanupWarning: Boolean(error), photoPath: null };
  } catch {
    return { cleanupWarning: true, photoPath: null };
  }
}
