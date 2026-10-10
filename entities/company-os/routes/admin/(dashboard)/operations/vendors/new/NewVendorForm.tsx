"use client";

import { useRouter } from "next/navigation";
import { createVendor } from "../actions";
import { VendorForm, type VendorFormValues } from "@/entities/company-os/ui/vendors/VendorForm";

export function NewVendorForm() {
  const router = useRouter();

  async function submit(values: VendorFormValues) {
    const r = await createVendor(values);
    if (r.ok) {
      router.push("/admin/operations/vendors");
      router.refresh();
    }
    return r;
  }

  return <VendorForm submitLabel="Create vendor" onSubmit={submit} />;
}
