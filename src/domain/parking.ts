/**
 * Parking eligibility rule (Settings → parkingRequiresUnitOwnership, default true):
 * a slot can only be reserved by a client with an active (reserved or sold, not cancelled) unit transaction
 * in the same building — or when the unit is bundled in the same reservation.
 */
export interface Location {
  developmentId: string;
  sectionId: string | null;
}

export interface ParkingEligibilityInput {
  requiresUnitOwnership: boolean;
  slot: Location;
  /** Units the client holds in active transactions */
  ownedUnits: Location[];
  /** Units bundled in the same reservation */
  bundledUnits: Location[];
}

export function sameBuilding(a: Location, b: Location): boolean {
  if (a.developmentId !== b.developmentId) return false;
  // If either side has no building assigned, fall back to same development
  if (!a.sectionId || !b.sectionId) return true;
  return a.sectionId === b.sectionId;
}

export function checkParkingEligibility(input: ParkingEligibilityInput): { eligible: boolean; reason: string } {
  if (!input.requiresUnitOwnership) return { eligible: true, reason: "Parking may be sold to anyone (ownership rule is off)." };
  if (input.bundledUnits.some((u) => sameBuilding(u, input.slot))) return { eligible: true, reason: "Bundled with a unit in the same building." };
  if (input.ownedUnits.some((u) => sameBuilding(u, input.slot))) return { eligible: true, reason: "Client owns a unit in the same building." };
  return { eligible: false, reason: "Parking slots can only be reserved by clients with an active unit purchase in the same building." };
}
