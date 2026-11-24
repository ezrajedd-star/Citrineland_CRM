import { describe, expect, it } from "vitest";
import { evaluateCondition, matchesAll, nextRoundRobin, renderTemplate } from "@/domain/automation/rules";

describe("automation rules", () => {
  const ctx = { lead: { sourceCode: "FACEBOOK", developmentCodes: ["CTR", "AMB"], budget: 5_000_000 } };
  it("evaluates conditions", () => {
    expect(evaluateCondition({ field: "lead.sourceCode", op: "eq", value: "facebook" }, ctx)).toBe(true);
    expect(evaluateCondition({ field: "lead.sourceCode", op: "in", value: "WEBSITE, FACEBOOK" }, ctx)).toBe(true);
    expect(evaluateCondition({ field: "lead.developmentCodes", op: "eq", value: "AMB" }, ctx)).toBe(true);
    expect(evaluateCondition({ field: "lead.developmentCodes", op: "neq", value: "XYZ" }, ctx)).toBe(true);
    expect(evaluateCondition({ field: "lead.budget", op: "gt", value: "4000000" }, ctx)).toBe(true);
    expect(evaluateCondition({ field: "lead.missing", op: "eq", value: "x" }, ctx)).toBe(false);
    expect(matchesAll([], ctx)).toBe(true);
  });
  it("rotates round-robin", () => {
    expect(nextRoundRobin(["a", "b", "c"], null)).toBe("a");
    expect(nextRoundRobin(["a", "b", "c"], "a")).toBe("b");
    expect(nextRoundRobin(["a", "b", "c"], "c")).toBe("a");
    expect(nextRoundRobin(["a", "b"], "zzz")).toBe("a");
    expect(nextRoundRobin([], "a")).toBeNull();
  });
  it("renders templates with escaping", () => {
    expect(renderTemplate("Hi {{ lead.firstName }}, see {{development.name}}{{nope}}", { lead: { firstName: "Ana <b>" }, development: { name: "Tower" } })).toBe("Hi Ana &lt;b&gt;, see Tower");
  });
});
