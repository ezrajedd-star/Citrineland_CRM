import { expect, type Page, type Browser } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

export const db = new PrismaClient();
export const PASSWORD = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "ChangeMe!2026";
export const USERS = {
  admin: process.env.BOOTSTRAP_ADMIN_EMAIL ?? "admin@citrineland.test",
  sales: "sales.manager@citrineland.test",
  marketing: "marketing.manager@citrineland.test",
  bng: "bng.staff@citrineland.test",
} as const;

export async function signIn(page: Page, who: keyof typeof USERS) {
  await page.goto("/login");
  await page.fill("#email", USERS[who]);
  await page.fill("#password", PASSWORD);
  await page.click("text=Sign in with password");
  await page.waitForURL("**/dashboard");
}

export async function newSignedInPage(browser: Browser, who: keyof typeof USERS) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await signIn(page, who);
  return page;
}

export async function availableUnit(devCode = "CTR") {
  return db.unit.findFirstOrThrow({ where: { status: "AVAILABLE", deletedAt: null, development: { code: devCode } }, orderBy: { code: "asc" } });
}

export async function openLead() {
  return db.lead.findFirstOrThrow({ where: { deletedAt: null, clientId: null, stage: { isWon: false, isLost: false } }, orderBy: { createdAt: "desc" } });
}

export async function toast(page: Page) {
  const t = page.locator("[data-sonner-toast]").first();
  await expect(t).toBeVisible();
  return (await t.textContent()) ?? "";
}

export function uniq() {
  return Math.random().toString(36).slice(2, 7);
}
