"use client";

import { useRouter } from "next/navigation";
import { VendorForm, type VendorFormValues } from "@/entities/company-os/client";
import { createTeamVendor } from "../actions";

export function NewTeamVendorForm() {
  const router = useRouter();

  async function submit(values: VendorFormValues) {
    const r = await createTeamVendor(values);
    if (r.ok) {
      router.push("/team/vendors");
      router.refresh();
    }
    return r;
  }

  // hideFinancial leaves Tax ID and Bank info off the form; createTeamVendor
  // drops them server-side regardless of what the client sends.
  return <VendorForm submitLabel="Create vendor" onSubmit={submit} hideFinancial />;
}
