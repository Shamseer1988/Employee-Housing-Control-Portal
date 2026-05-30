import { expect, test } from "@playwright/test";

const ADMIN_USER = process.env.E2E_USER || "admin";
const ADMIN_PASS = process.env.E2E_PASS || "ChangeMe123!";

test.describe("auth flow", () => {
  test("login → dashboard → logout", async ({ page }) => {
    // Unauthenticated visit lands on /login (AuthGuard redirect).
    await page.goto("/dashboard");
    await page.waitForURL(/\/login/, { timeout: 10_000 });

    await page.getByLabel(/username or email/i).fill(ADMIN_USER);
    await page.getByLabel(/^password$/i).fill(ADMIN_PASS);
    await page.getByRole("button", { name: /sign in/i }).click();

    // Land on the dashboard. The H1 reads from a header tile.
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Logout via the user menu (logout button text varies, fall back to
    // a direct API call as a backstop).
    const logoutButton = page.getByRole("button", { name: /log\s*out|sign\s*out/i });
    if (await logoutButton.count() > 0) {
      await logoutButton.first().click();
    } else {
      await page.evaluate(async () => {
        const csrf = document.cookie.split("; ")
          .find((c) => c.startsWith("csrf_access_token="))
          ?.split("=")[1] ?? "";
        await fetch("/api/v1/auth/logout", {
          method: "POST",
          credentials: "include",
          headers: { "X-CSRF-TOKEN": decodeURIComponent(csrf) },
        });
      });
      await page.goto("/dashboard");
    }
    await page.waitForURL(/\/login/, { timeout: 10_000 });
  });

  test("a failed login surfaces an error and stays on /login", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/username or email/i).fill("admin");
    await page.getByLabel(/^password$/i).fill("definitely-not-the-password");
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(page.locator("text=/invalid credentials/i")).toBeVisible({ timeout: 5_000 });
    // Still on /login.
    expect(page.url()).toMatch(/\/login/);
  });
});
