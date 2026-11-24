import { PrismaClient } from "@prisma/client";

// BigInt (money in centavos) must survive JSON.stringify for audit logs and API responses.
declare global {
  interface BigInt {
    toJSON(): string;
  }
  var __prisma: PrismaClient | undefined;
}
if (!(BigInt.prototype as any).toJSON) {
  (BigInt.prototype as any).toJSON = function () {
    return this.toString();
  };
}

export const prisma: PrismaClient =
  globalThis.__prisma ??
  new PrismaClient({
    log: process.env.PRISMA_LOG === "query" ? ["query", "warn", "error"] : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") globalThis.__prisma = prisma;

export type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;
