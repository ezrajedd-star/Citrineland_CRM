import { requirePermission } from "@/lib/session";
import { InventoryItemDetail } from "@/components/inventory/item-detail";

export default async function UnitPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("units:view");
  const { id } = await params;
  return <InventoryItemDetail kind="UNIT" id={id} user={user} />;
}
