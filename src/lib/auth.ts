import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { randomBytes } from "node:crypto";
import argon2 from "argon2";
import { authConfig } from "./auth.config";
import { prisma } from "./db";
import { getSettings } from "./settings";
import { clientIp, userAgent } from "./request";
import { rateLimit, resetRateLimit } from "./ratelimit";
import { encrypt } from "./crypto";
import { logger } from "./logger";

export const GRAPH_SCOPES = ["openid", "profile", "email", "offline_access", "User.Read", "Mail.Read", "Mail.Send", "Calendars.ReadWrite"];

export const entraConfigured = Boolean(
  process.env.AUTH_MICROSOFT_ENTRA_ID_ID && process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET && process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
);

class NotAllowed extends CredentialsSignin {
  code = "invalid";
}
class RateLimited extends CredentialsSignin {
  code = "rate_limited";
}

async function logAuth(type: "SIGN_IN" | "SIGN_IN_FAILED" | "SIGN_OUT" | "FORCED_SIGN_OUT", data: { userId?: string | null; email?: string | null; provider?: string; reason?: string }) {
  try {
    await prisma.authEvent.create({
      data: { type, userId: data.userId ?? null, email: data.email ?? null, provider: data.provider, reason: data.reason, ip: await clientIp(), userAgent: await userAgent() },
    });
  } catch (e) {
    logger.error({ err: e }, "failed to write auth event");
  }
}

const SESSION_MAX_AGE_S = 60 * 60 * 12;

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    ...(entraConfigured
      ? [
          MicrosoftEntraID({
            clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
            clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
            issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
            authorization: { params: { scope: GRAPH_SCOPES.join(" "), prompt: "select_account" } },
          }),
        ]
      : []),
    Credentials({
      id: "password",
      name: "Email and password",
      credentials: { email: { label: "Email" }, password: { label: "Password", type: "password" } },
      async authorize(raw) {
        const email = String(raw?.email ?? "").trim().toLowerCase();
        const password = String(raw?.password ?? "");
        const ip = (await clientIp()) ?? "unknown";
        const rl = rateLimit(`login:${ip}:${email}`, 5, 15 * 60_000);
        if (!rl.ok) {
          await logAuth("SIGN_IN_FAILED", { email, provider: "password", reason: "rate_limited" });
          throw new RateLimited();
        }
        const settings = await getSettings();
        const user = await prisma.user.findUnique({ where: { email }, include: { role: true } });
        const demo = process.env.DEMO_PASSWORD_LOGIN === "true";
        const allowed =
          user &&
          !user.deletedAt &&
          user.status === "ACTIVE" &&
          user.passwordHash &&
          // Password login is for the bootstrap Admin only, unless demo mode is explicitly on (never in production).
          ((settings.passwordLoginEnabled && user.role.key === "ADMIN") || demo);
        if (!allowed || !(await argon2.verify(user!.passwordHash!, password).catch(() => false))) {
          await logAuth("SIGN_IN_FAILED", { email, userId: user?.id, provider: "password", reason: "invalid_credentials" });
          throw new NotAllowed();
        }
        resetRateLimit(`login:${ip}:${email}`);
        return { id: user!.id, email: user!.email, name: user!.name };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account, profile }) {
      if (account?.provider !== "microsoft-entra-id") return true; // credentials already validated
      const email = String((profile as any)?.email ?? (profile as any)?.preferred_username ?? user.email ?? "")
        .trim()
        .toLowerCase();
      const dbUser = email ? await prisma.user.findUnique({ where: { email } }) : null;
      if (!dbUser || dbUser.deletedAt || dbUser.status === "DEACTIVATED") {
        await logAuth("SIGN_IN_FAILED", { email, userId: dbUser?.id, provider: "microsoft-entra-id", reason: dbUser ? "deactivated" : "not_registered" });
        return `/login?error=${dbUser ? "Deactivated" : "NotRegistered"}`;
      }
      user.email = email;
      return true;
    },
    async jwt({ token, user, account }) {
      if (user && account) {
        const email = (user.email ?? "").toLowerCase();
        const dbUser = await prisma.user.findUnique({ where: { email } });
        if (!dbUser) return token;
        const sessionToken = randomBytes(32).toString("hex");
        await prisma.session.create({
          data: {
            sessionToken,
            userId: dbUser.id,
            provider: account.provider,
            expires: new Date(Date.now() + SESSION_MAX_AGE_S * 1000),
            ip: await clientIp(),
            userAgent: await userAgent(),
          },
        });
        await prisma.user.update({
          where: { id: dbUser.id },
          data: { lastLoginAt: new Date(), status: dbUser.status === "INVITED" ? "ACTIVE" : dbUser.status },
        });
        if (account.provider === "microsoft-entra-id" && account.refresh_token) {
          await prisma.microsoftConnection.upsert({
            where: { userId: dbUser.id },
            create: {
              userId: dbUser.id,
              email,
              msUserId: account.providerAccountId,
              refreshTokenEnc: encrypt(account.refresh_token),
              accessTokenEnc: account.access_token ? encrypt(account.access_token) : null,
              accessTokenExpiresAt: account.expires_at ? new Date(account.expires_at * 1000) : null,
              scopes: account.scope ?? GRAPH_SCOPES.join(" "),
              status: "CONNECTED",
            },
            update: {
              email,
              refreshTokenEnc: encrypt(account.refresh_token),
              accessTokenEnc: account.access_token ? encrypt(account.access_token) : null,
              accessTokenExpiresAt: account.expires_at ? new Date(account.expires_at * 1000) : null,
              scopes: account.scope ?? GRAPH_SCOPES.join(" "),
              status: "CONNECTED",
              lastError: null,
            },
          });
        }
        await logAuth("SIGN_IN", { userId: dbUser.id, email, provider: account.provider });
        token.sid = sessionToken;
        token.uid = dbUser.id;
      }
      return token;
    },
    async session({ session, token }) {
      (session as any).sid = token.sid;
      if (session.user) (session.user as any).id = token.uid;
      return session;
    },
  },
  events: {
    async signOut(message) {
      const token = "token" in message ? message.token : null;
      const sid = token?.sid as string | undefined;
      if (!sid) return;
      const s = await prisma.session.findUnique({ where: { sessionToken: sid } });
      if (s && !s.revokedAt) {
        await prisma.session.update({ where: { id: s.id }, data: { revokedAt: new Date(), revokedReason: "sign_out" } });
        await logAuth("SIGN_OUT", { userId: s.userId });
      }
    },
  },
});

declare module "next-auth" {
  interface Session {
    sid?: string;
  }
}
declare module "@auth/core/jwt" {
  interface JWT {
    sid?: string;
    uid?: string;
  }
}
