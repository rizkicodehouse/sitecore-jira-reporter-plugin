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

// Filter by `_templatename` instead of `_template`:
// resolving a template itemId via the Authoring
// `item(where: {path})` query is unreliable for
// template-folder items without language versions,
// and the template name is an internal plugin constant.
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

