import { getSupabase } from "./supabase";
import type { HealthEventAttachment } from "./farm-data";

export const HEALTH_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const HEALTH_ATTACHMENT_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;

export function validateHealthAttachment(file: Pick<File, "type" | "size">): string | null {
  if (!(HEALTH_ATTACHMENT_MIME_TYPES as readonly string[]).includes(file.type)) return "PDF, JPEG ya PNG file chunein.";
  if (file.size <= 0 || file.size > HEALTH_ATTACHMENT_MAX_BYTES) return "File 10 MB ya us se chhoti honi chahiye.";
  return null;
}

function safeFileName(name: string): string {
  return name.replace(/[\\/\u0000-\u001f\u007f]/g, "_").trim().slice(0, 180) || "health-record";
}

export async function uploadHealthAttachment(healthEventId: string, file: File): Promise<void> {
  const validation = validateHealthAttachment(file);
  if (validation) throw new RangeError(validation);
  const extension = file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : "jpg";
  const storagePath = `${healthEventId}/${crypto.randomUUID()}.${extension}`;
  const storage = getSupabase().storage.from("health-records");
  const { error: uploadError } = await storage.upload(storagePath, file, { contentType: file.type, upsert: false });
  if (uploadError) throw uploadError;
  const { error: metadataError } = await getSupabase().from("health_event_attachments").insert({
    health_event_id: healthEventId,
    storage_path: storagePath,
    file_name: safeFileName(file.name),
    content_type: file.type,
    size_bytes: file.size,
  });
  if (metadataError) {
    const { error: cleanupError } = await storage.remove([storagePath]);
    if (cleanupError) throw new Error("HEALTH_ATTACHMENT_METADATA_FAILED_FILE_CLEANUP_FAILED");
    throw metadataError;
  }
}

export async function signedHealthAttachmentUrl(attachment: Pick<HealthEventAttachment, "storage_path" | "file_name">): Promise<string> {
  const { data, error } = await getSupabase().storage.from("health-records")
    .createSignedUrl(attachment.storage_path, 60 * 15, { download: attachment.file_name });
  if (error) throw error;
  return data.signedUrl;
}
