import { test, expect } from "@playwright/test";

test("share link page loads and shows the branded shell", async ({ page }) => {
  const res = await page.goto("/share/location/abc-demo-token");
  expect(res!.status()).toBe(200);

  await expect(page.locator("main")).toBeVisible();
  // The owner fallback is always the brand name, independent of locale or
  // whether the Supabase backend is reachable.
  await expect(page.locator("main")).toContainText("LifeOS");
});

test("live-location page is protected and redirects to login", async ({ page }) => {
  await page.goto("/app/location");
  await page.waitForURL(/\/login/);
  expect(new URL(page.url()).pathname).toBe("/login");
});