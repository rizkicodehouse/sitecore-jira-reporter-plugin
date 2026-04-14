const ALLOWED = new Set([
  "image/png", "image/jpeg", "image/webp"
]);

export const MAX_ATTACHMENT_BYTES = (() => {
  const mb = Number(process.env.MAX_ATTACHMENT_MB ?? 25);
  return mb * 1024 * 1024;
})();

export type UploadResult =
  | { ok: true; blob: Blob }
  | { ok: false; reason:
      "unsupported-mime" | "too-large" | "empty" };

export async function readFileToBlob(
  file: File
): Promise<UploadResult> {
  if (file.size === 0) return { ok: false, reason: "empty" };
  if (!ALLOWED.has(file.type)) {
    return { ok: false, reason: "unsupported-mime" };
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { ok: false, reason: "too-large" };
  }
  const buf = await file.arrayBuffer();
  return { ok: true, blob: new Blob([buf], { type: file.type }) };
}
