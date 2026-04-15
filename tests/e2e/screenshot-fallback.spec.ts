import { test, expect } from "@playwright/test";
import path from "node:path";

test("upload fallback when capture declined", async (
  { page, context }
) => {
  await context.clearPermissions();
  await page.route("**/rest/api/3/issue",
    (r) => r.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ key: "MOCK-2", id: "2" })
    }));
  await page.route("**/rest/api/3/issue/*/attachments",
    (r) => r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ id: "att-9" }])
    }));

  await page.goto("/extensions/pages-panel");
  await page.evaluate(() => {
    window.postMessage({
      topic: "pages.layout",
      payload: {
        type: "page-layout",
        renderingInstanceId: "abc"
      }
    }, "*");
  });
  await page.getByRole("button",
    { name: /report bug/i }).click();
  await page.getByRole("button",
    { name: /capture screen/i }).click();
  await page.setInputFiles(
    'input[type="file"]',
    path.resolve(__dirname, "fixtures/mock.png")
  );
  await page.getByLabel("Summary").fill("Alt text missing");
  await page.getByRole("button",
    { name: /submit/i }).click();
  await expect(page.getByText("MOCK-2")).toBeVisible();
});
