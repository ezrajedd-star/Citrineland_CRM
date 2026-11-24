/* Citrineland CRM seed — all data is fictional. Run: npm run db:seed */
import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";
import { DEFAULT_ROLES, type SystemRoleKey } from "../src/lib/rbac/permissions";
import { DEFAULT_SETTINGS } from "../src/lib/settings";
import { seedDemo } from "./seed-demo";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding roles…");
  const roles: Record<string, string> = {};
  for (const [key, def] of Object.entries(DEFAULT_ROLES) as [SystemRoleKey, (typeof DEFAULT_ROLES)[SystemRoleKey]][]) {
    const r = await prisma.role.upsert({
      where: { key },
      create: { key, name: def.name, description: def.description, isSystem: true, permissions: def.permissions as string[] },
      update: { isSystem: true, ...(key === "ADMIN" ? { permissions: ["*"] } : {}) },
    });
    roles[key] = r.id;
  }

  console.log("Seeding settings…");
  await prisma.setting.upsert({ where: { key: "app" }, create: { key: "app", value: DEFAULT_SETTINGS as any }, update: {} });

  const adminEmail = (process.env.BOOTSTRAP_ADMIN_EMAIL ?? "admin@citrineland.test").toLowerCase();
  const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!adminPassword) throw new Error("BOOTSTRAP_ADMIN_PASSWORD must be set to seed the bootstrap Admin.");
  console.log(`Seeding bootstrap admin ${adminEmail}…`);
  const passwordHash = await argon2.hash(adminPassword, { type: argon2.argon2id });
  await prisma.user.upsert({
    where: { email: adminEmail },
    create: { email: adminEmail, name: "System Administrator", roleId: roles.ADMIN, status: "ACTIVE", passwordHash },
    update: { roleId: roles.ADMIN, status: "ACTIVE", passwordHash, deletedAt: null },
  });

  if (process.env.SEED_DEMO !== "false") {
    await seedDemo(prisma, roles, passwordHash);
  }
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
