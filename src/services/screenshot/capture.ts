export type CaptureResult =
  | { ok: true; blob: Blob }
  | { ok: false; reason: "cancelled" | "unsupported" | "error" };

export async function captureVisibleTab(): Promise<CaptureResult> {
  const md = typeof navigator !== "undefined"
    ? navigator.mediaDevices : undefined;
  if (!md || !md.getDisplayMedia) {
    return { ok: false, reason: "unsupported" };
  }
  let stream: MediaStream;
  try {
    stream = await md.getDisplayMedia({
      video: { frameRate: 1 } as MediaTrackConstraints,
      audio: false
    });
  } catch (err) {
    const isDenied = err instanceof DOMException &&
      err.name === "NotAllowedError";
    return {
      ok: false,
      reason: isDenied ? "cancelled" : "error"
    };
  }
  try {
    const [track] = stream.getVideoTracks();
    if (!track) return { ok: false, reason: "error" };
    const ImageCaptureCtor = (globalThis as unknown as {
      ImageCapture?: new (t: MediaStreamTrack) => {
        grabFrame: () => Promise<ImageBitmap>;
      };
    }).ImageCapture;
    if (!ImageCaptureCtor) {
      return { ok: false, reason: "unsupported" };
    }
    const capture = new ImageCaptureCtor(track);
    const bitmap = await capture.grabFrame();
    const canvas = new OffscreenCanvas(
      bitmap.width, bitmap.height
    );
    const ctx = canvas.getContext("2d") as
      OffscreenCanvasRenderingContext2D | null;
    if (!ctx) return { ok: false, reason: "error" };
    ctx.drawImage(bitmap as unknown as CanvasImageSource, 0, 0);
    const blob = await canvas.convertToBlob({
      type: "image/png"
    });
    return { ok: true, blob };
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}
