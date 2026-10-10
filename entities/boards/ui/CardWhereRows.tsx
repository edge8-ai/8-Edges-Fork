"use client";

import type { Dispatch, SetStateAction } from "react";
import type { WorkboardData } from "@/entities/boards/lib/workboard";
import { INTERNAL, type Form } from "./board-view-types";
import { CardPillPicker, PillOption } from "./CardPillPicker";

/**
 * Client, then brand: where a card belongs, asked before anything that
 * depends on it (W.168). Dave, 2026-10-06: "Client should be the first thing
 * you choose because you need to choose client before you can choose the brand
 * and the sprint". A client can run several boards (Payroll IQ and APA Company
 * OS are both Australian Payroll Association's), and sprints and epics belong
 * to one board, so the order is the business's own.
 *
 * Until W.168 a new card asked for its client at the bottom of the drawer,
 * below the description, while the epic and sprint sat at the top, and
 * choosing the client cleared the epic and sprint already picked. Now the two
 * rows sit under the title; the sprint and epic stay shut until the brand is
 * known (CardPills). A client with one board has its brand filled in.
 *
 * An existing card names both, read-only: a card does not move between
 * clients from here. On a single board's page there is nothing to choose, so
 * neither row is drawn.
 */
export function CardWhereRows({
  form,
  setForm,
  data,
  readOnly,
}: {
  form: Form;
  setForm: Dispatch<SetStateAction<Form | null>>;
  data: WorkboardData;
  readOnly: boolean;
}) {
  if (data.boards.length <= 1) return null;
  const board = data.boards.find((b) => b.id === form.boardId);

  if (form.id || readOnly) {
    if (!board) return null;
    return (
      <div className="wb-core-fields wb-where" role="group" aria-label="Client and brand">
        <div className="wb-core-row">
          <span className="wb-core-label">Client</span>
          <span className="wb-core-value wb-where-fixed">{board.client_name ?? "Internal"}</span>
        </div>
        <div className="wb-core-row">
          <span className="wb-core-label">Brand</span>
          <span className="wb-core-value wb-where-fixed">{board.name}</span>
        </div>
      </div>
    );
  }

  const boardsOf = (clientId: string) =>
    data.boards.filter((b) => (clientId === INTERNAL ? b.client_company_id === null : b.client_company_id === clientId));
  const hasInternal = data.boards.some((b) => b.client_company_id === null);
  const clientName = form.clientId === INTERNAL ? "Internal" : data.clients.find((c) => c.id === form.clientId)?.name;
  const brands = form.clientId ? boardsOf(form.clientId) : [];

  // A new client clears what belonged to the old one's board: a sprint, an
  // epic and a roadmap item each belong to one board. A client with one board
  // has its brand chosen with it; one with several waits for the person.
  function pickClient(clientId: string) {
    const own = boardsOf(clientId);
    setForm((f) => (f ? { ...f, clientId, boardId: own.length === 1 ? own[0].id : "", internal: false, roadmapItemId: "", sprintId: "", epicId: "" } : f));
  }
  function pickBrand(boardId: string) {
    setForm((f) => (f ? { ...f, boardId, roadmapItemId: "", sprintId: "", epicId: "" } : f));
  }

  return (
    <div className="wb-core-fields wb-where" role="group" aria-label="Client and brand">
      <div className="wb-core-row">
        <span className="wb-core-label">Client</span>
        <span className="wb-core-value">
          <CardPillPicker
            empty={!clientName}
            caret
            className={clientName ? undefined : "is-next"}
            label={<span className="wb-pill-text">{clientName ?? "Choose a client…"}</span>}
            ariaLabel={clientName ? `Client: ${clientName}. Change it` : "Client: none. Choose one first"}
            panelLabel="Choose a client"
          >
            {(close) => (
              <div className="wb-pill-options">
                {data.clients.map((c) => (
                  <PillOption key={c.id} current={c.id === form.clientId} onChoose={() => { pickClient(c.id); close(); }}>
                    <span className="wb-pill-option-name">{c.name}</span>
                  </PillOption>
                ))}
                {hasInternal && (
                  <PillOption current={form.clientId === INTERNAL} onChoose={() => { pickClient(INTERNAL); close(); }}>
                    <span className="wb-pill-option-name">Internal</span>
                  </PillOption>
                )}
              </div>
            )}
          </CardPillPicker>
          {!clientName && <span className="wb-core-note">Everything below depends on it.</span>}
        </span>
      </div>
      <div className="wb-core-row">
        <span className="wb-core-label">Brand</span>
        <span className="wb-core-value">
          {!clientName ? (
            <button type="button" className="wb-pill is-empty" disabled>
              Choose a client first
            </button>
          ) : brands.length === 1 ? (
            <>
              <span className="wb-pill is-static">{brands[0].name}</span>
              <span className="wb-core-note">Its only brand.</span>
            </>
          ) : (
            <CardPillPicker
              empty={!board}
              caret
              className={board ? undefined : "is-next"}
              label={<span className="wb-pill-text">{board?.name ?? "Choose a brand…"}</span>}
              ariaLabel={board ? `Brand: ${board.name}. Change it` : "Brand: none. Choose one"}
              panelLabel="Choose a brand"
            >
              {(close) => (
                <div className="wb-pill-options">
                  {brands.map((b) => (
                    <PillOption key={b.id} current={b.id === form.boardId} onChoose={() => { pickBrand(b.id); close(); }}>
                      <span className="wb-pill-option-name">{b.name}</span>
                    </PillOption>
                  ))}
                </div>
              )}
            </CardPillPicker>
          )}
        </span>
      </div>
    </div>
  );
}
