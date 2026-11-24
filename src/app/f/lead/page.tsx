import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { PublicLeadForm } from "./form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inquire" };

/** Hosted, embeddable (iframe) lead form for the Citrineland website. Pass UTM params in the iframe URL. */
export default async function PublicFormPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const settings = await getSettings();
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const devs = await prisma.development.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { code: true, name: true } });
  if (!settings.webForm.enabled) return <p className="p-6 text-sm">This form is currently unavailable.</p>;
  return (
    <main className="min-h-screen bg-white p-4">
      <PublicLeadForm
        developments={devs}
        defaultDevelopment={sp.development}
        utm={{ utm_source: sp.utm_source, utm_medium: sp.utm_medium, utm_campaign: sp.utm_campaign, utm_term: sp.utm_term, utm_content: sp.utm_content }}
        siteKey={process.env.TURNSTILE_SITE_KEY ?? null}
        nonce={nonce}
      />
    </main>
  );
}
