import { z } from "zod";
import { normalizePhMobile } from "../normalize";

/**
 * Field helpers shared by forms (client) and server actions.
 * Forms submit raw string values; these schemas coerce/transform them identically on both sides.
 */
const emptyToNull = (v: unknown) => (v === "" || v === undefined ? null : v);

export const zReq = (label = "This field", max = 200) => z.string({ required_error: `${label} is required` }).trim().min(1, `${label} is required`).max(max);
export const zOpt = (max = 1000) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

export const zEmail = z
  .string()
  .trim()
  .toLowerCase()
  .nullish()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || z.string().email().safeParse(v).success, "Enter a valid email address");

export const zReqEmail = z.string().trim().toLowerCase().email("Enter a valid email address");

export const zPhMobile = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || normalizePhMobile(v) !== null, "Enter a PH mobile number, e.g. +63 917 123 4567")
  .transform((v) => (v ? normalizePhMobile(v) : null));

/** Pesos (string or number) → integer centavos */
export const zMoney = z
  .union([z.string(), z.number()])
  .transform((v, ctx) => {
    const num = typeof v === "number" ? v : Number(String(v).replace(/[₱,\s]/g, ""));
    if (String(v).trim() === "" || !Number.isFinite(num)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter an amount" });
      return z.NEVER;
    }
    if (num < 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Amount cannot be negative" });
      return z.NEVER;
    }
    return Math.round(num * 100);
  });

export const zOptMoney = z.preprocess(emptyToNull, zMoney.nullable());

export const zPositiveMoney = zMoney.refine((v) => v > 0, "Amount must be greater than zero");

export const zInt = (min = 0, max = 1_000_000) => z.coerce.number({ invalid_type_error: "Enter a number" }).int("Whole numbers only").min(min).max(max);
export const zOptInt = (min = 0, max = 1_000_000) => z.preprocess(emptyToNull, zInt(min, max).nullable());
export const zNum = (min = 0, max = 1_000_000_000) => z.coerce.number({ invalid_type_error: "Enter a number" }).min(min).max(max);
export const zOptNum = (min = 0, max = 1_000_000_000) => z.preprocess(emptyToNull, zNum(min, max).nullable());
export const zPct = z.coerce.number({ invalid_type_error: "Enter a percentage" }).min(0, "Min 0%").max(100, "Max 100%");
export const zOptPct = z.preprocess(emptyToNull, zPct.nullable());

/** 'YYYY-MM-DD' → UTC-midnight Date */
export const zDay = z
  .union([z.string(), z.date()])
  .transform((v, ctx) => {
    if (v instanceof Date) return v;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
    if (!m) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a date" });
      return z.NEVER;
    }
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  });
export const zOptDay = z.preprocess(emptyToNull, zDay.nullable());

/** datetime-local (Asia/Manila wall time) → Date */
export const zDateTime = z.union([z.string(), z.date()]).transform((v, ctx) => {
  if (v instanceof Date) return v;
  const s = v.trim();
  const d = /[zZ]|[+-]\d\d:\d\d$/.test(s) ? new Date(s) : new Date(`${s}${s.length === 16 ? ":00" : ""}+08:00`);
  if (Number.isNaN(d.getTime())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a date and time" });
    return z.NEVER;
  }
  return d;
});
export const zOptDateTime = z.preprocess(emptyToNull, zDateTime.nullable());

export const zBool = z.preprocess((v) => v === true || v === "true" || v === "on" || v === 1 || v === "1", z.boolean());

export const zId = z.string().min(1, "Required");
export const zOptId = z
  .string()
  .nullish()
  .transform((v) => (v ? v : null));
export const zIds = z.preprocess((v) => (Array.isArray(v) ? v : v ? [v] : []), z.array(z.string().min(1)));

export function zEnumReq<T extends [string, ...string[]]>(values: T, label = "This field") {
  return z.enum(values, { errorMap: () => ({ message: `Select ${label.toLowerCase()}` }) });
}
export function zEnumOpt<T extends [string, ...string[]]>(values: T) {
  return z.preprocess(emptyToNull, z.enum(values).nullable());
}
