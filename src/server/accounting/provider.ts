/**
 * Accounting integration seam (Oracle NetSuite later). The CRM works standalone today via the
 * NoopAccountingProvider; a NetSuiteProvider (SuiteTalk REST, OAuth 2.0 / TBA) can be dropped in without
 * touching commission or reporting logic because payments are already tagged with `source` + `externalId`.
 * See docs/NETSUITE_INTEGRATION_PLAN.md.
 */
export interface AccountingCustomer {
  crmId: string;
  netsuiteId?: string | null;
  name: string;
  email?: string | null;
  phone?: string | null;
  tin?: string | null;
  address?: string | null;
}
export interface AccountingSalesOrder {
  crmId: string;
  code: string;
  netsuiteId?: string | null;
  customerNetsuiteId: string;
  developmentCode: string;
  items: { code: string; amountCents: number }[];
  tcpCents: number;
  reservedAt: Date;
}
export interface AccountingPayment {
  externalId: string;
  salesOrderNetsuiteId: string;
  transactionCode: string;
  paidAt: Date;
  amountCents: number;
  orNumber?: string | null;
  method: string;
}
export interface AccountingVendor {
  crmId: string;
  netsuiteId?: string | null;
  kind: "BROKERAGE" | "BROKER";
  name: string;
  tin?: string | null;
  email?: string | null;
}
export interface CommissionBill {
  crmTrancheId: string;
  vendorNetsuiteId: string;
  transactionCode: string;
  amountCents: number;
  memo: string;
}

export interface AccountingProvider {
  readonly name: string;
  readonly connected: boolean;
  upsertCustomer(c: AccountingCustomer, idempotencyKey: string): Promise<{ netsuiteId: string } | null>;
  upsertSalesOrder(o: AccountingSalesOrder, idempotencyKey: string): Promise<{ netsuiteId: string } | null>;
  /** Payments recorded in NetSuite since a cursor; imported with source = NETSUITE */
  fetchPayments(since: Date): Promise<AccountingPayment[]>;
  upsertVendor(v: AccountingVendor, idempotencyKey: string): Promise<{ netsuiteId: string } | null>;
  createCommissionBill(b: CommissionBill, idempotencyKey: string): Promise<{ netsuiteId: string } | null>;
}

/** Used until NetSuite is connected: does nothing, never fails. */
export class NoopAccountingProvider implements AccountingProvider {
  readonly name = "none";
  readonly connected = false;
  async upsertCustomer() {
    return null;
  }
  async upsertSalesOrder() {
    return null;
  }
  async fetchPayments() {
    return [];
  }
  async upsertVendor() {
    return null;
  }
  async createCommissionBill() {
    return null;
  }
}

export function getAccountingProvider(): AccountingProvider {
  // When implemented: if (process.env.NETSUITE_ACCOUNT_ID) return new NetSuiteProvider(...)
  return new NoopAccountingProvider();
}
