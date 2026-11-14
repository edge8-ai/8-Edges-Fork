"use client";

import { useRouter } from "next/navigation";
import type { VendorOption } from "@/entities/org/lib/equipment";
import { createEquipment } from "../actions";
import { EquipmentForm, type EquipmentFormValues } from "../EquipmentForm";

export function NewEquipmentForm({ vendors }: { vendors: VendorOption[] }) {
  const router = useRouter();

  async function submit(values: EquipmentFormValues) {
    const r = await createEquipment(values);
    if (r.ok) {
      router.push("/admin/operations/equipment");
      router.refresh();
    }
    return r;
  }

  return <EquipmentForm vendors={vendors} submitLabel="Create equipment" onSubmit={submit} />;
}
