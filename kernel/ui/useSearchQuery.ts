"use client";

// The palette's query (S.1): one request per pause in typing. A newer query
// cancels the request still in flight (SR.1.7), and an answer to an older query
// is dropped, so a slow response can never replace a newer one. A query too
// short to search clears the results without asking.
import { useCallback, useEffect, useRef, useState } from "react";
import { MIN_QUERY, type SearchResult } from "@/kernel/shell/search";
import { flattenHits } from "./search-palette-model";

// Shorter than before (180 ms) because a stale request is now cancelled rather than queued.
const DEBOUNCE_MS = 120;

export type SearchStatus = "idle" | "loading" | "done" | "error";

export function useSearchQuery(search: (query: string, signal: AbortSignal) => Promise<SearchResult>, enabled: boolean) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [active, setActive] = useState(-1);
  const requestRef = useRef(0);
  const inFlight = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    inFlight.current?.abort();
    inFlight.current = null;
  }, []);

  const reset = useCallback(() => {
    requestRef.current += 1;
    cancel();
    setQuery("");
    setResult(null);
    setStatus("idle");
    setActive(-1);
  }, [cancel]);

  useEffect(() => {
    if (!enabled) return;
    const q = query.trim();
    if (q.length < MIN_QUERY) {
      requestRef.current += 1;
      cancel();
      setResult(null);
      setStatus("idle");
      setActive(-1);
      return;
    }
    const request = ++requestRef.current;
    setStatus("loading");
    const timer = setTimeout(() => {
      cancel();
      const controller = new AbortController();
      inFlight.current = controller;
      search(q, controller.signal).then(
        (res) => {
          if (request !== requestRef.current) return;
          setResult(res);
          setStatus("done");
          setActive(flattenHits(res.groups).length > 0 ? 0 : -1);
        },
        () => {
          // A cancelled request belongs to a query the person has moved past.
          if (request !== requestRef.current || controller.signal.aborted) return;
          setResult(null);
          setStatus("error");
          setActive(-1);
        },
      );
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [enabled, query, search, cancel]);

  // Closing the palette, or leaving the page, cancels what is still in flight.
  useEffect(() => cancel, [cancel]);

  return { query, setQuery, result, status, active, setActive, reset };
}
