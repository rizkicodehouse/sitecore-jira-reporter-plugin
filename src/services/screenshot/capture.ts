export type CaptureResult =
  | { ok: true; blob: Blob }
  | { ok: false; reason: "cancelled" | "unsupported" | "error" };

// True when the browser exposes getDisplayMedia AND the
// surrounding Permissions Policy allows display-capture
// for this document. In a Sitecore plugin iframe the
// Permissions Policy usually denies it, so we hide the
// capture button rather than letting the user click and
// get a cryptic violation.
export function canCaptureScreen(): boolean {
  if (typeof navigator === "undefined") return false;
  if (!navigator.mediaDevices?.getDisplayMedia) return false;
  if (typeof document === "undefined") return true;
  const doc = document as unknown as {
    permissionsPolicy?: {
      allowsFeature: (name: string) => boolean;
    };
    featurePolicy?: {
      allowsFeature: (name: string) => boolean;
    };
  };
  const pp = doc.permissionsPolicy ?? doc.featurePolicy;
  if (!pp?.allowsFeature) return true; // older browsers
  return pp.allowsFeature("display-capture");
}

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
