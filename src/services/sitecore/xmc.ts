export const GET_ME_QUERY = `query Me {
  me { name email }
}`;

export type XmcClientOptions = {
  baseUrl: string;
  token: string;
  fetch?: typeof fetch;
};

export type XmcClient = {
  getCurrentUser: () =>
    Promise<{ name: string; email: string }>;
};

export function createXmcClient(
  opts: XmcClientOptions
): XmcClient {
  const f = opts.fetch ?? fetch;
  const endpoint = `${opts.baseUrl.replace(/\/$/, "")}` +
    `/sitecore/api/authoring/graphql/v1`;

  async function gql<T>(
    query: string, variables?: Record<string, unknown>
  ): Promise<T> {
    const res = await f(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.token}`
      },
      body: JSON.stringify({ query, variables })
    });
    if (!res.ok) {
      throw new Error(`XMC HTTP ${res.status}`);
    }
    const body = (await res.json()) as {
      data?: T; errors?: unknown[];
    };
    if (body.errors && body.errors.length > 0) {
      throw new Error(`XMC GraphQL errors`);
    }
    if (!body.data) throw new Error("XMC empty data");
    return body.data;
  }

  return {
    async getCurrentUser() {
      const data = await gql<{
        me: { name: string; email: string };
      }>(GET_ME_QUERY);
      return data.me;
    }
  };
}
