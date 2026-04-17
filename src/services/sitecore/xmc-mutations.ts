export const ITEM_BY_PATH_QUERY = `
  query ItemByPath($path: String!, $language: String) {
    item(where: { path: $path, language: $language }) {
      itemId
      name
      path
      fields(ownFields: false) {
        nodes { name value }
      }
    }
  }
`;

export const CREATE_ITEM_MUTATION = `
  mutation CreateItem($input: CreateItemInput!) {
    createItem(input: $input) {
      item {
        itemId
        path
        fields(ownFields: false) { nodes { name value } }
      }
    }
  }
`;

export const UPDATE_ITEM_MUTATION = `
  mutation UpdateItem($input: UpdateItemInput!) {
    updateItem(input: $input) {
      item {
        itemId
        path
        fields(ownFields: false) { nodes { name value } }
      }
    }
  }
`;

// XMC Authoring search is offset-based (pageIndex/pageSize)
// and filters via SearchStatementInput.criteria. Confirmed
// against the live schema via /debug-xmc-schema. We only
// filter by `_template` — the plugin's BugReport template
// id is unique across the instance, so rootItem isn't
// needed. `_path` in the index is an ancestor-id list, not
// a path string, so filtering it with "/sitecore/content"
// never matched anything and returned zero results even
// when bug-report items existed.
export const SEARCH_ITEMS_QUERY = `
  query SearchItems(
    $templateId: String!,
    $pageIndex: Int!,
    $pageSize: Int!
  ) {
    search(query: {
      filterStatement: {
        criteria: [
          { field: "_template", value: $templateId }
        ]
      }
      paging: { pageIndex: $pageIndex, pageSize: $pageSize }
    }) {
      totalCount
      results {
        itemId
        path
      }
    }
  }
`;

// Fetches the full field list for a given itemId.
// SearchResultItem doesn't expose fields in the index, so we
// rehydrate each result by its itemId via the normal item
// resolver.
export const ITEM_BY_ID_QUERY = `
  query ItemById($itemId: String!) {
    item(where: { itemId: $itemId }) {
      itemId
      path
      fields(ownFields: false) {
        nodes { name value }
      }
    }
  }
`;
