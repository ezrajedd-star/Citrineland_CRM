import "isomorphic-fetch";
import { Client } from "@microsoft/microsoft-graph-client";
import { prisma } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/crypto";
import { logger } from "@/lib/logger";

export class GraphNotConnectedError extends Error {
  constructor(message = "Microsoft 365 is not connected for this user. Sign in with Microsoft to connect.") {
    super(message);
    this.name = "GraphNotConnectedError";
  }
}

export const graphConfigured = () => Boolean(process.env.AUTH_MICROSOFT_ENTRA_ID_ID && process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET && process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER);

function tokenEndpoint() {
  // Issuer: https://login.microsoftonline.com/<tenant>/v2.0
  const issuer = process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER ?? "";
  const tenant = issuer.match(/microsoftonline\.com\/([^/]+)/)?.[1] ?? "common";
  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
}

const refreshing = new Map<string, Promise<string>>();

/** Returns a valid access token for the user, refreshing (and rotating the refresh token) when needed. */
export async function getAccessToken(userId: string): Promise<string> {
  const conn = await prisma.microsoftConnection.findUnique({ where: { userId } });
  if (!conn || conn.status === "DISCONNECTED") throw new GraphNotConnectedError();
  if (conn.accessTokenEnc && conn.accessTokenExpiresAt && conn.accessTokenExpiresAt.getTime() - Date.now() > 120_000) return decrypt(conn.accessTokenEnc);
  if (!refreshing.has(userId)) {
    refreshing.set(
      userId,
      (async () => {
        try {
          const res = await fetch(tokenEndpoint(), {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: process.env.AUTH_MICROSOFT_ENTRA_ID_ID!,
              client_secret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET!,
              grant_type: "refresh_token",
              refresh_token: decrypt(conn.refreshTokenEnc),
              scope: "offline_access User.Read Mail.Read Mail.Send Calendars.ReadWrite",
            }),
          });
          const json: any = await res.json();
          if (!res.ok) {
            const msg = json?.error_description ?? json?.error ?? `HTTP ${res.status}`;
            await prisma.microsoftConnection.update({ where: { userId }, data: { status: "ERROR", lastError: String(msg).slice(0, 500) } });
            throw new GraphNotConnectedError(`Microsoft 365 token refresh failed — please sign in with Microsoft again. (${String(msg).slice(0, 120)})`);
          }
          await prisma.microsoftConnection.update({
            where: { userId },
            data: {
              accessTokenEnc: encrypt(json.access_token),
              accessTokenExpiresAt: new Date(Date.now() + (json.expires_in ?? 3600) * 1000),
              ...(json.refresh_token ? { refreshTokenEnc: encrypt(json.refresh_token) } : {}),
              status: "CONNECTED",
              lastError: null,
            },
          });
          return json.access_token as string;
        } finally {
          refreshing.delete(userId);
        }
      })(),
    );
  }
  return refreshing.get(userId)!;
}

/**
 * Graph SDK client for a user. The SDK's default middleware includes a RetryHandler that honours
 * 429/503/504 `Retry-After` (Graph throttling) with exponential backoff.
 */
export function graphFor(userId: string): Client {
  return Client.initWithMiddleware({
    authProvider: { getAccessToken: () => getAccessToken(userId) },
    defaultVersion: "v1.0",
  });
}

export async function markGraphError(userId: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  logger.warn({ userId, err: msg }, "graph error");
  const status = (err as any)?.statusCode;
  if (status === 401 || status === 403 || err instanceof GraphNotConnectedError) {
    await prisma.microsoftConnection.updateMany({ where: { userId }, data: { status: "ERROR", lastError: msg.slice(0, 500) } });
  }
}
