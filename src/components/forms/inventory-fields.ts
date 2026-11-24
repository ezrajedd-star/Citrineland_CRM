import type { FieldDef, FieldOption } from "@/components/app/entity-form";
import { E } from "@/lib/validation/schemas";
import { options } from "@/lib/labels";

export const developmentFields: FieldDef[] = [
  { name: "id", label: "", type: "hidden" },
  { name: "name", label: "Name", required: true, autoFocus: true },
  { name: "code", label: "Code", required: true, help: "Short code, e.g. CTR" },
  { name: "type", label: "Type", type: "select", options: options(E.DevelopmentType), required: true },
  { name: "status", label: "Status", type: "select", options: options(E.DevelopmentStatus), required: true, emptyOption: false },
  { name: "address", label: "Address", span: 2 },
  { name: "city", label: "City / Municipality" },
  { name: "province", label: "Province" },
  { name: "ltsNumber", label: "DHSUD License to Sell no." },
  { name: "targetTurnoverDate", label: "Target turnover", type: "date" },
  { name: "description", label: "Description", type: "textarea", span: 2 },
];

export const sectionFields = (parents: FieldOption[]): FieldDef[] => [
  { name: "id", label: "", type: "hidden" },
  { name: "developmentId", label: "", type: "hidden" },
  { name: "kind", label: "Kind", type: "select", options: options(E.SectionKind), required: true },
  { name: "name", label: "Name", required: true, placeholder: "Tower A / Phase 1 / Block 3" },
  { name: "code", label: "Code", required: true, placeholder: "TA / P1 / B3" },
  { name: "floors", label: "Floors (towers)", type: "number" },
  { name: "parentId", label: "Parent (e.g. phase of a block)", type: "select", options: parents },
  { name: "sortOrder", label: "Sort order", type: "number" },
];

export const unitFields = (sections: FieldOption[], isNew: boolean): FieldDef[] => [
  { name: "id", label: "", type: "hidden" },
  { name: "developmentId", label: "", type: "hidden" },
  { name: "code", label: "Unit code", required: true, placeholder: "TA-1205 / B3-L12" },
  { name: "sectionId", label: "Building / Block", type: "select", options: sections },
  { name: "unitType", label: "Unit type", type: "select", options: options(E.UnitType), required: true },
  { name: "model", label: "Model / layout", placeholder: "1BR Deluxe / Amber model" },
  { name: "floor", label: "Floor (condo)", type: "number" },
  { name: "block", label: "Block (subdivision)" },
  { name: "lot", label: "Lot (subdivision)" },
  { name: "floorArea", label: "Floor area (sqm)", type: "number" },
  { name: "lotArea", label: "Lot area (sqm)", type: "number" },
  { name: "bedrooms", label: "Bedrooms", type: "number" },
  { name: "bathrooms", label: "Bathrooms", type: "number" },
  { name: "orientation", label: "Orientation / view" },
  ...(isNew ? [{ name: "listPrice", label: "Initial list price", type: "money" as const, required: true, help: "Later changes go through price lists" }] : []),
  { name: "notes", label: "Notes", type: "textarea", span: 2 },
];

export const parkingFields = (sections: FieldOption[], isNew: boolean): FieldDef[] => [
  { name: "id", label: "", type: "hidden" },
  { name: "developmentId", label: "", type: "hidden" },
  { name: "code", label: "Slot code", required: true, placeholder: "P2-015" },
  { name: "sectionId", label: "Building", type: "select", options: sections },
  { name: "level", label: "Level", placeholder: "B1 / P2" },
  { name: "type", label: "Type", type: "select", options: options(E.ParkingType), required: true, emptyOption: false },
  ...(isNew ? [{ name: "listPrice", label: "Initial list price", type: "money" as const, required: true }] : []),
  { name: "notes", label: "Notes", type: "textarea", span: 2 },
];

export const paymentSchemeFields = (developments: FieldOption[]): FieldDef[] => [
  { name: "id", label: "", type: "hidden" },
  { name: "name", label: "Name", required: true, placeholder: "20% DP over 24 months, bank financing" },
  { name: "developmentId", label: "Development", type: "select", options: developments, emptyOption: "All developments" },
  { name: "kind", label: "Scheme type", type: "select", options: options(E.SchemeKind), required: true },
  { name: "reservationFee", label: "Reservation fee", type: "money", required: true },
  { name: "spotDiscountPct", label: "Spot cash discount", type: "percent", help: "Spot cash only" },
  { name: "deferredMonths", label: "Deferred cash months", type: "number", help: "Deferred cash only" },
  { name: "dpPct", label: "Down payment %", type: "percent", help: "DP + Balance only" },
  { name: "dpMonths", label: "DP months (0 = spot DP)", type: "number" },
  { name: "spotDpDiscountPct", label: "Spot DP discount", type: "percent", help: "Applied when DP is paid in one go" },
  { name: "financing", label: "Balance via", type: "select", options: options(E.FinancingType) },
  { name: "interestRatePct", label: "Interest rate (annual)", type: "percent", help: "In-house financing; blank = settings default" },
  { name: "termMonths", label: "Financing term (months)", type: "number" },
  { name: "sortOrder", label: "Sort order", type: "number" },
  { name: "active", label: "Active", type: "checkbox" },
  { name: "description", label: "Description", type: "textarea", span: 2 },
];
