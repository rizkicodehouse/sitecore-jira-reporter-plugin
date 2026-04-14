// src/services/screenshot/capture.test.ts
import {
  describe, it, expect, beforeEach, vi
} from "vitest";
import { captureVisibleTab } from "./capture";

describe("captureVisibleTab", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a blob when the user accepts the prompt",
     async () => {
    const stop = vi.fn();
    const track = { stop, readyState: "live" };
    const stream = {
      getTracks: () => [track],
      getVideoTracks: () => [track]
    } as unknown as MediaStream;

    vi.stubGlobal("navigator", {
      mediaDevices: {
        getDisplayMedia: vi.fn().mockResolvedValue(stream)
      }
    });
    vi.stubGlobal("ImageCapture", class {
      constructor(_: unknown) {}
      grabFrame() {
        return Promise.resolve({ width: 10, height: 10 });
      }
    });
    vi.stubGlobal("OffscreenCanvas", class {
      constructor(_w: number, _h: number) {}
      getContext() {
        return {
          drawImage: vi.fn()
        };
      }
      convertToBlob() {
        return Promise.resolve(
          new Blob(["x"], { type: "image/png" })
        );
      }
    });

    const out = await captureVisibleTab();
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.blob.type).toBe("image/png");
    expect(stop).toHaveBeenCalled();
  });

  it("returns cancelled when the user declines",
     async () => {
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getDisplayMedia: vi.fn().mockRejectedValue(
          new DOMException("denied", "NotAllowedError")
        )
      }
    });
    const out = await captureVisibleTab();
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("cancelled");
  });
});
