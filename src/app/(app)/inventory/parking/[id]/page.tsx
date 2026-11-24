import { requirePermission } from "@/lib/session";
import { InventoryItemDetail } from "@/components/inventory/item-detail";

export default async function ParkingPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("units:view");
  const { id } = await params;
  return <InventoryItemDetail kind="PARKING" id={id} user={user} />;
}
