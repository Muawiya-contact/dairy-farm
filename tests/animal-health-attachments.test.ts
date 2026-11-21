import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  insert: vi.fn(), upload: vi.fn(), remove: vi.fn(), createSignedUrl: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({ getSupabase: () => ({
  from: () => ({ insert: mocks.insert }),
  storage: { from: () => ({ upload: mocks.upload, remove: mocks.remove, createSignedUrl: mocks.createSignedUrl }) },
}) }));

import {
  HEALTH_ATTACHMENT_MAX_BYTES, signedHealthAttachmentUrl, uploadHealthAttachment, validateHealthAttachment,
} from "@/lib/animal-health-attachments";

const eventId = "11111111-1111-4111-8111-111111111111";
const pdf = (name = "vet-report.pdf", content = "pdf") => new File([content], name, { type: "application/pdf" });

afterEach(() => vi.clearAllMocks());

describe("private health attachment lifecycle", () => {
  it("accepts only non-empty supported files through the size limit", () => {
    expect(validateHealthAttachment(pdf())).toBeNull();
    expect(validateHealthAttachment(new File(["x"], "scan.gif", { type: "image/gif" }))).toMatch(/PDF, JPEG ya PNG/);
    expect(validateHealthAttachment(new File([], "empty.pdf", { type: "application/pdf" }))).toMatch(/10 MB/);
    expect(validateHealthAttachment({ type: "application/pdf", size: HEALTH_ATTACHMENT_MAX_BYTES + 1 })).toMatch(/10 MB/);
    expect(validateHealthAttachment({ type: "image/png", size: HEALTH_ATTACHMENT_MAX_BYTES })).toBeNull();
  });

  it("uploads to an event-scoped private path and stores a safe display filename", async () => {
    mocks.upload.mockResolvedValue({ error: null });
    mocks.insert.mockResolvedValue({ error: null });
    const file = pdf("vet/report.pdf");
    await uploadHealthAttachment(eventId, file);

    const path = expect.stringMatching(new RegExp(`^${eventId}/[0-9a-f-]+\\.pdf$`));
    expect(mocks.upload).toHaveBeenCalledWith(path, file, { contentType: "application/pdf", upsert: false });
    expect(mocks.insert).toHaveBeenCalledWith({
      health_event_id: eventId, storage_path: path, file_name: "vet_report.pdf", content_type: "application/pdf", size_bytes: file.size,
    });
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("does not create metadata after storage upload fails", async () => {
    mocks.upload.mockResolvedValue({ error: new Error("storage unavailable") });
    await expect(uploadHealthAttachment(eventId, pdf())).rejects.toThrow("storage unavailable");
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("removes the private object if metadata creation fails", async () => {
    mocks.upload.mockResolvedValue({ error: null });
    mocks.insert.mockResolvedValue({ error: new Error("metadata unavailable") });
    mocks.remove.mockResolvedValue({ error: null });
    await expect(uploadHealthAttachment(eventId, pdf())).rejects.toThrow("metadata unavailable");
    expect(mocks.remove).toHaveBeenCalledWith([expect.stringMatching(new RegExp(`^${eventId}/[0-9a-f-]+\\.pdf$`))]);
  });

  it("surfaces incomplete cleanup if metadata fails and storage removal also fails", async () => {
    mocks.upload.mockResolvedValue({ error: null });
    mocks.insert.mockResolvedValue({ error: new Error("metadata unavailable") });
    mocks.remove.mockResolvedValue({ error: new Error("remove unavailable") });
    await expect(uploadHealthAttachment(eventId, pdf())).rejects.toThrow("HEALTH_ATTACHMENT_METADATA_FAILED_FILE_CLEANUP_FAILED");
  });

  it("issues only a short-lived download link with the safe display name", async () => {
    mocks.createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://signed.test/file" }, error: null });
    await expect(signedHealthAttachmentUrl({ storage_path: `${eventId}/file.pdf`, file_name: "vet-report.pdf" })).resolves.toBe("https://signed.test/file");
    expect(mocks.createSignedUrl).toHaveBeenCalledWith(`${eventId}/file.pdf`, 900, { download: "vet-report.pdf" });
  });
});
