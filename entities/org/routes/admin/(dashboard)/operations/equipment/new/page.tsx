import { requirePermission } from "@/kernel/identity/access-request";
import Link from "next/link";
import { PageHead } from "@/kernel/ui/PageHead";
import { listVendorOptions } from "@/entities/org/lib/equipment";
import { NewEquipmentForm } from "./NewEquipmentForm";

export const metadata = {
  title: "New equipment",
  description: "Add an item to the equipment register.",
};

export default async function NewEquipmentPage() {
  // The page's declared permission (ADR 0013).
  await requirePermission("org.operations");
  const vendors = await listVendorOptions();

  return (
    <>
      <PageHead
        eyebrow="Operations · Equipment"
        title="New equipment"
        sub="Add an item to the register. Only the name is required. It lands in stock, then Assign hands it to someone."
        action={
          <Link href="/admin/operations/equipment" className="admin-btn admin-btn--sm">
            Back to equipment
          </Link>
        }
      />
      <div className="admin-card admin-section-card admin-content">
        <NewEquipmentForm vendors={vendors} />
      </div>
    </>
  );
}
