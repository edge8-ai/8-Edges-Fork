import { describe, expect, it, vi } from "vitest";

vi.mock("postgres", () => ({ default: vi.fn() }));
import { DEAL_CLOSE_MESSAGE, dealCloseRefusal } from "./db";

// The assistant may edit a deal's fields but never move or close it: only the
// board's move carries a close's consequences (A.32, ADR-0011).
describe("dealCloseRefusal", () => {
  const refused = [
    "update company_os.deals set status = 'won' where id = 'x'",
    "UPDATE deals SET stage_id = 'y' WHERE id = 'x'",
    'update "company_os"."deals" set "closed_at" = now() where id = \'x\'',
    "update company_os.deals set title = 'T', status='lost' where id = 'x'",
    "update company_os.deals set lost_reason = 'price', stage_id = 'l' where id = 'x'",
    // The forms the batch review found passing (A.32.7).
    "update company_os.deals set (stage_id, status) = ('s', 'won') where id = 'x'",
    "update only company_os.deals set stage_id = 's' where id = 'x'",
    "update /*c*/ company_os.deals set stage_id = 's' where id = 'x'",
    "update company_os.deals set next_step = (select 'a' where true), stage_id = 's' where id = 'x'",
    "update company_os.deals as d set status = 'won' where d.id = 'x'",
  ];
  const allowed = [
    "update company_os.deals set next_step = 'call back' where id = 'x'",
    // A WHERE that filters on status is not a status write.
    "update company_os.deals set next_step = 'x' where status = 'open' and id = 'y'",
    "update company_os.deals set next_step = 'x' where id in (select id from company_os.deals where status = 'open')",
    "update company_os.people set status = 'active' where id = 'x'",
    "update company_os.deal_notes set status = 'x' where id = 'y'",
    "insert into company_os.deals (title, pipeline_id, stage_id, person_id) values ('t', 'p', 's', 'x')",
  ];
  for (const q of refused) it(`refuses: ${q}`, () => expect(dealCloseRefusal(q)).toBe(DEAL_CLOSE_MESSAGE));
  for (const q of allowed) it(`allows: ${q}`, () => expect(dealCloseRefusal(q)).toBeNull());
});
