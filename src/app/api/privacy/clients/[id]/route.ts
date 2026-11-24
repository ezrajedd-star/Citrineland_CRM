import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/rbac/can";
import { clientIp } from "@/lib/request";
import { exportClientData } from "@/server/privacy";

export const dynamic = "force-dynamic";

/** JSON export of all data held about a client (RA 10173 access request). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(user, "clients:export")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const data = await exportClientData(id, { userId: user.id, ip: await clientIp() });
  return new NextResponse(JSON.stringify(data, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="client-${id}-data-export.json"`, "Cache-Control": "no-store" } });
}
