import { describe, expect, it } from "vitest";
import { assertTransition, allowedNextStatuses, canCancel, type TxStatus } from "@/domain/transactions/state-machine";

describe("transaction state machine", () => {
  it("walks the full installment lifecycle", () => {
    const path: TxStatus[] = ["RESERVED", "DOCUMENTATION", "CONTRACT_SIGNED", "DOWNPAYMENT_IN_PROGRESS", "DOWNPAYMENT_COMPLETE", "FOR_LOAN_TAKEOUT", "FULLY_PAID", "TURNED_OVER", "TITLED"];
    for (let i = 1; i < path.length; i++) expect(() => assertTransition(path[i - 1], path[i])).not.toThrow();
  });

  it("allows spot cash to go from contract signed to fully paid", () => {
    expect(allowedNextStatuses("CONTRACT_SIGNED")).toContain("FULLY_PAID");
  });

  it("rejects skipping documentation or going backwards", () => {
    expect(() => assertTransition("RESERVED", "CONTRACT_SIGNED")).toThrow();
    expect(() => assertTransition("FULLY_PAID", "RESERVED")).toThrow();
    expect(() => assertTransition("DOWNPAYMENT_IN_PROGRESS", "FULLY_PAID")).toThrow();
  });

  it("allows cancellation/transfer from any non-terminal status only", () => {
    expect(canCancel("RESERVED")).toBe(true);
    expect(canCancel("BALANCE_IN_PROGRESS")).toBe(true);
    expect(() => assertTransition("DOWNPAYMENT_IN_PROGRESS", "CANCELLED")).not.toThrow();
    expect(() => assertTransition("TITLED", "CANCELLED")).toThrow();
    expect(() => assertTransition("CANCELLED", "RESERVED")).toThrow();
    expect(() => assertTransition("TRANSFERRED", "CANCELLED")).toThrow();
    expect(() => assertTransition("RESERVED", "TRANSFERRED")).not.toThrow();
  });

  it("terminal statuses have no forward moves", () => {
    expect(allowedNextStatuses("TITLED")).toEqual([]);
    expect(allowedNextStatuses("CANCELLED")).toEqual([]);
  });
});
