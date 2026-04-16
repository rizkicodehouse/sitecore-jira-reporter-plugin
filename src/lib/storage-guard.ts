// Central driver selection for persistent stores that
// use @upstash/redis. The package's Redis.fromEnv() reads
// UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (the
// HTTP REST API), NOT the TCP REDIS_URL that the Vercel
// Marketplace integration provisions by default. Missing
// REST env vars used to silently fall back to the in-
// memory driver — which loses data on every redeploy and
// is also inconsistent across serverless instances. This
// module fails closed in production so that misconfig
// surfaces as a 500 on the first request instead of silent
// data loss later.

export type Driver = "memory" | "upstash";

export type SelectDriverOptions = {
  // Identifies the caller in error/log messages (e.g.
  // "settings-store", "reports-store"). Shows up in Vercel
  // runtime logs and in the thrown Error.
  source: string;
  // Override for tests. Defaults to process.env.NODE_ENV.
  nodeEnv?: string;
};

const warned = new Set<string>();

export function selectDriver(
  { source, nodeEnv = process.env.NODE_ENV }:
    SelectDriverOptions
): Driver {
  const hasUpstash = Boolean(
    process.env.UPSTASH_REDIS_REST_URL
  );
  if (hasUpstash) return "upstash";
  if (nodeEnv === "production") {
    throw new Error(
      `[${source}] Refusing to start with the in-memory ` +
      `driver in production. Data would be lost on every ` +
      `redeploy and inconsistent between serverless ` +
      `instances. Set UPSTASH_REDIS_REST_URL and ` +
      `UPSTASH_REDIS_REST_TOKEN from the Upstash console. ` +
      `Note: REDIS_URL (TCP) is NOT used by @upstash/redis.`
    );
  }
  if (!warned.has(source)) {
    warned.add(source);
    // eslint-disable-next-line no-console
    console.warn(
      `[${source}] Using in-memory driver — data will ` +
      `NOT persist across redeploys or serverless ` +
      `instances. Set UPSTASH_REDIS_REST_URL and ` +
      `UPSTASH_REDIS_REST_TOKEN for durable storage.`
    );
  }
  return "memory";
}

export function resetStorageGuardForTests() {
  warned.clear();
}
