export const GET_ME_QUERY = `query Me {
  me { name email }
}`;

export const GET_ITEM_QUERY = `query Item($id: String!, $lang: String!) {
  item(path: $id, language: $lang) {
    fields(ownFields: true) { name value }
  }
}`;

export type XmcClientOptions = {
  baseUrl: string;
  token: string;
  fetch?: typeof fetch;
};

export type XmcClient = {
  getCurrentUser: () =>
    Promise<{ name: string; email: string }>;
  getDatasourceFields: (
    itemId: string, language: string
  ) => Promise<Record<string, string>>;
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
    },
    async getDatasourceFields(itemId, language) {
      const data = await gql<{
        item: { fields: Array<{ name: string; value: string }> };
      }>(GET_ITEM_QUERY, { id: itemId, lang: language });
      return Object.fromEntries(
        data.item.fields.map((f) => [f.name, f.value])
      );
    }
  };
}
