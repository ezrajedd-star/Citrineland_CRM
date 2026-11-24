import type { FieldDef, FieldOption } from "@/components/app/entity-form";
import { E } from "@/lib/validation/schemas";
import { options } from "@/lib/labels";

export function leadFields(o: { sources: FieldOption[]; campaigns: FieldOption[]; developments: FieldOption[]; users: FieldOption[]; brokers: FieldOption[]; stages: FieldOption[]; isNew: boolean; canPickBroker: boolean }): FieldDef[] {
  return [
    { name: "id", label: "", type: "hidden" },
    { name: "firstName", label: "First name", required: true, autoFocus: true },
    { name: "lastName", label: "Last name", required: true },
    { name: "mobile", label: "Mobile", type: "tel", placeholder: "+63 917 123 4567" },
    { name: "email", label: "Email", type: "email" },
    { name: "sourceCode", label: "Source", type: "select", options: o.sources, required: true },
    { name: "campaignId", label: "Campaign", type: "select", options: o.campaigns },
    ...(o.canPickBroker ? [{ name: "brokerId", label: "Broker of record", type: "select" as const, options: o.brokers, emptyOption: "— none / direct —" }] : []),
    { name: "ownerId", label: "Owner (staff)", type: "select", options: o.users },
    ...(o.isNew ? [{ name: "stageId", label: "Stage", type: "select" as const, options: o.stages, emptyOption: "First stage" }] : []),
    { name: "developmentIds", label: "Developments of interest", type: "multiselect", options: o.developments, span: 2 },
    { name: "unitTypePref", label: "Unit type preference", type: "select", options: options(E.UnitTypePref) },
    { name: "financingPref", label: "Financing preference", type: "select", options: options(E.FinancingPref) },
    { name: "budgetMin", label: "Budget from", type: "money" },
    { name: "budgetMax", label: "Budget to", type: "money" },
    { name: "notes", label: "Notes", type: "textarea", span: 2 },
    { name: "privacyConsent", label: "Lead gave Data Privacy Act consent", type: "checkbox" },
    { name: "doNotEmail", label: "Do not email", type: "checkbox" },
  ];
}

export function clientFields(o: { users: FieldOption[]; brokers: FieldOption[] }): FieldDef[] {
  return [
    { name: "id", label: "", type: "hidden" },
    { name: "leadId", label: "", type: "hidden" },
    { name: "firstName", label: "First name", required: true, autoFocus: true },
    { name: "middleName", label: "Middle name" },
    { name: "lastName", label: "Last name", required: true },
    { name: "suffix", label: "Suffix", placeholder: "Jr., III" },
    { name: "birthdate", label: "Birthdate", type: "date" },
    { name: "civilStatus", label: "Civil status", type: "select", options: options(E.CivilStatus) },
    { name: "nationality", label: "Nationality" },
    { name: "tin", label: "TIN", placeholder: "000-000-000-000" },
    { name: "mobile", label: "Mobile", type: "tel" },
    { name: "email", label: "Email", type: "email" },
    { name: "addressLine", label: "Address", span: 2 },
    { name: "city", label: "City / Municipality" },
    { name: "province", label: "Province" },
    { name: "zipCode", label: "ZIP code" },
    { name: "employer", label: "Employer / business" },
    { name: "occupation", label: "Occupation" },
    { name: "monthlyIncome", label: "Gross monthly income", type: "money" },
    { name: "ownerId", label: "Owner (staff)", type: "select", options: o.users },
    { name: "brokerId", label: "Broker of record", type: "select", options: o.brokers, emptyOption: "— none / direct —" },
    { name: "notes", label: "Notes", type: "textarea", span: 2 },
    { name: "privacyConsent", label: "Client gave Data Privacy Act consent", type: "checkbox" },
    { name: "doNotEmail", label: "Do not email", type: "checkbox" },
  ];
}

export const partyFields: FieldDef[] = [
  { name: "id", label: "", type: "hidden" },
  { name: "clientId", label: "", type: "hidden" },
  { name: "relationship", label: "Relationship", type: "select", options: options(E.PartyRelationship), required: true },
  { name: "fullName", label: "Full legal name", required: true },
  { name: "birthdate", label: "Birthdate", type: "date" },
  { name: "civilStatus", label: "Civil status", type: "select", options: options(E.CivilStatus) },
  { name: "nationality", label: "Nationality" },
  { name: "tin", label: "TIN" },
  { name: "mobile", label: "Mobile", type: "tel" },
  { name: "email", label: "Email", type: "email" },
];

export function brokerageFields(): FieldDef[] {
  return [
    { name: "id", label: "", type: "hidden" },
    { name: "name", label: "Brokerage name", required: true, span: 2, autoFocus: true },
    { name: "contactPerson", label: "Contact person" },
    { name: "phone", label: "Phone" },
    { name: "email", label: "Email", type: "email" },
    { name: "tin", label: "TIN" },
    { name: "address", label: "Address", span: 2 },
    { name: "city", label: "City" },
    { name: "accreditationStatus", label: "Accreditation", type: "select", options: options(E.AccreditationStatus), required: true, emptyOption: false },
    { name: "accreditationDate", label: "Accredited on", type: "date" },
    { name: "accreditationExpiry", label: "Accreditation expiry", type: "date" },
    { name: "defaultCommissionPct", label: "Default commission rate", type: "percent" },
    { name: "notes", label: "Notes", type: "textarea", span: 2 },
  ];
}

export function brokerFields(brokerages: FieldOption[]): FieldDef[] {
  return [
    { name: "id", label: "", type: "hidden" },
    { name: "firstName", label: "First name", required: true, autoFocus: true },
    { name: "lastName", label: "Last name", required: true },
    { name: "brokerageId", label: "Brokerage", type: "select", options: brokerages, emptyOption: "Independent" },
    { name: "role", label: "Role in firm", type: "select", options: options(E.BrokerRole), required: true, emptyOption: false },
    { name: "mobile", label: "Mobile", type: "tel" },
    { name: "email", label: "Email", type: "email" },
    { name: "prcLicenseNo", label: "PRC license no." },
    { name: "prcLicenseExpiry", label: "PRC license expiry", type: "date" },
    { name: "dhsudRegNo", label: "DHSUD registration no." },
    { name: "accreditationStatus", label: "Accreditation", type: "select", options: options(E.AccreditationStatus), required: true, emptyOption: false },
    { name: "accreditationDate", label: "Accredited on", type: "date" },
    { name: "accreditationExpiry", label: "Accreditation expiry", type: "date" },
    { name: "commissionRateOverridePct", label: "Commission rate override", type: "percent", help: "Leave blank to use the commission rules" },
    { name: "notes", label: "Notes", type: "textarea", span: 2 },
  ];
}

export function taskFields(users: FieldOption[]): FieldDef[] {
  return [
    { name: "id", label: "", type: "hidden" },
    { name: "leadId", label: "", type: "hidden" },
    { name: "clientId", label: "", type: "hidden" },
    { name: "brokerId", label: "", type: "hidden" },
    { name: "transactionId", label: "", type: "hidden" },
    { name: "title", label: "Title", required: true, span: 2, autoFocus: true },
    { name: "dueAt", label: "Due", type: "datetime" },
    { name: "priority", label: "Priority", type: "select", options: options(E.TaskPriority), emptyOption: false },
    { name: "assigneeId", label: "Assignee", type: "select", options: users, emptyOption: "Me" },
    { name: "description", label: "Details", type: "textarea", span: 2 },
  ];
}
