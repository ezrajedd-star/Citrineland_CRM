import { z } from "zod";
import {
  zBool,
  zDateTime,
  zDay,
  zEmail,
  zEnumOpt,
  zEnumReq,
  zId,
  zIds,
  zInt,
  zMoney,
  zOpt,
  zOptDateTime,
  zOptDay,
  zOptId,
  zOptInt,
  zOptMoney,
  zOptNum,
  zOptPct,
  zPct,
  zPhMobile,
  zPositiveMoney,
  zReq,
  zReqEmail,
} from "./fields";

/**
 * Zod schemas shared by client forms (validation) and server actions (authoritative parse).
 * Enum value lists mirror prisma/schema.prisma.
 */
export const E = {
  UserStatus: ["INVITED", "ACTIVE", "DEACTIVATED"],
  DevelopmentType: ["CONDOMINIUM", "SUBDIVISION", "MIXED"],
  DevelopmentStatus: ["PRE_SELLING", "RFO", "COMPLETED"],
  SectionKind: ["TOWER", "BUILDING", "PHASE", "BLOCK"],
  UnitType: ["CONDO", "HOUSE_AND_LOT", "LOT_ONLY"],
  ParkingType: ["REGULAR", "TANDEM", "PWD", "EV"],
  SchemeKind: ["SPOT_CASH", "DEFERRED_CASH", "DP_BALANCE"],
  FinancingType: ["BANK", "PAGIBIG", "IN_HOUSE"],
  AccreditationStatus: ["PENDING", "ACCREDITED", "SUSPENDED", "EXPIRED"],
  BrokerRole: ["BROKER", "SALESPERSON"],
  UnitTypePref: ["CONDO", "HOUSE_AND_LOT", "LOT_ONLY", "PARKING", "ANY"],
  FinancingPref: ["SPOT_CASH", "DEFERRED_CASH", "BANK", "PAGIBIG", "IN_HOUSE", "UNDECIDED"],
  CivilStatus: ["SINGLE", "MARRIED", "WIDOWED", "SEPARATED", "ANNULLED"],
  PartyRelationship: ["SPOUSE", "CO_BUYER", "ATTORNEY_IN_FACT", "OTHER"],
  ActivityType: ["NOTE", "CALL", "MEETING", "SITE_VISIT", "EMAIL_IN", "EMAIL_OUT", "TASK", "STATUS_CHANGE", "SYSTEM"],
  TaskPriority: ["LOW", "MEDIUM", "HIGH", "URGENT"],
  TaskStatus: ["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"],
  PaymentMethod: ["CASH", "CHECK", "PDC", "BANK_TRANSFER", "ONLINE", "CREDIT_CARD", "LOAN_PROCEEDS", "OTHER"],
  ChecklistStatus: ["PENDING", "SUBMITTED", "VERIFIED", "REJECTED"],
  CommissionBasis: ["NSP", "TCP"],
  QuotaTarget: ["STAFF", "BROKER", "BROKERAGE"],
  QuotaPeriod: ["MONTH", "QUARTER"],
} as const;

// ── Admin ──
export const userSchema = z.object({
  id: zOptId,
  name: zReq("Name"),
  email: zReqEmail,
  roleId: zId,
  status: zEnumReq(E.UserStatus as any, "Status"),
  phone: zPhMobile,
  emailNotifications: zBool,
});

export const roleSchema = z.object({
  id: zOptId,
  name: zReq("Role name", 60),
  description: zOpt(300),
});

export const stageSchema = z.object({
  id: zOptId,
  name: zReq("Stage name", 60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #f59e0b"),
  probability: zInt(0, 100),
  stalledAfterDays: zInt(1, 365),
  isWon: zBool,
  isLost: zBool,
  active: zBool,
});

export const picklistSchema = z.object({
  id: zOptId,
  type: zReq("Type"),
  code: z
    .string()
    .trim()
    .min(1, "Code is required")
    .max(40)
    .regex(/^[A-Z0-9_]+$/, "Use UPPER_SNAKE_CASE"),
  label: zReq("Label", 80),
  order: zInt(0, 1000),
  active: zBool,
});

export const docTemplateItemSchema = z.object({
  id: zOptId,
  name: zReq("Name", 120),
  description: zOpt(300),
  required: zBool,
  dueDaysAfterReservation: zInt(0, 365),
  order: zInt(0, 1000),
  marriedOnly: zBool,
  financingFilter: z.preprocess((v) => (Array.isArray(v) ? v : v ? [v] : []), z.array(z.enum(E.FinancingType))),
  schemeFilter: z.preprocess((v) => (Array.isArray(v) ? v : v ? [v] : []), z.array(z.enum(E.SchemeKind))),
  active: zBool,
});

// ── Developments & inventory ──
export const developmentSchema = z.object({
  id: zOptId,
  code: z
    .string()
    .trim()
    .min(2, "Code is required")
    .max(12)
    .regex(/^[A-Z0-9-]+$/, "Use uppercase letters, digits and dashes"),
  name: zReq("Name", 120),
  type: zEnumReq(E.DevelopmentType as any, "Type"),
  status: zEnumReq(E.DevelopmentStatus as any, "Status"),
  address: zOpt(300),
  city: zOpt(100),
  province: zOpt(100),
  description: zOpt(4000),
  ltsNumber: zOpt(60),
  targetTurnoverDate: zOptDay,
});

export const sectionSchema = z.object({
  id: zOptId,
  developmentId: zId,
  kind: zEnumReq(E.SectionKind as any, "Kind"),
  name: zReq("Name", 80),
  code: zReq("Code", 20),
  floors: zOptInt(0, 200),
  sortOrder: zInt(0, 1000),
  parentId: zOptId,
});

export const unitSchema = z.object({
  id: zOptId,
  developmentId: zId,
  sectionId: zOptId,
  code: zReq("Unit code", 40),
  floor: zOptInt(-10, 200),
  block: zOpt(20),
  lot: zOpt(20),
  unitType: zEnumReq(E.UnitType as any, "Unit type"),
  model: zOpt(80),
  floorArea: zOptNum(0, 100_000),
  lotArea: zOptNum(0, 1_000_000),
  bedrooms: zOptInt(0, 20),
  bathrooms: zOptInt(0, 20),
  orientation: zOpt(80),
  /** Only used on create; later changes go through price lists */
  listPrice: zOptMoney,
  notes: zOpt(2000),
});

export const parkingSchema = z.object({
  id: zOptId,
  developmentId: zId,
  sectionId: zOptId,
  code: zReq("Slot code", 40),
  level: zOpt(20),
  type: zEnumReq(E.ParkingType as any, "Type"),
  listPrice: zOptMoney,
  notes: zOpt(2000),
});

export const paymentSchemeSchema = z
  .object({
    id: zOptId,
    developmentId: zOptId,
    name: zReq("Name", 80),
    kind: zEnumReq(E.SchemeKind as any, "Scheme type"),
    description: zOpt(500),
    reservationFee: zMoney,
    spotDiscountPct: zPct,
    deferredMonths: zOptInt(1, 120),
    dpPct: zOptPct,
    dpMonths: zOptInt(0, 120),
    spotDpDiscountPct: zPct,
    financing: zEnumOpt(E.FinancingType as any),
    interestRatePct: zOptPct,
    termMonths: zOptInt(1, 480),
    sortOrder: zInt(0, 1000),
    active: zBool,
  })
  .superRefine((v, ctx) => {
    if (v.kind === "DEFERRED_CASH" && !v.deferredMonths) ctx.addIssue({ code: "custom", path: ["deferredMonths"], message: "Required for deferred cash" });
    if (v.kind === "DP_BALANCE") {
      if (v.dpPct === null || v.dpPct === undefined) ctx.addIssue({ code: "custom", path: ["dpPct"], message: "Required" });
      if (v.dpMonths === null || v.dpMonths === undefined) ctx.addIssue({ code: "custom", path: ["dpMonths"], message: "Required (0 = spot DP)" });
      if (!v.financing) ctx.addIssue({ code: "custom", path: ["financing"], message: "Select how the balance is paid" });
    }
  });

export const holdSchema = z.object({
  unitId: zOptId,
  parkingSlotId: zOptId,
  leadId: zOptId,
  clientId: zOptId,
  brokerId: zOptId,
  hours: zOptInt(1, 720),
  notes: zOpt(500),
});

export const blockSchema = z.object({
  kind: z.enum(["UNIT", "PARKING"]),
  id: zId,
  block: zBool,
  reason: zReq("Reason", 300),
});

export const priceChangeSchema = z.object({
  developmentId: zId,
  effectiveDate: zDay,
  notes: zOpt(500),
  /** Adjust all listed items by % (optional) */
  adjustPct: zOptNum(-90, 500),
  items: z
    .array(z.object({ kind: z.enum(["UNIT", "PARKING"]), id: zId, price: zMoney }))
    .default([]),
});

// ── Brokers ──
export const brokerageSchema = z.object({
  id: zOptId,
  name: zReq("Name", 120),
  address: zOpt(300),
  city: zOpt(100),
  email: zEmail,
  phone: zOpt(40),
  contactPerson: zOpt(120),
  tin: zOpt(30),
  accreditationStatus: zEnumReq(E.AccreditationStatus as any, "Status"),
  accreditationDate: zOptDay,
  accreditationExpiry: zOptDay,
  defaultCommissionPct: zOptPct,
  notes: zOpt(2000),
});

export const brokerSchema = z.object({
  id: zOptId,
  brokerageId: zOptId,
  firstName: zReq("First name", 80),
  lastName: zReq("Last name", 80),
  role: zEnumReq(E.BrokerRole as any, "Role"),
  prcLicenseNo: zOpt(40),
  prcLicenseExpiry: zOptDay,
  dhsudRegNo: zOpt(40),
  email: zEmail,
  mobile: zPhMobile,
  accreditationStatus: zEnumReq(E.AccreditationStatus as any, "Status"),
  accreditationDate: zOptDay,
  accreditationExpiry: zOptDay,
  commissionRateOverridePct: zOptPct,
  notes: zOpt(2000),
});

// ── Leads & clients ──
export const leadSchema = z.object({
  id: zOptId,
  firstName: zReq("First name", 80),
  lastName: zReq("Last name", 80),
  email: zEmail,
  mobile: zPhMobile,
  sourceCode: zReq("Source"),
  campaignId: zOptId,
  developmentIds: zIds,
  unitTypePref: zEnumOpt(E.UnitTypePref as any),
  budgetMin: zOptMoney,
  budgetMax: zOptMoney,
  financingPref: zEnumOpt(E.FinancingPref as any),
  ownerId: zOptId,
  brokerId: zOptId,
  stageId: zOptId,
  privacyConsent: zBool,
  doNotEmail: zBool,
  notes: zOpt(4000),
  /** Acknowledge duplicate warning */
  confirmDuplicate: zBool.optional(),
});

export const overrideBrokerSchema = z.object({
  leadId: zId,
  brokerId: zOptId,
  reason: zReq("Reason", 500),
});

export const moveStageSchema = z.object({
  leadId: zId,
  stageId: zId,
  lostReasonCode: zOpt(60),
  lostNotes: zOpt(1000),
});

export const clientSchema = z.object({
  id: zOptId,
  firstName: zReq("First name", 80),
  middleName: zOpt(80),
  lastName: zReq("Last name", 80),
  suffix: zOpt(20),
  birthdate: zOptDay,
  civilStatus: zEnumOpt(E.CivilStatus as any),
  nationality: zOpt(60),
  tin: zOpt(30),
  addressLine: zOpt(300),
  city: zOpt(100),
  province: zOpt(100),
  zipCode: zOpt(10),
  employer: zOpt(120),
  occupation: zOpt(120),
  monthlyIncome: zOptMoney,
  email: zEmail,
  mobile: zPhMobile,
  ownerId: zOptId,
  brokerId: zOptId,
  privacyConsent: zBool,
  doNotEmail: zBool,
  notes: zOpt(4000),
  leadId: zOptId,
  confirmDuplicate: zBool.optional(),
});

export const clientPartySchema = z.object({
  id: zOptId,
  clientId: zId,
  relationship: zEnumReq(E.PartyRelationship as any, "Relationship"),
  fullName: zReq("Full name", 160),
  birthdate: zOptDay,
  civilStatus: zEnumOpt(E.CivilStatus as any),
  nationality: zOpt(60),
  tin: zOpt(30),
  email: zEmail,
  mobile: zPhMobile,
});

export const activitySchema = z.object({
  type: z.enum(["NOTE", "CALL", "MEETING", "SITE_VISIT"]),
  subject: zReq("Subject", 200),
  body: zOpt(8000),
  occurredAt: zOptDateTime,
  /** For meetings/site visits: end time and whether to create an Outlook event */
  endsAt: zOptDateTime,
  location: zOpt(200),
  createOutlookEvent: zBool,
  inviteContact: zBool,
  leadId: zOptId,
  clientId: zOptId,
  brokerId: zOptId,
  transactionId: zOptId,
});

export const taskSchema = z.object({
  id: zOptId,
  title: zReq("Title", 200),
  description: zOpt(4000),
  dueAt: zOptDateTime,
  priority: zEnumReq(E.TaskPriority as any, "Priority"),
  assigneeId: zOptId,
  leadId: zOptId,
  clientId: zOptId,
  brokerId: zOptId,
  transactionId: zOptId,
});

// ── Computations & transactions ──
export const computationSchema = z.object({
  developmentId: zId,
  unitId: zOptId,
  parkingSlotId: zOptId,
  paymentSchemeId: zId,
  leadId: zOptId,
  clientId: zOptId,
  discountPct: zOptPct,
  discountAmount: zOptMoney,
  reservationDate: zOptDay,
});

export const reservationSchema = z.object({
  leadId: zOptId,
  clientId: zOptId,
  unitId: zOptId,
  parkingSlotIds: zIds,
  holdId: zOptId,
  paymentSchemeId: zId,
  brokerId: zOptId,
  handlingStaffId: zOptId,
  discountPct: zOptPct,
  discountAmount: zOptMoney,
  reservationDate: zDay,
  firstDueDate: zOptDay,
  reservationFeePaid: zBool,
  orNumber: zOpt(40),
  paymentMethod: zEnumOpt(E.PaymentMethod as any),
  notes: zOpt(2000),
});

export const paymentSchema = z.object({
  transactionId: zId,
  paidAt: zDay,
  amount: zPositiveMoney,
  orNumber: zOpt(40),
  method: zEnumReq(E.PaymentMethod as any, "Method"),
  reference: zOpt(120),
  notes: zOpt(1000),
});

export const voidPaymentSchema = z.object({ paymentId: zId, reason: zReq("Reason", 300) });

export const statusChangeSchema = z.object({
  transactionId: zId,
  toStatus: zReq("Status"),
  note: zOpt(1000),
  effectiveDate: zOptDay,
});

export const cancelSchema = z.object({
  transactionId: zId,
  reason: zReq("Reason", 1000),
  confirm: zBool.refine((v) => v, "Please confirm"),
});

export const transferSchema = z.object({
  transactionId: zId,
  newUnitId: zOptId,
  newClientId: zOptId,
  reason: zReq("Reason", 1000),
});

export const checklistUpdateSchema = z.object({
  id: zId,
  status: zEnumReq(E.ChecklistStatus as any, "Status"),
  dueDate: zOptDay,
  rejectReason: zOpt(500),
});

// ── Commissions ──
export const trancheRuleSchema = z.object({
  label: zReq("Label", 80),
  pct: zPct,
  milestoneType: z.enum(["RESERVATION", "COLLECTED_PCT_TCP", "CONTRACT_SIGNED", "DP_COMPLETE", "LOAN_TAKEOUT", "FULLY_PAID"]),
  milestoneValue: zOptNum(0, 100),
});

export const commissionRuleSchema = z
  .object({
    id: zOptId,
    name: zReq("Name", 120),
    developmentId: zOptId,
    brokerageId: zOptId,
    ratePct: zPct,
    basis: zEnumReq(E.CommissionBasis as any, "Basis"),
    brokerageSharePct: zPct,
    agentSharePct: zPct,
    tranches: z.array(trancheRuleSchema).min(1, "Add at least one tranche"),
    active: zBool,
  })
  .superRefine((v, ctx) => {
    if (Math.abs(v.brokerageSharePct + v.agentSharePct - 100) > 0.001) ctx.addIssue({ code: "custom", path: ["agentSharePct"], message: "Brokerage + agent share must equal 100%" });
    const total = v.tranches.reduce((s, t) => s + t.pct, 0);
    if (Math.abs(total - 100) > 0.001) ctx.addIssue({ code: "custom", path: ["tranches"], message: `Tranches must total 100% (now ${total}%)` });
  });

export const trancheActionSchema = z.object({ trancheIds: zIds.refine((a) => a.length > 0, "Select at least one tranche"), reference: zOpt(120) });
export const commissionAdjustmentSchema = z.object({ ledgerId: zId, amount: z.coerce.number(), reason: zReq("Reason", 500) });

export const quotaSchema = z.object({
  id: zOptId,
  targetType: zEnumReq(E.QuotaTarget as any, "Target"),
  userId: zOptId,
  brokerId: zOptId,
  brokerageId: zOptId,
  periodType: zEnumReq(E.QuotaPeriod as any, "Period"),
  periodStart: zDay,
  units: zOptInt(0, 10000),
  value: zOptMoney,
});

// ── Marketing ──
export const campaignSchema = z.object({
  id: zOptId,
  name: zReq("Name", 120),
  code: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-_]+$/, "Lowercase letters, digits, dashes (used as utm_campaign)"),
  channel: zReq("Channel"),
  developmentId: zOptId,
  budget: zMoney,
  startDate: zOptDay,
  endDate: zOptDay,
  description: zOpt(2000),
  active: zBool,
});

export const emailTemplateSchema = z.object({
  id: zOptId,
  name: zReq("Name", 120),
  subject: zReq("Subject", 200),
  bodyHtml: zReq("Body", 50_000),
});

export const sequenceSchema = z.object({
  id: zOptId,
  name: zReq("Name", 120),
  description: zOpt(500),
  active: zBool,
  stopOnReply: zBool,
  stopOnStageChange: zBool,
  triggerStageId: zOptId,
  steps: z.array(z.object({ delayDays: zInt(0, 365), templateId: zId })).min(1, "Add at least one step"),
});

export const composeEmailSchema = z.object({
  to: z.array(z.string().email()).min(1, "Add a recipient"),
  cc: z.array(z.string().email()).default([]),
  subject: zReq("Subject", 300),
  bodyHtml: zReq("Message", 100_000),
  leadId: zOptId,
  clientId: zOptId,
  brokerId: zOptId,
  transactionId: zOptId,
  computationId: zOptId,
  templateId: zOptId,
});

export const automationRuleSchema = z.object({
  id: zOptId,
  name: zReq("Name", 120),
  trigger: zReq("Trigger"),
  enabled: zBool,
  description: zOpt(500),
  conditions: z.array(z.object({ field: zReq("Field"), op: z.enum(["eq", "neq", "in", "gt", "lt", "contains"]), value: z.string() })).default([]),
  actions: z
    .array(
      z.object({
        type: z.enum(["create_task", "notify", "assign_owner", "enroll_sequence", "set_field"]),
        params: z.record(z.string()),
      }),
    )
    .min(1, "Add at least one action"),
});

export const publicLeadSchema = z.object({
  firstName: zReq("First name", 80),
  lastName: zReq("Last name", 80),
  email: zEmail,
  mobile: zPhMobile,
  developmentCode: zOpt(20),
  unitTypePref: zEnumOpt(E.UnitTypePref as any),
  message: zOpt(2000),
  privacyConsent: zBool.refine((v) => v, "Consent is required"),
  utm_source: zOpt(100),
  utm_medium: zOpt(100),
  utm_campaign: zOpt(100),
  utm_term: zOpt(100),
  utm_content: zOpt(100),
  website: zOpt(200), // honeypot
  captchaToken: zOpt(4000),
});

export { zDateTime, zDay };
