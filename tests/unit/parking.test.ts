import { describe, expect, it } from "vitest";
import { checkParkingEligibility } from "@/domain/parking";

const slot = { developmentId: "D1", sectionId: "TA" };

describe("parking eligibility", () => {
  it("anyone can buy when the rule is off", () => {
    expect(checkParkingEligibility({ requiresUnitOwnership: false, slot, ownedUnits: [], bundledUnits: [] }).eligible).toBe(true);
  });
  it("rejects clients without a unit in the same building", () => {
    expect(checkParkingEligibility({ requiresUnitOwnership: true, slot, ownedUnits: [], bundledUnits: [] }).eligible).toBe(false);
    expect(checkParkingEligibility({ requiresUnitOwnership: true, slot, ownedUnits: [{ developmentId: "D1", sectionId: "TB" }], bundledUnits: [] }).eligible).toBe(false);
    expect(checkParkingEligibility({ requiresUnitOwnership: true, slot, ownedUnits: [{ developmentId: "D2", sectionId: "TA" }], bundledUnits: [] }).eligible).toBe(false);
  });
  it("accepts owners in the same building", () => {
    expect(checkParkingEligibility({ requiresUnitOwnership: true, slot, ownedUnits: [{ developmentId: "D1", sectionId: "TA" }], bundledUnits: [] }).eligible).toBe(true);
  });
  it("accepts a unit bundled in the same reservation", () => {
    expect(checkParkingEligibility({ requiresUnitOwnership: true, slot, ownedUnits: [], bundledUnits: [{ developmentId: "D1", sectionId: "TA" }] }).eligible).toBe(true);
  });
  it("falls back to same development when building is unknown", () => {
    expect(checkParkingEligibility({ requiresUnitOwnership: true, slot: { developmentId: "D1", sectionId: null }, ownedUnits: [{ developmentId: "D1", sectionId: "TB" }], bundledUnits: [] }).eligible).toBe(true);
  });
});
