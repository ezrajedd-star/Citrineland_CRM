import { NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";
import { rateLimit } from "@/lib/ratelimit";
import { submitPublicLead } from "@/server/public-leads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cors(origin: string | null, allowed: string[]): Record<string, string> {
  const ok = origin && (allowed.includes(origin) || allowed.includes("*"));
  return ok ? { "Access-Control-Allow-Origin": origin!, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", Vary: "Origin" } : {};
}

export async function OPTIONS(req: Request) {
  const s = await getSettings();
  return new NextResponse(null, { status: 204, headers: cors(req.headers.get("origin"), s.webForm.allowedOrigins) });
}

/**
 * Public web lead capture. Rate-limited per IP, CAPTCHA-protected (Cloudflare Turnstile), honeypot field `website`.
 * Accepts JSON or form-encoded bodies with UTM parameters (utm_source, utm_medium, utm_campaign, utm_term, utm_content).
 */
export async function POST(req: Request) {
  const s = await getSettings();
  const origin = req.headers.get("origin");
  const headers = cors(origin, s.webForm.allowedOrigins);
  const host = req.headers.get("host");
  const sameOrigin = origin && host && new URL(origin).host === host;
  if (origin && !sameOrigin && !("Access-Control-Allow-Origin" in headers)) return NextResponse.json({ error: "Origin not allowed" }, { status: 403 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? req.headers.get("x-real-ip") ?? "unknown";
  const rl = rateLimit(`public-lead:${ip}`, s.webForm.rateLimitPerHour, 3_600_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many submissions. Please try again later." }, { status: 429, headers: { ...headers, "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } });
  let body: Record<string, unknown>;
  const ct = req.headers.get("content-type") ?? "";
  try {
    if (ct.includes("application/json")) body = await req.json();
    else body = Object.fromEntries((await req.formData()).entries()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400, headers });
  }
  if ("cf-turnstile-response" in body && !body.captchaToken) body.captchaToken = body["cf-turnstile-response"];
  const r = await submitPublicLead(body, ip);
  if (!r.ok) return NextResponse.json({ error: r.error, fieldErrors: r.fieldErrors }, { status: r.status, headers });
  return NextResponse.json({ ok: true, message: r.message }, { headers });
}
