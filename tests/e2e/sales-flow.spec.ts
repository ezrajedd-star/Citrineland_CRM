import { test, expect } from "@playwright/test";
import { signIn, db, availableUnit, toast, uniq } from "./helpers";

test("lead → computation → hold → reservation → payments → commission tranche due", async ({ page }) => {
  await signIn(page, "sales");
  const broker = await db.broker.findFirstOrThrow({ where: { accreditationStatus: "ACCREDITED", deletedAt: null } });
  const tag = uniq();

  // 1) Lead with a broker of record
  await page.goto("/pipeline");
  await page.getByRole("button", { name: "New lead" }).click();
  await page.fill("#f-lead-firstName", "Eetwo");
  await page.fill("#f-lead-lastName", `Flow${tag}`);
  await page.fill("#f-lead-mobile", `0917${String(Math.floor(1_000_000 + Math.random() * 8_999_999))}`);
  await page.fill("#f-lead-email", `e2e.${tag}@example.test`);
  await page.selectOption("#f-lead-brokerId", broker.id);
  await page.getByRole("button", { name: "Save" }).click();
  if (await page.getByText("Possible duplicate").isVisible().catch(() => false)) await page.getByRole("button", { name: "Save" }).click();
  await page.waitForURL("**/pipeline/leads/*");
  const leadId = page.url().split("/").pop()!.split("?")[0];

  // 2) Sample computation
  const unit = await availableUnit("CTR");
  const scheme = await db.paymentScheme.findFirstOrThrow({ where: { name: { startsWith: "10% spot DP" } } });
  await page.goto(`/computations/new?leadId=${leadId}&unitId=${unit.id}&paymentSchemeId=${scheme.id}`);
  await expect(page.getByText("Total Contract Price (TCP)")).toBeVisible();
  await page.getByRole("button", { name: "Save computation" }).click();
  await page.waitForURL("**/computations/*");
  await expect(page.getByRole("link", { name: "PDF" })).toBeVisible();

  // 3) Hold the unit for the lead
  await page.goto(`/inventory/units/${unit.id}`);
  await page.getByRole("button", { name: "Place hold" }).click();
  await page.locator("form select[name=leadId]").selectOption(leadId);
  await page.locator("form").getByRole("button", { name: "Place hold" }).click();
  expect(await toast(page)).toContain("Hold placed");
  await expect.poll(async () => (await db.unit.findUniqueOrThrow({ where: { id: unit.id } })).status).toBe("ON_HOLD");
  const hold = await db.hold.findFirstOrThrow({ where: { unitId: unit.id, status: "ACTIVE" } });

  // 4) Reserve from the hold
  await page.goto(`/transactions/new?leadId=${leadId}&unitId=${unit.id}&holdId=${hold.id}&paymentSchemeId=${scheme.id}`);
  await expect(page.getByText("Total Contract Price (TCP)")).toBeVisible();
  await page.getByRole("button", { name: "Reserve now" }).click();
  await page.waitForURL(/\/transactions\/c/);
  await expect(page.getByText("Reserved", { exact: true }).first()).toBeVisible();
  const txId = page.url().split("/").pop()!.split("?")[0];
  expect((await db.unit.findUniqueOrThrow({ where: { id: unit.id } })).status).toBe("RESERVED");
  expect((await db.hold.findUniqueOrThrow({ where: { id: hold.id } })).status).toBe("CONVERTED");

  // 5) Record a payment that completes the spot down payment
  const t = await db.transaction.findUniqueOrThrow({ where: { id: txId } });
  const dpLine = await db.scheduleItem.findFirstOrThrow({ where: { transactionId: txId, kind: "DOWNPAYMENT" } });
  await page.goto(`/transactions/${txId}?tab=payments`);
  await page.getByRole("button", { name: "Record payment" }).click();
  await page.fill("#f-payment-amount", (Number(dpLine.amountCents) / 100).toFixed(2));
  await page.fill("#f-payment-orNumber", `OR-E2E-${uniq()}`);
  await page.getByRole("button", { name: "Save" }).click();
  expect(await toast(page)).toMatch(/Payment recorded/);

  // 6) Commission: DP-complete tranche is now DUE
  await page.goto(`/transactions/${txId}?tab=commission`);
  await expect(page.getByText("Due", { exact: true }).first()).toBeVisible();
  const due = await db.commissionTranche.count({ where: { ledger: { transactionId: txId }, status: "DUE" } });
  expect(due).toBeGreaterThan(0);
  expect(t.brokerId).toBe(broker.id);
});
