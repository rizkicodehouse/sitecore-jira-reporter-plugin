import { test, expect } from "@playwright/test";
import { handlers } from "./msw.init";

test("happy path — submit with capture", async ({ page }) => {
  await page.route(
    "**/rest/api/3/issue", async (route) => {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ key: "MOCK-1", id: "1" })
      });
    }
  );
  await page.route(
    "**/rest/api/3/issue/*/attachments",
    (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ id: "att-1" }])
    })
  );

  await page.goto("/pages-panel");
  await page.evaluate(() => {
    window.postMessage({
      topic: "pages.layout",
      payload: {
        type: "page-layout",
        renderingInstanceId: "abc"
      }
    }, "*");
  });

  await expect(page.getByRole("button",
    { name: /report bug/i })).toBeEnabled();
  await page.getByRole("button",
    { name: /report bug/i }).click();
  await page.getByLabel("Summary").fill("Hero alignment off");
  await page.getByLabel("Description")
    .fill("Hero banner shifts 2px right on Safari");
  await page.getByRole("button",
    { name: /submit/i }).click();
  await expect(page.getByText("MOCK-1")).toBeVisible();
});
