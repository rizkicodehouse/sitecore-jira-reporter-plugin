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

export const SEARCH_ITEMS_QUERY = `
  query SearchItems(
    $rootItem: String!,
    $templates: String!,
    $first: Int!,
    $after: String
  ) {
    search(
      where: {
        AND: [
          { name: "_path", value: $rootItem, operator: CONTAINS },
          { name: "_templates", value: $templates, operator: CONTAINS }
        ]
      }
      orderBy: { name: "__created", direction: DESC }
      first: $first
      after: $after
    ) {
      totalCount
      pageInfo { endCursor hasNext }
      results {
        innerItem {
          itemId
          path
          fields(ownFields: false) { nodes { name value } }
        }
      }
    }
  }
`;
