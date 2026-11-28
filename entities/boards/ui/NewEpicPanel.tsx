"use client";

import { useState } from "react";
import { useBoardActionRunner } from "./useBoardActionRunner";
import { NewEpicForm } from "./NewEpicForm";

// The New epic form with its own action runner and error banner, so the epics
// page itself can stay a server-rendered DataTable.
export function NewEpicPanel({ boardId, slug }: { boardId: string; slug: string }) {
  const [banner, setBanner] = useState<string | null>(null);
  const { saving, run } = useBoardActionRunner(setBanner);
  return (
    <div className="u-mt-5">
      {banner && <div className="admin-alert admin-alert--err u-mb-3">{banner}</div>}
      <NewEpicForm boardId={boardId} slug={slug} saving={saving} run={run} onError={setBanner} />
    </div>
  );
}
