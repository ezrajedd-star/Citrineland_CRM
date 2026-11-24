import { test, expect } from "@playwright/test";
import { signIn, USERS, PASSWORD } from "./helpers";

const FORBIDDEN = "You don't have access";

test("rejects a wrong password", async ({ page }) => {
  await page.goto("/login");
  await page.fill("#email", USERS.admin);
  await page.fill("#password", "wrong-password");
  await page.click("text=Sign in with password");
  await expect(page.getByText(/Invalid email or password/)).toBeVisible();
  void PASSWORD;
});

test("unauthenticated users are redirected to sign in", async ({ page }) => {
  await page.goto("/transactions");
  await expect(page).toHaveURL(/\/login/);
});

test("Admin can reach every admin page", async ({ page }) => {
  await signIn(page, "admin");
  for (const p of ["/admin/users", "/admin/roles", "/admin/settings", "/admin/audit", "/admin/automations", "/commissions"]) {
    await page.goto(p);
    await expect(page.getByText(FORBIDDEN)).toHaveCount(0);
  }
});

test("Sales Manager: sales areas yes, admin no", async ({ page }) => {
  await signIn(page, "sales");
  for (const p of ["/pipeline", "/transactions", "/commissions", "/reports"]) {
    await page.goto(p);
    await expect(page.getByText(FORBIDDEN)).toHaveCount(0);
  }
  for (const p of ["/admin/users", "/admin/roles", "/admin/audit"]) {
    await page.goto(p);
    await expect(page.getByText(FORBIDDEN)).toBeVisible();
  }
});

test("Marketing Manager: marketing yes, commissions and users no", async ({ page }) => {
  await signIn(page, "marketing");
  await page.goto("/marketing");
  await expect(page.getByText(FORBIDDEN)).toHaveCount(0);
  for (const p of ["/commissions", "/admin/users", "/transactions/new"]) {
    await page.goto(p);
    await expect(page.getByText(FORBIDDEN)).toBeVisible();
  }
  // Read-only on transactions: no cancel button
  await page.goto("/transactions");
  await page.locator("main table a").first().click();
  await expect(page.getByRole("button", { name: "Cancel" })).toHaveCount(0);
});

test("BNG Staff: brokers yes, cancel/price/approve no", async ({ page }) => {
  await signIn(page, "bng");
  await page.goto("/brokers");
  await expect(page.getByRole("button", { name: "New broker", exact: true })).toBeVisible();
  for (const p of ["/admin/users", "/admin/commission-rules", "/admin/roles"]) {
    await page.goto(p);
    await expect(page.getByText(FORBIDDEN)).toBeVisible();
  }
  await page.goto("/transactions?status=ACTIVE");
  await page.locator("main table a").first().click();
  await expect(page.getByRole("button", { name: "Cancel" })).toHaveCount(0);
  await page.goto("/commissions?tab=DUE");
  await expect(page.getByRole("button", { name: /^Approve/ })).toHaveCount(0);
});
