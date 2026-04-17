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
// against the live schema via /debug-xmc-schema.
//
// We filter by `_templatename` rather than `_template`:
// live probes showed both fields work, but `_templatename`
// avoids having to resolve the template's itemId first
// (looking up a template by its /sitecore/templates/...
// path via the Authoring `item(where: {path})` query is
// unreliable for template-folder items that have no
// language versions). The template name is an internal
// plugin constant, so matching by name is fine.
//
// `_path` in the index is a list of ancestor GUIDs, not a
// path string, so filtering it with "/sitecore/content"
// never matched anything.
export const SEARCH_ITEMS_QUERY = `
  query SearchItems(
    $templateName: String!,
    $pageIndex: Int!,
    $pageSize: Int!
  ) {
    search(query: {
      filterStatement: {
        criteria: [
          { field: "_templatename", value: $templateName }
        ]
      }
      paging: { pageIndex: $pageIndex, pageSize: $pageSize }
    }) {
      totalCount
      results {
        itemId
        path
        innerItem {
          fields(ownFields: false) {
            nodes { name value }
          }
        }
      }
    }
  }
`;

