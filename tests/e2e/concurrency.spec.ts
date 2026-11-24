import { test, expect } from "@playwright/test";
import { newSignedInPage, db, availableUnit } from "./helpers";

test("two users reserving the same unit at the same time: exactly one succeeds; cancelling releases it", async ({ browser }) => {
  const unit = await availableUnit("CTR");
  const scheme = await db.paymentScheme.findFirstOrThrow({ where: { name: { startsWith: "20% DP over 36" } } });
  const leads = await db.lead.findMany({ where: { deletedAt: null, clientId: null, stage: { isWon: false, isLost: false } }, take: 2, orderBy: { createdAt: "asc" } });
  const [a, b] = await Promise.all([newSignedInPage(browser, "sales"), newSignedInPage(browser, "admin")]);
  await Promise.all([
    a.goto(`/transactions/new?leadId=${leads[0].id}&unitId=${unit.id}&paymentSchemeId=${scheme.id}`),
    b.goto(`/transactions/new?leadId=${leads[1].id}&unitId=${unit.id}&paymentSchemeId=${scheme.id}`),
  ]);
  for (const p of [a, b]) await expect(p.getByText("Total Contract Price (TCP)")).toBeVisible();
  await Promise.all([a.getByRole("button", { name: "Reserve now" }).click(), b.getByRole("button", { name: "Reserve now" }).click()]);
  await expect.poll(async () => db.transactionItem.count({ where: { unitId: unit.id, active: true } }), { timeout: 30_000 }).toBe(1);
  await Promise.all([a.waitForTimeout(3000), b.waitForTimeout(3000)]);
  const won = [a, b].filter((p) => /\/transactions\/c/.test(p.url()));
  const lost = [a, b].filter((p) => !/\/transactions\/c/.test(p.url()));
  expect(won).toHaveLength(1);
  expect(lost).toHaveLength(1);
  await expect(lost[0].locator("[data-sonner-toast]").first()).toContainText(/no longer available|on hold/i);

  // Cancellation releases inventory (Sales Manager has transactions:cancel)
  const winner = won[0];
  const txId = winner.url().split("/").pop()!.split("?")[0];
  const sales = winner === a ? a : await newSignedInPage(browser, "sales");
  await sales.goto(`/transactions/${txId}`);
  await sales.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(sales.getByRole("dialog").getByText(/Indicative Maceda/)).toBeVisible();
  await sales.fill("#f-cancel-reason", "E2E cancellation test");
  await sales.check("#f-cancel-confirm");
  await sales.getByRole("button", { name: "Cancel transaction" }).click();
  await expect.poll(async () => (await db.unit.findUniqueOrThrow({ where: { id: unit.id } })).status).toBe("AVAILABLE");
  await sales.goto(`/inventory/units/${unit.id}`);
  await expect(sales.getByText("Available").first()).toBeVisible();
});
