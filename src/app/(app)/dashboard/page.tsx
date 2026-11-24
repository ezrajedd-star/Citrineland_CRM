import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/app/page";

export default async function Dashboard() {
  const user = await requireUser();
  return <PageHeader title={`Welcome, ${user.name.split(" ")[0]}`} description={user.roleName} />;
}
