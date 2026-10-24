// What the member page hands the invite form besides the person (ADR 0013,
// AC.18): the type the row has now, whether the viewer manages access, and the
// roles they may grant on the invite. Roles are offered only to someone who
// manages access, and only the ones they may grant themselves.
import { loadGrantableRoles } from "@/entities/company-os";
import { getAccess } from "@/kernel/identity/access-request";

export async function loadInviteOptions(employmentType: string | null) {
  const access = await getAccess();
  const canGrantRoles = access?.may("access.manage") ?? false;
  const roles = access && canGrantRoles ? await loadGrantableRoles(access) : [];
  return { employmentType, roles, canGrantRoles };
}
