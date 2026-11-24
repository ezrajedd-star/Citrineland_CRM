"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action } from "@/lib/action";
import { anonymizeClient } from "@/server/privacy";

export const anonymize = action("clients:export", z.object({ clientId: z.string(), confirm: z.literal(true) }), async ({ clientId }, ctx) => {
  await anonymizeClient(clientId, ctx);
  revalidatePath("/admin/privacy");
  return { ok: true as const, message: "Client anonymized" };
});
