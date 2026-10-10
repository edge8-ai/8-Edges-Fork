"use client";

import { useEffect, useRef, useState } from "react";

// Voice dictation via the browser's Web Speech API, shared by the idea and
// learning forms. No audio leaves the page; unsupported browsers just type.
// One recognition instance at a time — final transcripts are appended to the
// field that started dictation via the onText callback.

// Minimal typings for the Web Speech API (not in TS's DOM lib everywhere).
type SpeechAlt = { transcript: string };
type SpeechResult = { isFinal: boolean; 0: SpeechAlt };
type SpeechEvent = { resultIndex: number; results: { length: number; [i: number]: SpeechResult } };
type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SpeechEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function getRecognition(): Recognition | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

// Append `heard` to a field's current text with a single separating space.
export function appendDictation(current: string, heard: string): string {
  return (current ? current.replace(/\s+$/, "") + " " : "") + heard.trim();
}

export function useDictation(onText: (field: string, heard: string) => void) {
  const [canDictate, setCanDictate] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<Recognition | null>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  useEffect(() => {
    setCanDictate(Boolean(getRecognition()));
    return () => recRef.current?.stop();
  }, []);

  function stopDictation() {
    recRef.current?.stop();
    recRef.current = null;
    setListening(false);
  }

  function toggleDictation(field: string) {
    if (listening) {
      stopDictation();
      return;
    }
    const rec = getRecognition();
    if (!rec) return;
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = "en-US";
    rec.onresult = (e) => {
      let heard = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) heard += e.results[i][0].transcript;
      }
      if (heard) onTextRef.current(field, heard);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  }

  return { canDictate, listening, toggleDictation, stopDictation };
}
