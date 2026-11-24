import { describe, expect, it } from "vitest";
import { getAccountingProvider } from "@/server/accounting/provider";

describe("accounting provider seam", () => {
  it("defaults to a no-op provider that never fails", async () => {
    const p = getAccountingProvider();
    expect(p.connected).toBe(false);
    expect(await p.fetchPayments(new Date())).toEqual([]);
    expect(await p.upsertCustomer({ crmId: "c", name: "x" }, "k")).toBeNull();
  });
});
