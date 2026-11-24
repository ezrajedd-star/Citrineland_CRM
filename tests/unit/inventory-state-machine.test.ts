import { describe, expect, it } from "vitest";
import { nextInventoryStatus, canApply, allowedEvents, type InventoryStatus, type InventoryEvent } from "@/domain/inventory/state-machine";
import { InvalidTransitionError } from "@/domain/errors";

describe("inventory state machine", () => {
  it("follows the happy path AVAILABLE → ON_HOLD → RESERVED → SOLD", () => {
    let s: InventoryStatus = "AVAILABLE";
    s = nextInventoryStatus(s, "HOLD");
    expect(s).toBe("ON_HOLD");
    s = nextInventoryStatus(s, "RESERVE");
    expect(s).toBe("RESERVED");
    s = nextInventoryStatus(s, "MARK_SOLD");
    expect(s).toBe("SOLD");
  });

  it("allows direct reservation from AVAILABLE", () => {
    expect(nextInventoryStatus("AVAILABLE", "RESERVE")).toBe("RESERVED");
  });

  it.each<[InventoryStatus, InventoryEvent]>([
    ["ON_HOLD", "RELEASE_HOLD"],
    ["ON_HOLD", "EXPIRE_HOLD"],
    ["RESERVED", "CANCEL"],
    ["SOLD", "CANCEL"],
    ["RESERVED", "TRANSFER_OUT"],
    ["BLOCKED", "UNBLOCK"],
  ])("returns to AVAILABLE from %s via %s", (from, ev) => {
    expect(nextInventoryStatus(from, ev)).toBe("AVAILABLE");
  });

  it.each<[InventoryStatus, InventoryEvent]>([
    ["ON_HOLD", "HOLD"],
    ["RESERVED", "HOLD"],
    ["RESERVED", "RESERVE"],
    ["SOLD", "RESERVE"],
    ["BLOCKED", "HOLD"],
    ["BLOCKED", "RESERVE"],
    ["AVAILABLE", "MARK_SOLD"],
    ["AVAILABLE", "CANCEL"],
    ["ON_HOLD", "BLOCK"],
    ["SOLD", "BLOCK"],
    ["AVAILABLE", "EXPIRE_HOLD"],
  ])("rejects %s + %s", (from, ev) => {
    expect(() => nextInventoryStatus(from, ev)).toThrow(InvalidTransitionError);
    expect(canApply(from, ev)).toBe(false);
  });

  it("a reserved unit can never be reserved twice", () => {
    const afterFirst = nextInventoryStatus("AVAILABLE", "RESERVE");
    expect(() => nextInventoryStatus(afterFirst, "RESERVE")).toThrow();
  });

  it("lists allowed events", () => {
    expect(allowedEvents("AVAILABLE").sort()).toEqual(["BLOCK", "HOLD", "RESERVE"]);
    expect(allowedEvents("BLOCKED")).toEqual(["UNBLOCK"]);
  });
});
