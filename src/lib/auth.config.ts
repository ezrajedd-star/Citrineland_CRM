import type { NextAuthConfig } from "next-auth";

/** Edge-safe base config (used by middleware). Providers and DB callbacks are added in auth.ts. */
export const authConfig = {
  pages: { signIn: "/login", error: "/login" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  trustHost: true,
  providers: [],
  callbacks: {
    authorized({ auth }) {
      return !!auth?.user;
    },
  },
} satisfies NextAuthConfig;
