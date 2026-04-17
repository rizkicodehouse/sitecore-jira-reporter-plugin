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
// against the live schema via /debug-xmc-schema. _path and
// _templates are the conventional index fields:
//   _path       = contains ancestor ids (use Contains or Eq)
//   _templates  = contains inherited template ids
//   _template   = this item's direct template id
// We filter by `_template` because our plugin creates
// BugReport items with an exact template id.
export const SEARCH_ITEMS_QUERY = `
  query SearchItems(
    $rootItem: String!,
    $templateId: String!,
    $pageIndex: Int!,
    $pageSize: Int!
  ) {
    search(query: {
      filterStatement: {
        criteria: [
          { field: "_path", value: $rootItem }
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
