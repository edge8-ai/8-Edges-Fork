"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PREVIEW_SECONDS } from "@/entities/boards/lib/deliverable-rules";
import type { Deliverable } from "@/entities/boards/lib/deliverable-types";
import { mergeListed, onDeliverableArrived, withDeliverable, type ListApi, type ListJournal } from "./card-uploads";

/**
 * Signed previews last ten minutes for an image and an hour for a video, and a
 * card can stay open far longer. Reading the list again before the shorter
 * one runs out keeps every thumbnail link and player working (bug hunt B7).
 */
const REFRESH_MS = (PREVIEW_SECONDS - 60) * 1000;

type Listed = { ok: true; items: Deliverable[] } | { ok: false; error: string };

/**
 * A card's deliverables as the drawer shows them: the server's list, read when
 * the card opens and again before its signed previews expire, plus what
 * changes here meanwhile.
 *
 * A read never replaces the list wholesale (bug hunt F2, F23). Every read
 * keeps a journal of the rows added or removed here while it was in flight,
 * and its answer is merged with that journal, so a link added, an upload
 * finishing or an Undo landing during the read is not lost to a snapshot taken
 * before it.
 */
export function useDeliverableList(taskId: string, api: ListApi) {
  const [items, setItems] = useState<Deliverable[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const journals = useRef(new Set<ListJournal>());
  // The card a read's answer may still be written to; an answer for a card
  // the drawer has moved away from is dropped.
  const active = useRef<string | null>(null);

  /** Reads the list, journalling what changes here meanwhile, and merges the two. */
  const read = useCallback(
    (forTask: string): Promise<Listed> => {
      const journal: ListJournal = { added: new Map(), removed: new Set() };
      journals.current.add(journal);
      return api
        .list(forTask)
        .catch(() => null)
        .then((res): Listed => {
          journals.current.delete(journal);
          if (!res) return { ok: false, error: "The server did not answer. Reload the page to see the card's deliverables." };
          return res.ok ? { ok: true, items: mergeListed(res.items, journal) } : res;
        });
    },
    [api],
  );

  /** Shows a read's answer if the drawer is still on that card; the rows shown, or null. */
  const settle = useCallback((forTask: string, quiet: boolean, res: Listed): Deliverable[] | null => {
    if (active.current !== forTask) return null;
    if (!res.ok) {
      // A refresh that fails leaves the rows on screen as they were; only the
      // first read has nothing else to show.
      if (!quiet) setError(res.error);
      return null;
    }
    setItems(res.items);
    return res.items;
  }, []);

  useEffect(() => {
    active.current = taskId;
    void read(taskId).then((res) => settle(taskId, false, res));
    const timer = setInterval(() => void read(taskId).then((res) => settle(taskId, true, res)), REFRESH_MS);
    return () => {
      clearInterval(timer);
      if (active.current === taskId) active.current = null;
    };
  }, [taskId, read, settle]);

  /** A row that arrived here: a link added, a file confirmed, an Undo. */
  const arrive = useCallback((item: Deliverable) => {
    for (const j of journals.current) {
      j.added.set(item.id, item);
      j.removed.delete(item.id);
    }
    setItems((list) => withDeliverable(list, item));
  }, []);

  /** A row the server has archived. */
  const depart = useCallback((id: string) => {
    for (const j of journals.current) {
      j.removed.add(id);
      j.added.delete(id);
    }
    setItems((list) => (list ?? []).filter((x) => x.id !== id));
  }, []);

  // A file that finishes, or a row that Undo puts back, while the card is open
  // joins the list, whichever drawer removed it (bug hunt F19).
  useEffect(() => onDeliverableArrived(taskId, arrive), [taskId, arrive]);

  /** Reads the list again for fresh signed previews; the answer, or null. */
  const refresh = useCallback(async (): Promise<Deliverable[] | null> => {
    const forTask = active.current;
    return forTask ? settle(forTask, true, await read(forTask)) : null;
  }, [read, settle]);

  return { items, error, setError, arrive, depart, refresh };
}
