import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { MemberProfile } from "@/entities/team/lib/data";

vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: unknown }) => <a href={href}>{children as never}</a> }));

import { PersonPostcard } from "./PersonPostcard";

// TH.9. The postcard teammates see and the one a person edits on My Profile
// are one component: `edit` puts editors in the four places a person fills in
// and shows those rows even while empty, and without it the card is exactly
// the read-only postcard it was.

const empty: MemberProfile = {
  id: "tm-1", personId: "p-1", name: "Teammate One", fullName: null, avatarUrl: null, positionTitle: "Engineer", departmentName: "Product",
  workLocation: null, employmentType: null, startDate: null, managerId: null, managerName: null,
  hometown: null, education: null, hobbies: [],
};

describe("PersonPostcard", () => {
  it("says nothing was added yet, and draws no editor, for a teammate's empty card", () => {
    const html = renderToStaticMarkup(<PersonPostcard profile={empty} orgName={null} />);
    expect(html).toContain("No hometown, education or hobbies added yet.");
    expect(html).not.toContain("Greetings from");
    expect(html).not.toContain("data-ed=");
  });

  it("shows the hometown, education and hobbies rows with their editors when the card is the person's own", () => {
    const edit = {
      photo: <button data-ed="photo">Change photo</button>,
      hometown: <input data-ed="hometown" />,
      education: <textarea data-ed="education" />,
      hobbies: <ul data-ed="hobbies" />,
    };
    const html = renderToStaticMarkup(<PersonPostcard profile={empty} orgName={null} edit={edit} />);
    for (const ed of ["photo", "hometown", "education", "hobbies"]) expect(html).toContain(`data-ed="${ed}"`);
    expect(html).toContain("Greetings from");
    expect(html).not.toContain("No hometown, education or hobbies added yet.");
  });

  it("draws a teammate's filled card as before, the value where an editor would be", () => {
    const html = renderToStaticMarkup(<PersonPostcard profile={{ ...empty, hometown: "Da Nang", education: "A university", hobbies: ["Chess"] }} orgName={null} />);
    expect(html).toContain("Da Nang");
    expect(html).toContain("<span>A university</span>");
    expect(html).toContain("Chess");
  });

  it("draws the badge stickers it is handed in a Badges row, and no row without them (LD.7b)", () => {
    const stickers = <ul className="bd-stickers"><li>Fire keeper I</li></ul>;
    const worn = renderToStaticMarkup(<PersonPostcard profile={empty} orgName={null} badges={stickers} />);
    expect(worn).toContain('<span class="tp-fact-label">Badges</span>');
    expect(worn).toContain("Fire keeper I");
    // A card with only badges is not "nothing added".
    expect(worn).not.toContain("No hometown, education or hobbies added yet.");
    const plain = renderToStaticMarkup(<PersonPostcard profile={empty} orgName={null} badges={null} />);
    expect(plain).not.toContain(">Badges<");
  });
});
