// Section 3 of the Profile board (RP.6; stories 12-21): what is always left
// out, then the item rules in the order they are tried. The first rule an item
// meets decides it, so a rule can be moved up or down.
import type { Profile } from "@/entities/replenishment/client";
import { blankRule, moveAt, removeAt, replaceAt } from "@/entities/replenishment/ui/profile-draft";
import { FieldIssue, type Part } from "./editor-fields";
import { RuleCard } from "./RuleCard";
import { TestsEditor } from "./TestsEditor";

type Props = Part<Pick<Profile, "exclude" | "rules">> & {
  words: Profile["words"];
  /** Jobs per rule and band of the last export, or null when there is no preview of this draft. */
  bandJobs: number[][] | null;
};

export function RulesSection({ value, onChange, issues, words, bandJobs }: Props) {
  const { rules } = value;
  const setRules = (next: Profile["rules"]) => onChange({ ...value, rules: next });
  return (
    <section className="admin-card admin-section-card">
      <h2 className="admin-card-title">3. Which items, and how much to move</h2>
      <p className="admin-cell-muted">The first rule an item meets decides it. An item no rule can read is left out with a reason, never guessed.</p>
      <TestsEditor
        title="Always leave out"
        addLabel="Add an exclusion"
        path="exclude"
        value={value.exclude}
        issues={issues}
        onChange={(exclude) => onChange({ ...value, exclude })}
      />
      <FieldIssue issues={issues} path="rules" exact />
      <div className="u-mt-4">
        {rules.map((rule, i) => (
          <RuleCard
            key={rule.id}
            value={rule}
            index={i}
            count={rules.length}
            issues={issues}
            words={words}
            bandJobs={bandJobs?.[i] ?? null}
            onChange={(next) => setRules(replaceAt(rules, i, next))}
            onMove={(by) => setRules(moveAt(rules, i, by))}
            onRemove={() => setRules(removeAt(rules, i))}
          />
        ))}
      </div>
      <button type="button" className="admin-btn u-mt-4" onClick={() => setRules([...rules, blankRule(rules)])}>
        Add a rule
      </button>
      <p className="admin-hint u-mt-4 u-m-0">
        The move is never more than {words.reserve} holds. &ldquo;Operator chooses&rdquo; shows each option capped at {words.reserve}, for a choice the export cannot make,
        such as a box size.
      </p>
    </section>
  );
}
