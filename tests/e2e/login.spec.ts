import { expect, test } from "@playwright/test";

test("private login form renders without public onboarding", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByRole("heading", { name: "CreatorOS Personal" })).toBeVisible();
  await expect(page.getByText("Private workspace.")).toBeVisible();
  await expect(page.getByLabel("Email")).toBeEnabled();
  await expect(page.getByLabel("Password")).toBeEnabled();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled();
  await expect(page.getByText("Signup")).toHaveCount(0);
});
