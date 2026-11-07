"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { DetailDrawer } from "@/kernel/ui/DetailDrawer";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import { Badge } from "@/kernel/ui/Badge";
import { formatDate, humanize } from "@/kernel/ui/format";
import type { VendorOption } from "@/entities/org/lib/equipment";
import { PersonSelect, type PersonOption } from "@/entities/crm/client";
import {
  EQUIPMENT_CONDITIONS,
  specSummary,
  statusLabel,
  statusTone,
  type AssignmentRow,
  type EquipmentRow,
} from "@/entities/org/lib/equipment-shared";
import {
  archiveEquipment,
  assignEquipment,
  getAssignments,
  restoreEquipment,
  returnEquipment,
  updateEquipment,
} from "./actions";
import { EquipmentForm, type EquipmentFormValues } from "./EquipmentForm";
import { saigonToday } from "@/kernel/config/dates";
import { personName } from "@/kernel/config/people-name";

// Client-owned shelf for the equipment list. One drawer at the provider level;
// rows only push the selected item into context. Custody history is fetched
// when the drawer opens (the list row doesn't carry it). Never goes through
// DataTable's server-rendered getRowPreview, where interactive content renders
// with dead clicks.

const ShelfContext = createContext<{ open: (row: EquipmentRow) => void } | null>(null);

export function EquipmentShelfProvider({
  children,
  people,
  vendors,
}: {
  children: ReactNode;
  people: PersonOption[];
  vendors: VendorOption[];
}) {
  const [selected, setSelected] = useState<EquipmentRow | null>(null);

  return (
    <ShelfContext.Provider value={{ open: setSelected }}>
      {children}
      <DetailDrawer
        open={!!selected}
        onClose={() => setSelected(null)}
        eyebrow={selected ? selected.asset_tag : "Equipment"}
        title={selected?.name ?? ""}
      >
        {selected && (
          <EquipmentShelfBody
            key={selected.id}
            row={selected}
            people={people}
            vendors={vendors}
            onClose={() => setSelected(null)}
          />
        )}
      </DetailDrawer>
    </ShelfContext.Provider>
  );
}

export function EquipmentShelfRow({ row, children }: { row: EquipmentRow; children: ReactNode }) {
  const ctx = useContext(ShelfContext);

  // The row carries role="button", so exclude it from the interactive-element
  // guard: closest() matches the element AND its ancestors, and a guard that
  // can match the row swallows every click.
  function hitsInnerInteractive(e: { target: EventTarget; currentTarget: HTMLTableRowElement }) {
    const hit = (e.target as HTMLElement).closest("a,button,input,select,label,[role=button]");
    return !!hit && hit !== e.currentTarget;
  }

  function onClick(e: MouseEvent<HTMLTableRowElement>) {
    if (hitsInnerInteractive(e)) return;
    ctx?.open(row);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTableRowElement>) {
    if (e.key === "Enter" || e.key === " ") {
      if (hitsInnerInteractive(e)) return;
      e.preventDefault();
      ctx?.open(row);
    }
  }

  return (
    <tr className="is-clickable" onClick={onClick} onKeyDown={onKeyDown} tabIndex={0} role="button" aria-haspopup="dialog">
      {children}
    </tr>
  );
}

function kv(label: string, value: ReactNode) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

function money(vnd: number | null, usd: number | null): string {
  const parts: string[] = [];
  if (vnd !== null && vnd !== undefined) parts.push(`${Number(vnd).toLocaleString("en-US")} VND`);
  if (usd !== null && usd !== undefined) parts.push(`$${Number(usd).toLocaleString("en-US")}`);
  return parts.join(" · ");
}

const today = () => saigonToday();

function EquipmentShelfBody({
  row,
  people,
  vendors,
  onClose,
}: {
  row: EquipmentRow;
  people: PersonOption[];
  vendors: VendorOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  // Local copy so an inline save reflects immediately without refetching.
  const [item, setItem] = useState(row);
  const [editing, setEditing] = useState(false);
  const [history, setHistory] = useState<AssignmentRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Custody form state.
  const [personId, setPersonId] = useState("");
  const [date, setDate] = useState(today());
  const [condition, setCondition] = useState("");
  const [note, setNote] = useState("");

  // Keyed on the row at the call site, so selecting a different item remounts
  // this body and every field above starts from its initial value. Resetting
  // them here instead rendered the previous item's values for one pass first.
  useEffect(() => {
    let live = true;
    getAssignments(row.id).then((rows) => {
      if (live) setHistory(rows);
    });
    return () => {
      live = false;
    };
  }, [row.id]);

  async function reload() {
    setHistory(await getAssignments(item.id));
    router.refresh();
  }

  async function saveField(patch: Partial<EquipmentFormValues>) {
    const r = await updateEquipment(item.id, patch);
    if (r.ok) {
      setItem((v) => ({ ...v, ...(patch as Partial<EquipmentRow>) }));
      router.refresh();
    }
    return r;
  }

  async function doAssign() {
    setBusy(true);
    setErr(null);
    const r = await assignEquipment({
      equipmentId: item.id,
      personId,
      assignedAt: date,
      conditionOut: condition || undefined,
      note: note || undefined,
    });
    setBusy(false);
    if (!r.ok) {
      setErr(r.error);
      return;
    }
    const holder = people.find((p) => p.id === personId) ?? null;
    setItem((v) => ({
      ...v,
      current_holder_id: personId,
      status: "in_use",
      // The name the picker showed, which is already the display name.
      holder: holder ? { id: holder.id, display_name: holder.name } : v.holder,
    }));
    setPersonId("");
    setNote("");
    setCondition("");
    await reload();
  }

  async function doReturn() {
    setBusy(true);
    setErr(null);
    const r = await returnEquipment({
      equipmentId: item.id,
      returnedAt: date,
      conditionIn: condition || undefined,
      note: note || undefined,
    });
    setBusy(false);
    if (!r.ok) {
      setErr(r.error);
      return;
    }
    setItem((v) => ({
      ...v,
      current_holder_id: null,
      holder: null,
      status: "in_stock",
      condition: condition || v.condition,
    }));
    setNote("");
    setCondition("");
    await reload();
  }

  if (editing) {
    return (
      <div className="admin-shelf-sections">
        <section>
          <div className="admin-shelf-heading">Edit equipment</div>
          <EquipmentForm
            vendors={vendors}
            initial={{
              type: (item.type as EquipmentFormValues["type"]) ?? "other",
              name: item.name,
              brand: item.brand ?? "",
              model: item.model ?? "",
              serial_number: item.serial_number ?? "",
              processor: item.processor ?? "",
              ram: item.ram ?? "",
              storage: item.storage ?? "",
              screen_size: item.screen_size?.toString() ?? "",
              purchase_date: item.purchase_date ?? "",
              model_year: item.model_year?.toString() ?? "",
              vendor_id: item.vendor_id ?? "",
              vendor_name_raw: item.vendor_name_raw ?? "",
              invoice_ref: item.invoice_ref ?? "",
              cost_vnd: item.cost_vnd?.toString() ?? "",
              cost_usd: item.cost_usd?.toString() ?? "",
              status: (item.status as EquipmentFormValues["status"]) ?? "in_stock",
              condition: item.condition ?? "",
              notes: item.notes ?? "",
              image_url: item.image_url ?? "",
            }}
            autosave={{ onField: saveField, onDone: () => setEditing(false) }}
          />
        </section>
      </div>
    );
  }

  const out = !!item.current_holder_id;
  const specs = specSummary(item);

  return (
    <div className="admin-shelf-sections">
      <section>
        <div className="admin-shelf-heading">
          Details
          <button type="button" className="admin-btn" onClick={() => setEditing(true)}>
            Edit
          </button>
        </div>
        <dl className="admin-kv">
          {kv("Status", <Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge>)}
          {kv("Held by", personName(item.holder, "Nobody, it is on the shelf"))}
          {kv("Type", humanize(item.type))}
          {kv("Brand / model", [item.brand, item.model].filter(Boolean).join(" "))}
          {kv("Serial number", item.serial_number ?? <span className="admin-cell-muted">Not recorded</span>)}
          {kv("Specs", specs)}
          {kv("Condition", item.condition ? humanize(item.condition) : null)}
          {kv("Purchased", item.purchase_date ? formatDate(item.purchase_date) : null)}
          {kv("Model year", item.model_year)}
          {kv("Vendor", item.vendor?.name ?? item.vendor_name_raw)}
          {kv("Invoice ref", item.invoice_ref)}
          {kv("Cost", money(item.cost_vnd, item.cost_usd))}
        </dl>
      </section>

      {item.notes && (
        <section>
          <div className="admin-shelf-heading">Notes</div>
          <div className="u-prewrap">{item.notes}</div>
        </section>
      )}

      {!item.archived_at && (
        <section>
          <div className="admin-shelf-heading">{out ? "Take it back" : "Hand it over"}</div>
          {err && <div className="admin-alert admin-alert--err u-mb-3">{err}</div>}

          {!out && (
            <div className="admin-field">
              <label className="admin-label">Who is taking it</label>
              <PersonSelect
                value={personId}
                onChange={setPersonId}
                emptyLabel="Pick a person…"
                options={people.map((p) => ({ value: p.id, label: p.name }))}
              />
            </div>
          )}

          <div className="u-grid-2 u-gap-3">
            <div className="admin-field">
              <label className="admin-label">{out ? "Return date" : "Handover date"}</label>
              <input type="date" className="admin-input" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="admin-field">
              <label className="admin-label">Condition {out ? "back" : "out"}</label>
              <select className="admin-select" value={condition} onChange={(e) => setCondition(e.target.value)}>
                <option value="">Not recorded</option>
                {EQUIPMENT_CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {humanize(c)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="admin-field">
            <label className="admin-label">Note</label>
            <input className="admin-input" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          {out ? (
            <button type="button" className="admin-btn admin-btn--primary" disabled={busy} onClick={doReturn}>
              {busy ? "Saving…" : `Return from ${personName(item.holder, "current holder")}`}
            </button>
          ) : (
            <button
              type="button"
              className="admin-btn admin-btn--primary"
              disabled={busy || !personId}
              onClick={doAssign}
            >
              {busy ? "Saving…" : "Assign"}
            </button>
          )}
          <div className="admin-hint u-mt-2">
            {out
              ? "Returning closes the current period and puts the item back in stock."
              : "Assigning opens a new custody period. Handing it to someone else later closes this one automatically, so nothing is overwritten."}
          </div>
        </section>
      )}

      <section>
        <div className="admin-shelf-heading">Custody history</div>
        {history === null ? (
          <div className="admin-cell-muted">Loading…</div>
        ) : history.length === 0 ? (
          <div className="admin-cell-muted">Never assigned.</div>
        ) : (
          <ul className="u-stack u-gap-3 u-m-0 u-p-0 u-list-plain">
            {history.map((h) => (
              <li
                key={h.id}
                className="admin-quote"
              >
                <div className="admin-cell-strong">
                  {personName(h.person, "Unknown person")}{" "}
                  {!h.returned_at && <Badge tone="ok">Current</Badge>}
                </div>
                <div className="admin-cell-muted">
                  {formatDate(h.assigned_at)} to {h.returned_at ? formatDate(h.returned_at) : "now"}
                  {h.condition_out && ` · out ${h.condition_out}`}
                  {h.condition_in && ` · back ${h.condition_in}`}
                </div>
                {h.note && <div className="u-mt-1">{h.note}</div>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="admin-shelf-heading">{item.archived_at ? "Archived" : "Archive"}</div>
        {item.archived_at ? (
          <ConfirmButton
            className="admin-btn"
            label="Restore equipment"
            title="Restore equipment"
            body={`Restore ${item.name} to the active register?`}
            confirmLabel="Restore"
            onConfirm={() => restoreEquipment(item.id)}
            onDone={() => {
              onClose();
              router.refresh();
            }}
          />
        ) : (
          <ConfirmButton
            label="Archive equipment"
            title="Archive equipment"
            body={
              out
                ? `Archive ${item.name}? It is currently with ${personName(item.holder, "someone")}, so that custody period will be closed first. It can be restored from the archived view.`
                : `Archive ${item.name}? It disappears from the register but can be restored from the archived view.`
            }
            confirmLabel="Archive"
            onConfirm={() => archiveEquipment(item.id)}
            onDone={() => {
              onClose();
              router.refresh();
            }}
          />
        )}
      </section>
    </div>
  );
}
