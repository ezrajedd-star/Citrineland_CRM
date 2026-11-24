import type { ZodTypeAny } from "zod";
import * as S from "./schemas";

/** Schemas addressable by key from client components (functions can't cross the server→client boundary). */
export const formSchemas = {
  user: S.userSchema,
  role: S.roleSchema,
  stage: S.stageSchema,
  picklist: S.picklistSchema,
  docTemplateItem: S.docTemplateItemSchema,
  development: S.developmentSchema,
  section: S.sectionSchema,
  unit: S.unitSchema,
  parking: S.parkingSchema,
  paymentScheme: S.paymentSchemeSchema,
  hold: S.holdSchema,
  block: S.blockSchema,
  priceChange: S.priceChangeSchema,
  brokerage: S.brokerageSchema,
  broker: S.brokerSchema,
  lead: S.leadSchema,
  overrideBroker: S.overrideBrokerSchema,
  moveStage: S.moveStageSchema,
  client: S.clientSchema,
  clientParty: S.clientPartySchema,
  activity: S.activitySchema,
  task: S.taskSchema,
  computation: S.computationSchema,
  reservation: S.reservationSchema,
  payment: S.paymentSchema,
  voidPayment: S.voidPaymentSchema,
  statusChange: S.statusChangeSchema,
  cancel: S.cancelSchema,
  transfer: S.transferSchema,
  checklistUpdate: S.checklistUpdateSchema,
  commissionAdjustment: S.commissionAdjustmentSchema,
  trancheAction: S.trancheActionSchema,
  quota: S.quotaSchema,
  campaign: S.campaignSchema,
  emailTemplate: S.emailTemplateSchema,
  enroll: S.enrollSchema,
} satisfies Record<string, ZodTypeAny>;

export type FormSchemaKey = keyof typeof formSchemas;
