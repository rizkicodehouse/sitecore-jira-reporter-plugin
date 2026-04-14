import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { File as NodeFile, Blob as NodeBlob } from "node:buffer";

// jsdom's Blob/File do not implement arrayBuffer(); fall back to Node's
// native implementations which are spec-compliant.
globalThis.File = NodeFile as unknown as typeof File;
globalThis.Blob = NodeBlob as unknown as typeof Blob;

afterEach(() => { cleanup(); });
