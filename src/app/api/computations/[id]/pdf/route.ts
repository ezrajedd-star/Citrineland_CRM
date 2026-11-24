import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/rbac/can";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/request";
import { renderComputationPdf } from "@/server/pdf/computation-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(user, "computations:view")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const { buffer, fileName } = await renderComputationPdf(id);
  await audit({ userId: user.id, ip: await clientIp() }, { entity: "SampleComputation", entityId: id, action: "download_pdf" });
  return new NextResponse(new Uint8Array(buffer), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${fileName}"`, "Cache-Control": "private, no-store" } });
}
