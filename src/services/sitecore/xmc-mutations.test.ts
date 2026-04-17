import { describe, it, expect } from "vitest";
import {
  ITEM_BY_PATH_QUERY,
  CREATE_ITEM_MUTATION,
  UPDATE_ITEM_MUTATION,
  SEARCH_ITEMS_QUERY
} from "./xmc-mutations";

describe("xmc-mutations", () => {
  it("ITEM_BY_PATH_QUERY selects id/path/fields", () => {
    expect(ITEM_BY_PATH_QUERY).toContain("query ItemByPath");
    expect(ITEM_BY_PATH_QUERY).toContain("$path: String!");
    expect(ITEM_BY_PATH_QUERY).toContain("itemId");
    expect(ITEM_BY_PATH_QUERY).toContain("fields");
  });

  it("CREATE_ITEM_MUTATION takes name/parent/templateId/fields", () => {
    expect(CREATE_ITEM_MUTATION).toContain("mutation CreateItem");
    expect(CREATE_ITEM_MUTATION).toContain("$input: CreateItemInput!");
    expect(CREATE_ITEM_MUTATION).toContain("createItem");
  });

  it("UPDATE_ITEM_MUTATION takes itemId/fields", () => {
    expect(UPDATE_ITEM_MUTATION).toContain("mutation UpdateItem");
    expect(UPDATE_ITEM_MUTATION).toContain("$input: UpdateItemInput!");
  });

  it("SEARCH_ITEMS_QUERY uses the Authoring search schema", () => {
    expect(SEARCH_ITEMS_QUERY).toContain("query SearchItems");
    expect(SEARCH_ITEMS_QUERY).toContain("$rootItem: String!");
    expect(SEARCH_ITEMS_QUERY).toContain("$templateId: String!");
    expect(SEARCH_ITEMS_QUERY).toContain("$pageIndex: Int!");
    expect(SEARCH_ITEMS_QUERY).toContain("$pageSize: Int!");
    expect(SEARCH_ITEMS_QUERY).toContain("filterStatement");
    expect(SEARCH_ITEMS_QUERY).toContain("criteria:");
    expect(SEARCH_ITEMS_QUERY).toContain("paging:");
  });
});
