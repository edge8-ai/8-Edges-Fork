// Fleet Fitness -> Operations board (task boards, the "agents file cards"
// routine). Files ONE "Review equipment" card and one subtask per laptop below
// the 24GB/512GB floor; checks a subtask off when a laptop passes or is retired.
// Idempotent: the parent dedupes on metadata.kind='parent', subtasks on
// metadata.asset_tag. Agent-filed rows carry metadata.source='agent' (AGENT
// badge). Also migrates the earlier flat one-card-per-laptop layout by archiving
// those cards. Run from the repo root: node scripts/boards/file-fleet-fitness-cards.mjs
import { sql } from "../crm/db.mjs";

const RAM_FLOOR_GB = 24;
const SSD_FLOOR_GB = 512;

// "16GB" -> 16, "1TB" -> 1024, "512GB PCIE" -> 512, junk -> null.
function parseGb(raw) {
  if (!raw) return null;
  const m = String(raw).match(/(\d+(?:\.\d+)?)\s*(tb|gb|t|g)\b/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return /^t/i.test(m[2]) ? Math.round(n * 1024) : Math.round(n);
}

const [board] = await sql`select id from company_os.boards where slug = 'operations' and archived_at is null`;
if (!board) {
  console.error("No Operations board found; nothing to do.");
  await sql.end();
  process.exit(0);
}

const cols = await sql`
  select id, is_done, position from company_os.board_columns
  where board_id = ${board.id} order by position`;
const intake = cols.find((c) => !c.is_done) ?? cols[0];
const doneCol = cols.find((c) => c.is_done) ?? null;
if (!intake) {
  console.error("Operations board has no columns.");
  await sql.end();
  process.exit(0);
}

// Migrate the earlier flat layout: archive top-level fleet cards that carried an
// asset_tag (one card per laptop). The collapsed layout uses a parent + subtasks.
const migrated = await sql`
  update company_os.tasks set archived_at = now(), archived_by = 'fleet-fitness-migrate'
  where board_id = ${board.id} and parent_task_id is null
    and metadata->>'routine' = 'fleet-fitness' and metadata ? 'asset_tag'
    and archived_at is null`;

// Find or create the single "Review equipment" parent card.
let [parent] = await sql`
  select id, board_column_id from company_os.tasks
  where board_id = ${board.id} and parent_task_id is null
    and metadata->>'routine' = 'fleet-fitness' and metadata->>'kind' = 'parent'
    and archived_at is null
  limit 1`;
if (!parent) {
  const [{ position }] = await sql`
    select coalesce(max(position), 0) + 1 as position from company_os.tasks
    where board_id = ${board.id} and board_column_id = ${intake.id} and archived_at is null`;
  const meta = { source: "agent", routine: "fleet-fitness", kind: "parent" };
  [parent] = await sql`
    insert into company_os.tasks (board_id, board_column_id, title, priority, status, position, metadata)
    values (${board.id}, ${intake.id}, 'Review equipment', 'p2', 'open', ${position}, ${sql.json(meta)})
    returning id, board_column_id`;
}

const laptops = await sql`select id, asset_tag, name, ram, storage, archived_at from company_os.equipment where type = 'laptop'`;
const subs = await sql`
  select id, status, metadata from company_os.tasks
  where parent_task_id = ${parent.id} and archived_at is null`;
const subByTag = new Map();
for (const s of subs) {
  const tag = s.metadata?.asset_tag;
  if (tag) subByTag.set(tag, s);
}

let filed = 0;
let cleared = 0;
let reopened = 0;
for (const l of laptops) {
  const ram = parseGb(l.ram);
  const ssd = parseGb(l.storage);
  const fails =
    l.archived_at == null && ((ram != null && ram < RAM_FLOOR_GB) || (ssd != null && ssd < SSD_FLOOR_GB));
  const existing = subByTag.get(l.asset_tag);

  if (fails && !existing) {
    const meta = {
      source: "agent",
      routine: "fleet-fitness",
      asset_tag: l.asset_tag,
      evidence: { ram_gb: ram, ssd_gb: ssd, floor: `${RAM_FLOOR_GB}GB / ${SSD_FLOOR_GB}GB` },
    };
    const title = `${l.name} (${l.asset_tag}): ${ram ?? "?"}GB RAM / ${ssd ?? "?"}GB SSD`;
    await sql`
      insert into company_os.tasks (board_id, parent_task_id, title, priority, status, position, metadata)
      values (${board.id}, ${parent.id}, ${title}, 'p2', 'open', 0, ${sql.json(meta)})`;
    filed++;
  } else if (fails && existing && existing.status === "done") {
    await sql`update company_os.tasks set status = 'open', completed_at = null where id = ${existing.id}`;
    reopened++;
  } else if (!fails && existing && existing.status !== "done") {
    await sql`update company_os.tasks set status = 'done', completed_at = now() where id = ${existing.id}`;
    cleared++;
  }
}

// Parent tracks its children: done (moved to Done) only when every subtask is done.
const [{ open_children }] = await sql`
  select count(*)::int as open_children from company_os.tasks
  where parent_task_id = ${parent.id} and status <> 'done' and archived_at is null`;
const [{ total_children }] = await sql`
  select count(*)::int as total_children from company_os.tasks
  where parent_task_id = ${parent.id} and archived_at is null`;
if (total_children > 0 && open_children === 0 && doneCol && parent.board_column_id !== doneCol.id) {
  await sql`update company_os.tasks set board_column_id = ${doneCol.id}, status = 'done', completed_at = now() where id = ${parent.id}`;
} else if (open_children > 0) {
  await sql`update company_os.tasks set status = 'open', completed_at = null where id = ${parent.id} and status = 'done'`;
}

console.log(
  `fleet-fitness -> Operations: migrated ${migrated.count ?? 0} flat card(s); subtasks filed ${filed}, cleared ${cleared}, reopened ${reopened}.`,
);
await sql.end();
