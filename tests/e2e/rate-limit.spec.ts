import { test, expect } from "@playwright/test";

test("rate-limit banner + retry", async ({ page }) => {
  let calls = 0;
  await page.route("**/rest/api/3/issue", (route) => {
    calls += 1;
    if (calls === 1) {
      return route.fulfill({
        status: 429,
        headers: { "Retry-After": "3" },
        body: ""
      });
    }
    return route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ key: "MOCK-3", id: "3" })
    });
  });

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
  await page.getByRole("button",
    { name: /report bug/i }).click();
  await page.getByLabel("Summary").fill("Button colour wrong");
  await page.getByRole("button",
    { name: /submit/i }).click();
  await expect(page.getByText(/try again in/i))
    .toBeVisible();
  await page.getByRole("button",
    { name: /retry/i }).click();
  await expect(page.getByText("MOCK-3")).toBeVisible();
});
