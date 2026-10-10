import { describe, expect, it } from "vitest";
import { NOT_A_MINUTES_LINK, parseLarkMinutesLink } from "./lark-minutes-link";

const HOST = "acme.sg.larksuite.com";
const TOKEN = "obsgabcdefghij1234567890";

describe("parseLarkMinutesLink", () => {
  it("takes the token from a recording's copied link, dropping Lark's share parameters", () => {
    expect(parseLarkMinutesLink(`  https://acme.sg.larksuite.com/minutes/${TOKEN}?from=from_copylink#t=12  `, HOST)).toEqual({
      ok: true,
      token: TOKEN,
      url: `https://${HOST}/minutes/${TOKEN}`,
    });
  });

  it("accepts the workspace host in any case", () => {
    expect(parseLarkMinutesLink(`https://ACME.sg.larksuite.com/minutes/${TOKEN}/`, HOST)).toMatchObject({ ok: true, token: TOKEN });
  });

  it("refuses what is not a recording", () => {
    for (const raw of [
      "obsgabcdefghij1234567890",
      `http://${HOST}/minutes/${TOKEN}`,
      `https://${HOST}/minutes/home`,
      `https://${HOST}/minutes/me`,
      `https://${HOST}/docx/${TOKEN}`,
      `https://${HOST}/minutes/${TOKEN}/transcript`,
      "https://zoom.us/rec/share/abcdefghijklmnopqrstuvwx",
    ]) {
      expect(parseLarkMinutesLink(raw, HOST)).toEqual({ ok: false, error: NOT_A_MINUTES_LINK });
    }
  });

  it("refuses another tenant's recording, and a look-alike host", () => {
    for (const host of ["other.larksuite.com", "acme.sg.larksuite.com.evil.example", "evil.example"]) {
      const out = parseLarkMinutesLink(`https://${host}/minutes/${TOKEN}`, HOST);
      expect(out.ok).toBe(false);
      if (!out.ok) expect(out.error).toContain("not on our Lark workspace");
    }
  });

  it("refuses everything when no workspace is configured, because it cannot tell ours from anyone's", () => {
    const out = parseLarkMinutesLink(`https://${HOST}/minutes/${TOKEN}`, null);
    expect(out.ok).toBe(false);
  });

  it("asks for a link when given nothing", () => {
    expect(parseLarkMinutesLink("   ", HOST)).toEqual({ ok: false, error: "Paste the Lark Minutes link of the meeting." });
  });
});
