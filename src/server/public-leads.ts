import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { logger } from "@/lib/logger";
import { publicLeadSchema } from "@/lib/validation/schemas";
import { SYSTEM_CTX } from "@/lib/audit";
import { createLead } from "./leads";
import { logActivity } from "./activities";

export async function verifyTurnstile(token: string | null | undefined, ip: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (process.env.NODE_ENV === "production") logger.warn("TURNSTILE_SECRET_KEY not set — CAPTCHA disabled");
    return true;
  }
  if (!token) return false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, ...(ip ? { remoteip: ip } : {}) }),
    });
    const j: any = await res.json();
    return Boolean(j.success);
  } catch (e) {
    logger.error({ err: e }, "turnstile verify failed");
    return false;
  }
}

/**
 * Create a lead from the public web form. If an open lead already exists with the same email or mobile,
 * the inquiry is added to that lead's timeline instead of creating a duplicate.
 */
export async function submitPublicLead(raw: unknown, ip: string | null): Promise<{ ok: true; message: string } | { ok: false; status: number; error: string; fieldErrors?: Record<string, string[] | undefined> }> {
  const settings = await getSettings();
  if (!settings.webForm.enabled) return { ok: false, status: 403, error: "Web form is disabled" };
  const parsed = publicLeadSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, status: 422, error: "Please check the form.", fieldErrors: parsed.error.flatten().fieldErrors };
  const d = parsed.data;
  if (d.website) return { ok: true, message: settings.webForm.successMessage }; // honeypot: silently accept bots
  if (!d.email && !d.mobile) return { ok: false, status: 422, error: "Enter an email or mobile number.", fieldErrors: { mobile: ["Email or mobile is required"] } };
  if (!(await verifyTurnstile(d.captchaToken, ip))) return { ok: false, status: 400, error: "CAPTCHA verification failed. Please try again." };

  const [dev, campaign] = await Promise.all([
    d.developmentCode ? prisma.development.findFirst({ where: { code: d.developmentCode.toUpperCase(), deletedAt: null } }) : null,
    d.utm_campaign ? prisma.campaign.findFirst({ where: { code: d.utm_campaign.toLowerCase(), deletedAt: null } }) : null,
  ]);
  const existing = await prisma.lead.findFirst({
    where: { deletedAt: null, stage: { isLost: false }, OR: [...(d.email ? [{ email: { equals: d.email, mode: "insensitive" as const } }] : []), ...(d.mobile ? [{ mobile: d.mobile }] : [])] },
  });
  const note = [d.message, d.unitTypePref ? `Unit type: ${d.unitTypePref}` : null, dev ? `Development: ${dev.name}` : null, d.utm_source ? `UTM: ${[d.utm_source, d.utm_medium, d.utm_campaign].filter(Boolean).join(" / ")}` : null].filter(Boolean).join("\n");
  if (existing) {
    await logActivity({ type: "NOTE", subject: "New web inquiry (existing lead)", body: note || null, leadId: existing.id });
    if (dev) await prisma.lead.update({ where: { id: existing.id }, data: { developments: { connect: { id: dev.id } } } });
    return { ok: true, message: settings.webForm.successMessage };
  }
  const sourceCode = d.utm_source?.toLowerCase().includes("facebook") || d.utm_source?.toLowerCase() === "fb" ? "FACEBOOK" : settings.webForm.defaultSourceCode;
  await createLead(
    {
      firstName: d.firstName,
      lastName: d.lastName,
      email: d.email,
      mobile: d.mobile,
      sourceCode,
      campaignId: campaign?.id ?? null,
      developmentIds: dev ? [dev.id] : [],
      unitTypePref: d.unitTypePref ?? null,
      privacyConsent: d.privacyConsent,
      notes: note || null,
      utm: { source: d.utm_source, medium: d.utm_medium, campaign: d.utm_campaign, term: d.utm_term, content: d.utm_content },
    },
    SYSTEM_CTX,
  );
  return { ok: true, message: settings.webForm.successMessage };
}
