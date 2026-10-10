"use client";

import { useId, useState } from "react";
import { dayChoices, dayLabel, timeChoices, timeLabel } from "@/entities/coaching/lib/day-choices";

// Pick a day and a time with one click each (K.80). The likely answers are
// chips — the day that keeps the rhythm, the next working days, the time the
// person said suits them — and "Other" opens the browser's own field for
// anything else. Controlled: the caller holds the value and submits it.
export function DayTimePicker({
  todayIso,
  suggestedOn = null,
  preferredTime = null,
  day,
  time,
  onDay,
  onTime,
  withTime = true,
}: {
  todayIso: string;
  suggestedOn?: string | null;
  preferredTime?: string | null;
  day: string;
  time: string;
  onDay: (day: string) => void;
  onTime: (time: string) => void;
  withTime?: boolean;
}) {
  const id = useId();
  const days = dayChoices(todayIso, suggestedOn);
  const times = timeChoices(preferredTime);
  const [otherDay, setOtherDay] = useState(day !== "" && !days.includes(day));
  const [otherTime, setOtherTime] = useState(time !== "" && !times.includes(time));

  return (
    <div className="coach-picker">
      <div className="coach-picker-row" role="group" aria-labelledby={`${id}-day`}>
        <span className="coach-picker-label" id={`${id}-day`}>
          Day
        </span>
        <div className="coach-chips">
          {days.map((d) => (
            <button
              key={d}
              type="button"
              className="coach-chip"
              aria-pressed={!otherDay && day === d}
              onClick={() => {
                setOtherDay(false);
                onDay(d);
              }}
            >
              {dayLabel(d, todayIso)}
              {d === suggestedOn && <span className="coach-chip-note">keeps the rhythm</span>}
            </button>
          ))}
          <button
            type="button"
            className="coach-chip"
            aria-pressed={otherDay}
            onClick={() => {
              setOtherDay(true);
              onDay("");
            }}
          >
            Other day
          </button>
        </div>
        {otherDay && (
          <input
            className="admin-input coach-picker-native"
            type="date"
            aria-label="Pick another day"
            min={todayIso}
            value={day}
            autoFocus
            onChange={(e) => onDay(e.target.value)}
          />
        )}
      </div>

      {withTime && (
        <div className="coach-picker-row" role="group" aria-labelledby={`${id}-time`}>
          <span className="coach-picker-label" id={`${id}-time`}>
            Time
          </span>
          <div className="coach-chips">
            {times.map((t) => (
              <button
                key={t}
                type="button"
                className="coach-chip"
                aria-pressed={!otherTime && time === t}
                onClick={() => {
                  setOtherTime(false);
                  onTime(time === t ? "" : t);
                }}
              >
                {timeLabel(t)}
                {t === preferredTime && <span className="coach-chip-note">their usual</span>}
              </button>
            ))}
            <button
              type="button"
              className="coach-chip"
              aria-pressed={otherTime}
              onClick={() => {
                setOtherTime(true);
                onTime("");
              }}
            >
              Other time
            </button>
          </div>
          {otherTime && (
            <input
              className="admin-input coach-picker-native"
              type="time"
              aria-label="Pick another time"
              value={time}
              autoFocus
              onChange={(e) => onTime(e.target.value)}
            />
          )}
        </div>
      )}
    </div>
  );
}
