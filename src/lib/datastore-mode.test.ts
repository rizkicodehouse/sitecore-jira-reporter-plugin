import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getDatastoreMode, isSitecoreDatastore } from "./datastore-mode";

describe("datastore-mode", () => {
  const originalEnv = process.env.SITECORE_DATASTORE;

  beforeEach(() => {
    delete process.env.SITECORE_DATASTORE;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.SITECORE_DATASTORE;
    } else {
      process.env.SITECORE_DATASTORE = originalEnv;
    }
  });

  it("defaults to redis when flag is unset", () => {
    expect(getDatastoreMode()).toBe("redis");
    expect(isSitecoreDatastore()).toBe(false);
  });

  it("returns sitecore when flag is exactly 'true'", () => {
    process.env.SITECORE_DATASTORE = "true";
    expect(getDatastoreMode()).toBe("sitecore");
    expect(isSitecoreDatastore()).toBe(true);
  });

  it("treats any non-'true' value as redis", () => {
    process.env.SITECORE_DATASTORE = "1";
    expect(getDatastoreMode()).toBe("redis");
    process.env.SITECORE_DATASTORE = "yes";
    expect(getDatastoreMode()).toBe("redis");
    process.env.SITECORE_DATASTORE = "";
    expect(getDatastoreMode()).toBe("redis");
  });
});
