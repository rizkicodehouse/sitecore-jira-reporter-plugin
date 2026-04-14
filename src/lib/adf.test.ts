// src/lib/adf.test.ts
import { describe, it, expect } from "vitest";
import { doc, h2, para, bullet, codeBlock, buildDescription }
  from "./adf";

describe("adf builders", () => {
  it("doc wraps content with version + type", () => {
    expect(doc([para("hi")])).toEqual({
      type: "doc", version: 1,
      content: [{
        type: "paragraph",
        content: [{ type: "text", text: "hi" }]
      }]
    });
  });

  it("h2 emits heading level 2", () => {
    expect(h2("Title")).toEqual({
      type: "heading", attrs: { level: 2 },
      content: [{ type: "text", text: "Title" }]
    });
  });

  it("bullet list emits bulletList with listItems", () => {
    expect(bullet(["a", "b"])).toEqual({
      type: "bulletList",
      content: [
        { type: "listItem", content: [
          { type: "paragraph",
            content: [{ type: "text", text: "a" }] }
        ]},
        { type: "listItem", content: [
          { type: "paragraph",
            content: [{ type: "text", text: "b" }] }
        ]}
      ]
    });
  });

  it("codeBlock preserves language + text", () => {
    expect(codeBlock("json", '{"a":1}')).toEqual({
      type: "codeBlock", attrs: { language: "json" },
      content: [{ type: "text", text: '{"a":1}' }]
    });
  });

  it("buildDescription assembles all sections", () => {
    const adf = buildDescription({
      description: "broken",
      reporter: { name: "Ada", email: "a@x.com" },
      page: { title: "Home", url: "/en",
              language: "en", site: "main" },
      rendering: { name: "Hero", template: "Banner",
                   instanceId: "abc" },
      datasource: { fields: { Title: "Welcome" } },
      browser: { userAgent: "UA", viewport: "1024x768",
                 timestamp: "2026-04-14T00:00:00Z" }
    });
    expect(adf.type).toBe("doc");
    expect(adf.version).toBe(1);
    const headings = adf.content
      .filter((n) => n.type === "heading")
      .map((n: any) => n.content[0].text);
    expect(headings).toEqual([
      "Description", "Reporter", "Page", "Rendering",
      "Datasource fields", "Browser"
    ]);
  });

  it("buildDescription truncates long field values", () => {
    const long = "x".repeat(1000);
    const adf = buildDescription({
      description: "",
      reporter: null, page: null, rendering: null,
      datasource: { fields: { Big: long } },
      browser: { userAgent: "", viewport: "",
                 timestamp: "" }
    });
    const serialised = JSON.stringify(adf);
    expect(serialised).toContain("x".repeat(500));
    expect(serialised).not.toContain("x".repeat(501));
  });
});
