import type { PrismaClient } from "@prisma/client";

/** Demo data (obviously fictional). Extended in later phases. */
export async function seedDemo(prisma: PrismaClient, roles: Record<string, string>, demoPasswordHash: string) {
  const users = [
    { email: "sales.manager@citrineland.test", name: "Sofia Salazar", role: "SALES_MANAGER" },
    { email: "marketing.manager@citrineland.test", name: "Marco Mendoza", role: "MARKETING_MANAGER" },
    { email: "bng.staff@citrineland.test", name: "Bea Navarro", role: "BNG_STAFF" },
  ];
  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      create: { email: u.email, name: u.name, roleId: roles[u.role], status: "ACTIVE", passwordHash: demoPasswordHash },
      update: { roleId: roles[u.role], status: "ACTIVE", passwordHash: demoPasswordHash },
    });
  }
}
