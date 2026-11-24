import type { Permission } from "@/lib/rbac/permissions";

/** Which permission is needed to view/upload documents for each entity type. KYC docs additionally need kyc:*. */
export const DOC_PERMS: Record<string, { view: Permission; upload: Permission; path: (id: string) => string }> = {
  Development: { view: "developments:view", upload: "developments:update", path: (id) => `/developments/${id}?tab=documents` },
  Brokerage: { view: "brokers:view", upload: "brokers:update", path: (id) => `/brokers/brokerages/${id}?tab=documents` },
  Broker: { view: "brokers:view", upload: "brokers:update", path: (id) => `/brokers/${id}?tab=documents` },
  Client: { view: "clients:view", upload: "clients:update", path: (id) => `/clients/${id}?tab=documents` },
  Lead: { view: "leads:view", upload: "leads:update", path: (id) => `/pipeline/leads/${id}?tab=documents` },
  Transaction: { view: "documents:view", upload: "documents:update", path: (id) => `/transactions/${id}?tab=documents` },
};
