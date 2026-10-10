"use client";

// The palette's query (S.1): one request per pause in typing, and an answer to
// an older query is dropped, so a slow response can never replace a newer one.
// A query too short to search clears the results without asking.
import { useCallback, useEffect, useRef, useState } from "react";
import { MIN_QUERY, type SearchResult } from "@/kernel/shell/search";
import { flattenHits } from "./search-palette-model";

const DEBOUNCE_MS = 180;

export type SearchStatus = "idle" | "loading" | "done" | "error";

export function useSearchQuery(search: (query: string) => Promise<SearchResult>, enabled: boolean) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [active, setActive] = useState(-1);
  const requestRef = useRef(0);

  const reset = useCallback(() => {
    requestRef.current += 1;
    setQuery("");
    setResult(null);
    setStatus("idle");
    setActive(-1);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const q = query.trim();
    if (q.length < MIN_QUERY) {
      requestRef.current += 1;
      setResult(null);
      setStatus("idle");
      setActive(-1);
      return;
    }
    const request = ++requestRef.current;
    setStatus("loading");
    const timer = setTimeout(() => {
      search(q).then(
        (res) => {
          if (request !== requestRef.current) return;
          setResult(res);
          setStatus("done");
          setActive(flattenHits(res.groups).length > 0 ? 0 : -1);
        },
        () => {
          if (request !== requestRef.current) return;
          setResult(null);
          setStatus("error");
          setActive(-1);
        },
      );
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [enabled, query, search]);

  return { query, setQuery, result, status, active, setActive, reset };
}
