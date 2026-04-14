import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { File as NodeFile, Blob as NodeBlob } from "node:buffer";

// jsdom's Blob/File do not implement arrayBuffer(); fall back to Node's
// native implementations which are spec-compliant.
globalThis.File = NodeFile as unknown as typeof File;
globalThis.Blob = NodeBlob as unknown as typeof Blob;

// jsdom's FormData only accepts jsdom-internal Blob instances, which
// breaks interop with the Node Blob used above. Replace it with a small
// spec-shaped shim that accepts any Blob-like value for tests.
type FormEntry = { value: string | Blob; filename?: string };
class TestFormData {
  private readonly entries = new Map<string, FormEntry[]>();
  append(name: string, value: string | Blob, filename?: string): void {
    const list = this.entries.get(name) ?? [];
    list.push({ value, filename });
    this.entries.set(name, list);
  }
  get(name: string): string | Blob | null {
    return this.entries.get(name)?.[0]?.value ?? null;
  }
  getAll(name: string): (string | Blob)[] {
    return (this.entries.get(name) ?? []).map((e) => e.value);
  }
  has(name: string): boolean { return this.entries.has(name); }
  delete(name: string): void { this.entries.delete(name); }
  set(name: string, value: string | Blob, filename?: string): void {
    this.entries.set(name, [{ value, filename }]);
  }
}
// Only replace FormData when running in a browser-like environment
// (jsdom) where the native FormData rejects Node's Blob. In the Node
// environment, keep the native (undici) FormData so that
// `new Request(..., { body: fd })` can serialize multipart bodies and
// `req.formData()` can round-trip the result.
const isJsdom =
  typeof window !== "undefined" &&
  typeof (window as unknown as { document?: unknown }).document !==
    "undefined";
if (isJsdom) {
  globalThis.FormData = TestFormData as unknown as typeof FormData;
}

afterEach(() => { cleanup(); });
