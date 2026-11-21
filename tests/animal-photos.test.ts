import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const query = {
    update: vi.fn(), eq: vi.fn(), select: vi.fn(), maybeSingle: vi.fn(),
  };
  query.update.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.select.mockReturnValue(query);
  return { query, upload: vi.fn(), remove: vi.fn(), createSignedUrl: vi.fn() };
});

vi.mock("@/lib/supabase", () => ({ getSupabase: () => ({
  from: () => mocks.query,
  storage: { from: () => ({ upload: mocks.upload, remove: mocks.remove, createSignedUrl: mocks.createSignedUrl }) },
}) }));

import { removeAnimalPhoto, replaceAnimalPhoto } from "@/lib/animal-photos";

const animal = { id: "11111111-1111-4111-8111-111111111111", updated_at: "v1", photo_path: "old/path.jpg" };
const validPhoto = () => new File(["image"], "cow.png", { type: "image/png" });

afterEach(() => vi.clearAllMocks());

describe("private animal photo lifecycle", () => {
  it("removes a newly uploaded object if the version-checked profile update fails", async () => {
    mocks.upload.mockResolvedValue({ error: null });
    mocks.query.maybeSingle.mockResolvedValue({ data: null, error: null });
    mocks.remove.mockResolvedValue({ error: null });
    await expect(replaceAnimalPhoto(animal, validPhoto())).rejects.toThrow("ANIMAL_STALE");
    expect(mocks.upload).toHaveBeenCalledOnce();
    expect(mocks.query.update).toHaveBeenCalledWith({ photo_path: expect.stringMatching(/^11111111-1111-4111-8111-111111111111\/.+\.png$/) });
    expect(mocks.remove).toHaveBeenCalledWith([expect.stringMatching(/^11111111-1111-4111-8111-111111111111\/.+\.png$/)]);
  });

  it("replaces an existing photo and reports an old-object cleanup failure", async () => {
    mocks.upload.mockResolvedValue({ error: null });
    mocks.query.maybeSingle.mockResolvedValue({ data: { id: animal.id }, error: null });
    mocks.remove.mockResolvedValue({ error: { message: "delete failed" } });
    await expect(replaceAnimalPhoto(animal, validPhoto())).resolves.toEqual({
      cleanupWarning: true,
      photoPath: expect.stringMatching(/^11111111-1111-4111-8111-111111111111\/.+\.png$/),
    });
    expect(mocks.remove).toHaveBeenCalledWith([animal.photo_path]);
  });

  it("clears the profile path before removing the private file", async () => {
    mocks.query.maybeSingle.mockResolvedValue({ data: { id: animal.id }, error: null });
    mocks.remove.mockResolvedValue({ error: null });
    await expect(removeAnimalPhoto(animal)).resolves.toEqual({ cleanupWarning: false, photoPath: null });
    expect(mocks.query.update).toHaveBeenCalledWith({ photo_path: null });
    expect(mocks.remove).toHaveBeenCalledWith([animal.photo_path]);
  });

  it("keeps a successful replacement successful when deleting the old file throws", async () => {
    mocks.upload.mockResolvedValue({ error: null });
    mocks.query.maybeSingle.mockResolvedValue({ data: { id: animal.id }, error: null });
    mocks.remove.mockRejectedValue(new Error("temporary storage failure"));
    await expect(replaceAnimalPhoto(animal, validPhoto())).resolves.toMatchObject({ cleanupWarning: true });
  });

  it("keeps a successful removal successful when deleting the file throws", async () => {
    mocks.query.maybeSingle.mockResolvedValue({ data: { id: animal.id }, error: null });
    mocks.remove.mockRejectedValue(new Error("temporary storage failure"));
    await expect(removeAnimalPhoto(animal)).resolves.toEqual({ cleanupWarning: true, photoPath: null });
    expect(mocks.query.update).toHaveBeenCalledWith({ photo_path: null });
  });

  it("keeps the current photo when storage upload fails", async () => {
    mocks.upload.mockResolvedValue({ error: new Error("storage unavailable") });
    await expect(replaceAnimalPhoto(animal, validPhoto())).rejects.toThrow("storage unavailable");
    expect(mocks.query.update).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});
