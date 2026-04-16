export type ScopedFetchArgs = {
  tenant: string;
  site: string;
  contextId: string;
  authToken: string;
  fetchImpl?: typeof fetch;
};

export function createScopedFetch(
  args: ScopedFetchArgs
): typeof fetch {
  const impl = args.fetchImpl ?? fetch;
  return (async (
    input: RequestInfo | URL,
    init?: RequestInit
  ) => {
    const headers = new Headers(init?.headers);
    headers.set("x-sc-tenant", args.tenant);
    headers.set("x-sc-site", args.site);
    headers.set("x-sc-context-id", args.contextId);
    headers.set("x-sc-auth-token", args.authToken);
    return impl(input, { ...init, headers });
  }) as typeof fetch;
}
