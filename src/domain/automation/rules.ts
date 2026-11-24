/** Pure parts of the rules engine: condition evaluation, round-robin, template merge fields. */

export interface Condition {
  field: string;
  op: "eq" | "neq" | "in" | "gt" | "lt" | "contains";
  value: string;
}

function read(ctx: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as any)[k] : undefined), ctx);
}

export function evaluateCondition(c: Condition, ctx: Record<string, unknown>): boolean {
  const v = read(ctx, c.field);
  const list = c.value.split(",").map((s) => s.trim().toLowerCase());
  const asStr = (x: unknown) => (Array.isArray(x) ? x.map((y) => String(y).toLowerCase()) : [String(x ?? "").toLowerCase()]);
  switch (c.op) {
    case "eq":
      return asStr(v).includes(c.value.trim().toLowerCase());
    case "neq":
      return !asStr(v).includes(c.value.trim().toLowerCase());
    case "in":
      return asStr(v).some((x) => list.includes(x));
    case "contains":
      return asStr(v).some((x) => x.includes(c.value.trim().toLowerCase()));
    case "gt":
      return Number(v) > Number(c.value);
    case "lt":
      return Number(v) < Number(c.value);
  }
}

export function matchesAll(conditions: Condition[], ctx: Record<string, unknown>): boolean {
  return conditions.every((c) => evaluateCondition(c, ctx));
}

/** Next assignee in a round-robin rotation. */
export function nextRoundRobin(userIds: string[], lastAssigned: string | null): string | null {
  if (!userIds.length) return null;
  const i = lastAssigned ? userIds.indexOf(lastAssigned) : -1;
  return userIds[(i + 1) % userIds.length];
}

/** Replace {{merge.fields}}; unknown fields become empty. Values are HTML-escaped. */
export function renderTemplate(tpl: string, ctx: Record<string, unknown>, opts: { escapeHtml?: boolean } = { escapeHtml: true }): string {
  return tpl.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, path: string) => {
    const v = read(ctx, path);
    const s = v === null || v === undefined ? "" : String(v);
    return opts.escapeHtml ? s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;") : s;
  });
}

export const MERGE_FIELDS = ["lead.firstName", "lead.lastName", "lead.fullName", "lead.email", "owner.name", "owner.email", "owner.phone", "development.name", "broker.name", "unsubscribeUrl"];

/** Trigger catalogue for custom rules (event triggers are dispatched by the worker). */
export const TRIGGERS: Record<string, { label: string; fields: string[] }> = {
  "lead.created": { label: "Lead created", fields: ["lead.sourceCode", "lead.campaignCode", "lead.developmentCodes", "lead.unitTypePref", "lead.financingPref", "lead.brokerId", "lead.ownerId"] },
  "lead.stage_changed": { label: "Lead stage changed", fields: ["lead.stageName", "fromStageName", "lead.sourceCode", "lead.developmentCodes", "lead.ownerId"] },
  "transaction.reserved": { label: "Reservation created", fields: ["transaction.developmentCode", "transaction.schemeKind", "transaction.financing", "transaction.brokerId", "transaction.tcpPesos"] },
  "transaction.status_changed": { label: "Transaction status changed", fields: ["transaction.status", "from", "transaction.developmentCode"] },
  "payment.recorded": { label: "Payment recorded", fields: ["payment.amountPesos", "payment.method", "transaction.developmentCode"] },
};

export const ACTION_TYPES: Record<string, { label: string; params: string[] }> = {
  create_task: { label: "Create task", params: ["title", "dueInHours", "assignTo (owner | handler | <userId>)", "priority"] },
  notify: { label: "Notify", params: ["title", "body", "to (owner | handler | role:SALES_MANAGER | <userId>)"] },
  assign_owner: { label: "Assign lead owner", params: ["userId"] },
  enroll_sequence: { label: "Enroll in email sequence", params: ["sequenceId"] },
};
