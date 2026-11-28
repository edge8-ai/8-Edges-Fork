// Section 2 of the Profile board (RP.6; stories 6-11): the zones of BINs, each
// a name, a role, a pattern whose named parts are the walking order, and the
// rank that walks it before or after the other zones of its role. "Try a
// location" places a typed BIN code the way the engine will.
import { useState } from "react";
import { tryLocation, type Profile } from "@/entities/replenishment/client";
import { blankZone, listFrom, numberText, removeAt, replaceAt, requiredNumber } from "@/entities/replenishment/ui/profile-draft";
import { FieldIssue, ParsedInput, type Part } from "./editor-fields";

type Zone = Profile["zones"][number];

export function ZonesSection({ value: zones, onChange, issues, words }: Part<Zone[]> & { words: Profile["words"] }) {
  const [code, setCode] = useState("");
  const placed = tryLocation(zones, code);
  const set = (i: number, zone: Zone) => onChange(replaceAt(zones, i, zone));

  return (
    <section className="admin-card admin-section-card">
      <h2 className="admin-card-title">2. Locations and walking order</h2>
      <p className="admin-cell-muted">
        A zone is a family of BINs. The named parts of its pattern, read as numbers, are the order the operator walks. A location that fits no zone is ignored.
      </p>
      <FieldIssue issues={issues} path="zones" exact />
      <div className="admin-table-wrap admin-table-wrap--flat">
        <div className="admin-table-scroll">
          <table className="admin-table rp-profile-zones">
            <thead>
              <tr>
                <th>Zone</th>
                <th>Holds</th>
                <th>Pattern</th>
                <th>Walk by</th>
                <th>Walked</th>
                <th aria-label="Remove" />
              </tr>
            </thead>
            <tbody>
              {zones.map((zone, i) => (
                <tr key={zone.id}>
                  <td>
                    <input className="admin-input" aria-label="Zone name" value={zone.label} onChange={(e) => set(i, { ...zone, label: e.target.value })} />
                    <FieldIssue issues={issues} path={`zones.${i}.label`} />
                  </td>
                  <td>
                    <select className="admin-select" aria-label="Holds" value={zone.role} onChange={(e) => set(i, { ...zone, role: e.target.value as Zone["role"] })}>
                      <option value="pick">{words.pick}</option>
                      <option value="reserve">{words.reserve}</option>
                    </select>
                  </td>
                  <td className="rp-profile-pattern">
                    <input className="admin-input admin-cell-mono" aria-label="Pattern" value={zone.pattern} onChange={(e) => set(i, { ...zone, pattern: e.target.value })} />
                    <FieldIssue issues={issues} path={`zones.${i}.pattern`} />
                  </td>
                  <td>
                    <ParsedInput
                      aria-label="Walk by"
                      value={zone.walk}
                      format={(walk) => walk.join(", ")}
                      parse={listFrom}
                      onValue={(walk) => set(i, { ...zone, walk })}
                    />
                    <FieldIssue issues={issues} path={`zones.${i}.walk`} />
                  </td>
                  <td>
                    {/* Shown from 1, stored from 0: the zones of a role are walked in rank order. */}
                    <ParsedInput
                      className="admin-input rp-profile-num"
                      type="number"
                      min={1}
                      aria-label="Walked, in order"
                      value={zone.rank}
                      format={(rank) => numberText(rank + 1)}
                      parse={(text) => requiredNumber(text) - 1}
                      onValue={(rank) => set(i, { ...zone, rank })}
                    />
                    <FieldIssue issues={issues} path={`zones.${i}.rank`} />
                  </td>
                  <td>
                    <button type="button" className="admin-btn admin-btn--sm" onClick={() => onChange(removeAt(zones, i))}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <button type="button" className="admin-btn u-mt-1" onClick={() => onChange([...zones, blankZone(zones)])}>
        Add a zone
      </button>
      <div className="rp-profile-try">
        <label className="rp-profile-sentence admin-label">
          Try a location
          <input className="admin-input admin-cell-mono rp-profile-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="A BIN code" />
        </label>
        <span className={placed.ok ? "u-ok" : code.trim() === "" ? "admin-hint" : "u-err"} role="status">
          {placed.text}
        </span>
      </div>
    </section>
  );
}
