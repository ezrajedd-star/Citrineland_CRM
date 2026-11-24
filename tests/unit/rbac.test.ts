import { describe, expect, it } from "vitest";
import { can, assertCan, canAny, ForbiddenError } from "@/lib/rbac/can";
import { DEFAULT_ROLES, ALL_PERMISSIONS, isPermission, type Permission } from "@/lib/rbac/permissions";

const subject = (perms: string[]) => ({ id: "u", permissions: new Set(perms) });

describe("permission checks", () => {
  it("grants only listed permissions", () => {
    const u = subject(["leads:view"]);
    expect(can(u, "leads:view")).toBe(true);
    expect(can(u, "leads:delete")).toBe(false);
    expect(canAny(u, ["leads:delete", "leads:view"])).toBe(true);
    expect(can(null, "leads:view")).toBe(false);
  });
  it("'*' grants everything", () => {
    expect(can(subject(["*"]), "transactions:cancel")).toBe(true);
  });
  it("assertCan throws ForbiddenError", () => {
    expect(() => assertCan(subject([]), "users:delete")).toThrow(ForbiddenError);
    expect(() => assertCan(subject(["users:delete"]), "users:delete")).not.toThrow();
  });
  it("catalog is consistent", () => {
    expect(isPermission("units:update")).toBe(true);
    expect(isPermission("units:fly")).toBe(false);
    for (const role of Object.values(DEFAULT_ROLES)) for (const p of role.permissions) if (p !== "*") expect(ALL_PERMISSIONS).toContain(p);
  });
});

describe("default roles", () => {
  const has = (key: keyof typeof DEFAULT_ROLES, p: Permission) => (DEFAULT_ROLES[key].permissions as string[]).includes(p) || (DEFAULT_ROLES[key].permissions as string[]).includes("*");
  it("Admin has everything", () => {
    expect(DEFAULT_ROLES.ADMIN.permissions).toEqual(["*"]);
  });
  it("Sales Manager owns sales", () => {
    for (const p of ["leads:override_broker", "transactions:cancel", "commissions:approve", "quotas:manage", "holds:release", "reports:view_financial"] as Permission[]) expect(has("SALES_MANAGER", p)).toBe(true);
    for (const p of ["users:view", "roles:manage", "price_lists:update", "commissions:release"] as Permission[]) expect(has("SALES_MANAGER", p)).toBe(false);
  });
  it("Marketing Manager is read-only on transactions and inventory", () => {
    for (const p of ["campaigns:manage", "sequences:manage", "leads:create", "transactions:view", "units:view"] as Permission[]) expect(has("MARKETING_MANAGER", p)).toBe(true);
    for (const p of ["transactions:create", "transactions:update", "units:update", "holds:create", "leads:override_broker", "commissions:view"] as Permission[]) expect(has("MARKETING_MANAGER", p)).toBe(false);
  });
  it("BNG Staff can't delete transactions, change prices, approve commissions or override broker of record", () => {
    for (const p of ["brokers:create", "brokers:delete", "kyc:view", "holds:create", "transactions:create", "documents:verify"] as Permission[]) expect(has("BNG_STAFF", p)).toBe(true);
    for (const p of ["transactions:delete", "transactions:cancel", "price_lists:update", "commissions:approve", "leads:override_broker"] as Permission[]) expect(has("BNG_STAFF", p)).toBe(false);
  });
});
