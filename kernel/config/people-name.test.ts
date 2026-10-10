import { describe, expect, it } from "vitest";
import { UNNAMED, actorDisplayName, greetingName, legalName, personName } from "./people-name";

// Three questions, three answers (S.14). One person, shaped the way the roster
// stores a Vietnamese name: full_name in Family Middle Given order, display_name
// in Given Family, a nickname, and a first name.
const HIEU = {
  display_name: "Hiếu Nguyễn",
  preferred_name: "Harry",
  first_name: "Hiếu",
  full_name: "Nguyễn Văn Hiếu",
  email: "hieu@example.com",
};

describe("personName — the name to show", () => {
  it("is the display name, because it alone is reliably Given + Family", () => {
    expect(personName(HIEU)).toBe("Hiếu Nguyễn");
  });

  it("falls back through the nickname, the stored full name and the email", () => {
    expect(personName({ ...HIEU, display_name: null })).toBe("Harry");
    expect(personName({ ...HIEU, display_name: null, preferred_name: null })).toBe("Nguyễn Văn Hiếu");
    expect(personName({ email: "x@example.com" })).toBe("x@example.com");
    expect(personName({})).toBe(UNNAMED);
  });
});

describe("greetingName — the name to address someone by", () => {
  it("is the name they asked to be called, then their first name", () => {
    expect(greetingName(HIEU, "there")).toBe("Harry");
    expect(greetingName({ ...HIEU, preferred_name: null }, "there")).toBe("Hiếu");
  });

  it("falls back to the given name, the first word of the display name (S.16.5)", () => {
    // display_name is Given + Family, so its first word is the given name.
    expect(greetingName({ ...HIEU, preferred_name: null, first_name: null }, "there")).toBe("Hiếu");
  });

  it("never greets by a full name or an email: past the given name it is the caller's word", () => {
    // full_name's first word is a family name for Vietnamese-order rows, and
    // "Hi john@x.com," is no greeting (Khoa, 2026-09-23).
    expect(greetingName({ full_name: "Nguyễn Văn Hiếu", email: "hieu@example.com" }, "there")).toBe("there");
    expect(greetingName({ email: "hieu@example.com" }, null)).toBeNull();
    expect(greetingName({}, "there")).toBe("there");
  });

  it("ignores blank values rather than greeting nobody", () => {
    expect(greetingName({ ...HIEU, preferred_name: "  " }, "there")).toBe("Hiếu");
  });
});

describe("greetingName when preferred_name holds a full name (S.16.15)", () => {
  // Production, 2026-09-23: 21 of 29 people with a preferred_name hold a
  // multi-word one, 14 of them equal to full_name. A nickname is one word; a
  // multi-word preferred_name is a full name filed in the wrong column, and a
  // greeting must never say a full name.
  const HIEU_FILED = { ...HIEU, preferred_name: "Nguyễn Văn Hiếu" };

  it("skips a multi-word preferred_name and greets by first_name", () => {
    expect(greetingName(HIEU_FILED, "there")).toBe("Hiếu");
  });

  it("falls to the given name from display_name when first_name is missing too", () => {
    expect(greetingName({ ...HIEU_FILED, first_name: null }, "there")).toBe("Hiếu");
  });

  it("still greets by a one-word nickname first", () => {
    expect(greetingName(HIEU, "there")).toBe("Harry");
  });

  it("greets by display_name's first word when preferred_name is that name, before first_name", () => {
    // The name the person goes by can start with a chosen name that first_name
    // does not hold; main greeted by the whole of it, first_name would be wrong.
    const tony = { preferred_name: "Tony Tran", display_name: "Tony Tran", first_name: "Tuấn", full_name: "Trần Anh Tuấn" };
    expect(greetingName(tony, "there")).toBe("Tony");
  });

  it("greets a Western-order name by its first word, and uses the caller's word when that is all there is", () => {
    expect(greetingName({ preferred_name: "An Nguyen", display_name: "An Nguyen" }, "there")).toBe("An");
    expect(greetingName({ preferred_name: "An Nguyen" }, "there")).toBe("there");
  });

  it("uses the caller's word, not the full name, when nothing else is known", () => {
    expect(greetingName({ preferred_name: "Nguyễn Văn Hiếu", full_name: "Nguyễn Văn Hiếu" }, null)).toBeNull();
  });
});

describe("legalName — the name on record", () => {
  it("is the stored full name, in whatever order it was recorded", () => {
    expect(legalName(HIEU)).toBe("Nguyễn Văn Hiếu");
  });

  it("falls back to the name to show when no full name is recorded", () => {
    expect(legalName({ ...HIEU, full_name: null })).toBe("Hiếu Nguyễn");
    expect(legalName({})).toBe(UNNAMED);
  });
});

describe("actorDisplayName — the signed-in person on /team and /portal", () => {
  it("is the given name when there is no preferred_name", () => {
    const actor = { preferred_name: null, first_name: "Hiếu", full_name: "Nguyễn Văn Hiếu", email: "hieu@example.com" };
    expect(actorDisplayName(actor)).toBe("Hiếu");
  });

  it("keeps naming a person in full when preferred_name holds their full name (S.16.15)", () => {
    // actor.displayName names the person to others and in audit labels, so the
    // greeting's one-word rule must not reach it.
    const actor = { preferred_name: "Nguyễn Văn Hiếu", first_name: "Hiếu", full_name: "Nguyễn Văn Hiếu", email: "hieu@example.com" };
    expect(actorDisplayName(actor)).toBe("Nguyễn Văn Hiếu");
  });

  it("trims the email it falls back to, and is UNNAMED when that is blank too", () => {
    const none = { preferred_name: null, first_name: null, full_name: null };
    expect(actorDisplayName({ ...none, email: "  hieu@example.com " })).toBe("hieu@example.com");
    expect(actorDisplayName({ ...none, email: "  " })).toBe(UNNAMED);
  });

  it("falls back to the name to show, because a shell header must name the person", () => {
    const actor = { preferred_name: null, first_name: null, full_name: "Nguyễn Văn Hiếu", email: "hieu@example.com" };
    expect(actorDisplayName(actor)).toBe("Nguyễn Văn Hiếu");
  });
});

describe("a placeholder of the caller's own (S.16)", () => {
  // A screen that already says "(no name)", or hides the field on null, keeps
  // doing so: the placeholder replaces only the kernel's own for a person who
  // has no name and no email, or for no person at all.
  it("is returned for a person with nothing to show, and for no person", () => {
    expect(personName({}, "(no name)")).toBe("(no name)");
    expect(personName(null, "(no name)")).toBe("(no name)");
    expect(personName(undefined, null)).toBeNull();
    expect(greetingName({}, "friend")).toBe("friend");
    expect(legalName({}, null)).toBeNull();
  });

  it("never wins over a name the person has", () => {
    expect(personName(HIEU, "(no name)")).toBe("Hiếu Nguyễn");
    expect(greetingName({ first_name: "Hiếu", email: "hieu@example.com" }, "there")).toBe("Hiếu");
    expect(legalName({ display_name: "Hiếu Nguyễn" }, null)).toBe("Hiếu Nguyễn");
  });

  it("leaves the kernel's own placeholders alone when none is given", () => {
    expect(personName(null)).toBe("Unknown");
    expect(personName({})).toBe(UNNAMED);
  });
});

describe("the actor's name and greeting, kept apart (S.16.17)", () => {
  // The table covers every source order actorDisplayName reads, with and
  // without display_name, which it never reads: adding a greeting beside it
  // must not move a single name the 38 call sites print.
  const was = (p: { preferred_name: string | null; first_name: string | null; full_name: string | null; email: string }) =>
    p.preferred_name?.trim() || p.first_name?.trim() || p.full_name?.trim() || p.email.trim() || UNNAMED;
  const rows = [
    { display_name: "Hiếu Nguyễn", preferred_name: "Harry", first_name: "Hiếu", full_name: "Nguyễn Văn Hiếu", email: "h@x.test" },
    { display_name: null, preferred_name: "Nguyễn Văn Hiếu", first_name: "Hiếu", full_name: "Nguyễn Văn Hiếu", email: "h@x.test" },
    { display_name: null, preferred_name: null, first_name: "Hiếu", full_name: "Nguyễn Văn Hiếu", email: "h@x.test" },
    { display_name: null, preferred_name: null, first_name: null, full_name: "Nguyễn Văn Hiếu", email: "h@x.test" },
    { display_name: "Tony Tran", preferred_name: "Tony Tran", first_name: "Tuấn", full_name: "Trần Anh Tuấn", email: "t@x.test" },
    { display_name: null, preferred_name: "  ", first_name: " ", full_name: null, email: " a@x.test " },
    { display_name: null, preferred_name: null, first_name: null, full_name: null, email: "" },
  ];

  it.each(rows)("names $full_name / $email exactly as before", (row) => {
    expect(actorDisplayName(row)).toBe(was(row));
  });

  it("greets as greetingName does, whether or not display_name is set", () => {
    expect(rows.map((r) => greetingName(r, null))).toEqual(["Harry", "Hiếu", "Hiếu", null, "Tony", null, null]);
  });
});
