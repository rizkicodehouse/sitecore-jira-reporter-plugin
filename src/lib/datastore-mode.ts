export type DatastoreMode = "redis" | "sitecore";

export function getDatastoreMode(): DatastoreMode {
  return process.env.SITECORE_DATASTORE === "true"
    ? "sitecore"
    : "redis";
}

export function isSitecoreDatastore(): boolean {
  return getDatastoreMode() === "sitecore";
}
