import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// OV.6.2. Every field of My Profile has an accessible name: on 18 Oct 2026 all
// 21 inputs, selects and textareas were announced with none, because each
// visible label was a span bound to nothing.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: unknown }) => <a href={href}>{children as never}</a> }));
vi.mock("./actions", () => ({ saveOwnProfile: vi.fn() }));

import { ProfileEditor } from "./ProfileEditor";
import type { ProfileInput } from "./actions";
import type { MemberProfile } from "@/entities/team/lib/data";

const initial: ProfileInput = {
  preferredName: "", phone: "", personalEmail: "", emergencyContactName: "", emergencyContactPhone: "",
  gender: "", dateOfBirth: "", maritalStatus: "", hometown: "", education: "", hobbies: ["Chess"],
  currentAddress: "", permanentAddress: "", bankName: "", bankAccountNumber: "", bankBranch: "",
  taxCode: "", socialInsuranceNumber: "", nationalIdNumber: "", nationalIdIssueDate: "", nationalIdIssuePlace: "",
};
const upload = async () => ({ ok: true as const });
const avatar = async () => ({ ok: true as const, url: "" });
const card: MemberProfile = {
  id: "tm-1", personId: "p-1", name: "Teammate One", fullName: null, avatarUrl: null, positionTitle: "Engineer", departmentName: "Product",
  workLocation: null, employmentType: "full_time", startDate: "2026-06-05", managerId: null, managerName: null,
  hometown: null, education: null, hobbies: [],
};

const attr = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? null;

// TH.9: the postcard is the editor, so three of the fields (hometown,
// education, a new hobby) are on the card itself and named by aria-label; the
// other eighteen sit in the two cards under it with visible labels.
describe("ProfileEditor (OV.6.2)", () => {
  it("gives every field a name: a label bound to its id, or an aria-label", () => {
    const html = renderToStaticMarkup(
      <ProfileEditor
        initial={initial}
        card={card}
        orgName={null}
        workEmail="one@example.com"
        avatarAction={avatar}
        hasIdFront={false}
        hasIdBack={false}
        idFrontAction={upload}
        idBackAction={upload}
      />,
    );
    // The ID images upload through a hidden file input behind a named button.
    const fields = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]).filter((t) => attr(t, "type") !== "file");
    const labels = new Map([...html.matchAll(/<label\b[^>]*\sfor="([^"]+)"[^>]*>([^<]*)<\/label>/g)].map((m) => [m[1], m[2].trim()]));

    expect(fields).toHaveLength(21);
    const unnamed = fields.filter((t) => {
      const id = attr(t, "id");
      return !(id && labels.get(id)) && !attr(t, "aria-label");
    });
    expect(unnamed).toEqual([]);
    // Each label names one field, so no two fields share an id; the three on
    // the postcard carry an aria-label instead of an id.
    const ids = fields.map((t) => attr(t, "id")).filter(Boolean);
    expect(ids).toHaveLength(18);
    expect(new Set(ids).size).toBe(18);
  });
});
