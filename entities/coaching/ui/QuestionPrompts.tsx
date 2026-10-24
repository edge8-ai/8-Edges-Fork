"use client";

import { useState } from "react";
import { QUESTION_LIBRARY } from "@/entities/coaching/lib/questions-library";

// The "Need a prompt?" disclosure under "What I want to talk about" (K.24). A
// blank field is the hardest part of the ninety seconds, so the list exists to
// be borrowed from: one click puts a question in the member's field, where they
// can edit it or delete it like anything they typed themselves.

export function QuestionPrompts({ onPick }: { onPick: (question: string) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        className="admin-link-btn"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "Hide prompts" : "Need a prompt?"}
      </button>
      {open && (
        <div>
          {QUESTION_LIBRARY.map((group) => (
            <div key={group.title}>
              <span className="admin-eyebrow">{group.title}</span>
              <ul className="admin-mycoach-premeeting-agenda">
                {group.questions.map((question) => (
                  <li key={question}>
                    <button
                      type="button"
                      className="admin-link-btn"
                      onClick={() => {
                        onPick(question);
                        setOpen(false);
                      }}
                    >
                      {question}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
