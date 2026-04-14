import { describe, it, expect } from "vitest";
import { readFileToBlob, MAX_ATTACHMENT_BYTES }
  from "./upload";

const makeFile = (bytes: number, type: string) =>
  new File([new Uint8Array(bytes)], "x", { type });

describe("readFileToBlob", () => {
  it("accepts a valid png under size", async () => {
    const f = makeFile(1024, "image/png");
    const out = await readFileToBlob(f);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.blob.type).toBe("image/png");
  });

  it.each(["image/png", "image/jpeg", "image/webp"])(
    "accepts %s", async (mime) => {
    const out = await readFileToBlob(makeFile(10, mime));
    expect(out.ok).toBe(true);
  });

  it("rejects unsupported mime", async () => {
    const out = await readFileToBlob(
      makeFile(10, "application/pdf")
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("unsupported-mime");
  });

  it("rejects oversize files", async () => {
    const out = await readFileToBlob(
      makeFile(MAX_ATTACHMENT_BYTES + 1, "image/png")
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("too-large");
  });
});
