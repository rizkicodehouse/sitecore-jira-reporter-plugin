import { describe, it, expect } from "vitest";
import { parseSiteScopeFromPath } from "./site-scope";

describe("parseSiteScopeFromPath", () => {
  it("extracts tenant and site from a page path", () => {
    expect(parseSiteScopeFromPath(
      "/sitecore/content/Launcher/launchdx/home"
    )).toEqual({ tenant: "Launcher", site: "launchdx" });
  });

  it("works for a path that ends at the site root", () => {
    expect(parseSiteScopeFromPath(
      "/sitecore/content/Launcher/launchdx"
    )).toEqual({ tenant: "Launcher", site: "launchdx" });
  });

  it("is case-insensitive on the /sitecore/content/ prefix", () => {
    expect(parseSiteScopeFromPath(
      "/Sitecore/Content/Launcher/launchdx/home"
    )).toEqual({ tenant: "Launcher", site: "launchdx" });
  });

  it("returns null when path is missing or malformed", () => {
    expect(parseSiteScopeFromPath(undefined)).toBeNull();
    expect(parseSiteScopeFromPath("")).toBeNull();
    expect(parseSiteScopeFromPath("/sitecore/content/")).toBeNull();
    expect(parseSiteScopeFromPath("/sitecore/content/Launcher"))
      .toBeNull();
    expect(parseSiteScopeFromPath("/somewhere/else/Launcher/launchdx"))
      .toBeNull();
  });
});
