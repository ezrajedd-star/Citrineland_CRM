import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    let worker: { lastHeartbeat: string | null; healthy: boolean } = { lastHeartbeat: null, healthy: false };
    const hb = await prisma.setting.findUnique({ where: { key: "worker.heartbeat" } });
    if (hb) {
      const at = new Date(String((hb.value as any)?.at));
      worker = { lastHeartbeat: at.toISOString(), healthy: Date.now() - at.getTime() < 5 * 60_000 };
    }
    return NextResponse.json({ status: "ok", db: "ok", worker, latencyMs: Date.now() - started, version: process.env.APP_VERSION ?? "dev" });
  } catch {
    return NextResponse.json({ status: "error", db: "unreachable" }, { status: 503 });
  }
}
