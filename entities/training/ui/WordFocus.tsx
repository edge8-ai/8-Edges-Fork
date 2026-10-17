"use client";

// Which training's review should be open when its row next appears (TR.3).
// "I went after all" on a skipped row in the log moves that training to the
// Cool-down tray, where a new row mounts; this is how the new row knows to open
// its review, since the old row's state goes with it.
import { createContext, useContext, useState, type ReactNode } from "react";

type WordFocus = { openId: string | null; setOpenId: (id: string | null) => void };

const Context = createContext<WordFocus>({ openId: null, setOpenId: () => {} });

export function WordFocusProvider({ children }: { children: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return <Context.Provider value={{ openId, setOpenId }}>{children}</Context.Provider>;
}

export const useWordFocus = () => useContext(Context);
