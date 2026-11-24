import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

const PUBLIC_PREFIXES = ["/login", "/api/auth", "/api/public", "/api/health", "/f/", "/unsubscribe", "/embed/", "/favicon", "/brand/"];

function buildCsp(nonce: string, pathname: string) {
  const dev = process.env.NODE_ENV !== "production";
  const isPublicForm = pathname.startsWith("/f/");
  const frameAncestors = isPublicForm ? (process.env.PUBLIC_FORM_FRAME_ANCESTORS || "*") : "'none'";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}${isPublicForm ? " https://challenges.cloudflare.com" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self'${dev ? " ws:" : ""}`,
    `frame-src 'self'${isPublicForm ? " https://challenges.cloudflare.com" : ""}`,
    `frame-ancestors ${frameAncestors}`,
    "form-action 'self' https://login.microsoftonline.com",
    "base-uri 'self'",
    "object-src 'none'",
  ].join("; ");
}

export default auth((req) => {
  const { pathname, search } = req.nextUrl;
  const isPublic = pathname === "/" ? false : PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));

  if (!isPublic && !req.auth) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const url = new URL("/login", req.nextUrl.origin);
    if (pathname !== "/") url.searchParams.set("callbackUrl", pathname + search);
    return NextResponse.redirect(url);
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce, pathname);
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("Content-Security-Policy", csp);
  if (!pathname.startsWith("/f/")) res.headers.set("X-Frame-Options", "DENY");
  return res;
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|jpg|jpeg|gif|webp|ico)$).*)"],
};
