// The sprint's plant (W.173): every card finished this sprint feeds it one
// leaf, up to eight; the ninth sets a bud and the tenth makes it bloom. It
// never wilts and never loses a leaf — a sprint with nothing finished is a seed
// in its pot, which is a beginning, not a failure.
//
// Its own drawing rather than coaching's GrowthPlant: boards installs without
// coaching (the minimal deployment is a Workboard), and a sprint's plant
// restarts every week while My Coach's grows over a whole history, so the two
// share a hue and nothing else.
//
// No hooks, so it renders on the server (the garden) and inside the client
// island that animates feeding (MyWeekShipped). The viewBox never changes with
// the stage, so a new leaf grows in place and nothing on the page moves.
import { PLANT_BLOOM_AT, PLANT_LEAVES } from "@/entities/boards/lib/my-week-sprint";

const SOIL_Y = 112;
const STEP = 9;

/** The words for how far a plant has grown, said under it and to screen readers. */
export function sproutStage(fed: number): string {
  if (fed === 0) return "A seed, waiting";
  if (fed === 1) return "Sprouted";
  if (fed < 5) return "Growing";
  if (fed < PLANT_LEAVES + 1) return "Leafy";
  if (fed < PLANT_BLOOM_AT) return "Budding";
  return "In full bloom";
}

export function MyWeekSprout({
  fed,
  names = [],
  fresh = 0,
  size = "lg",
}: {
  fed: number;
  /** The card behind each leaf, oldest first: a leaf's tooltip names what fed it. */
  names?: string[];
  /** How many of the newest leaves to grow in with an animation. */
  fresh?: number;
  size?: "lg" | "sm";
}) {
  const leaves = Math.min(fed, PLANT_LEAVES);
  const bud = fed > PLANT_LEAVES && fed < PLANT_BLOOM_AT;
  const bloom = fed >= PLANT_BLOOM_AT;
  const top = SOIL_Y - leaves * STEP - (bud || bloom ? 16 : leaves > 0 ? 6 : 0);
  const firstFresh = fed - fresh;
  return (
    <svg
      className={`admin-myweek-sprout admin-myweek-sprout--${size}`}
      viewBox="20 0 80 140"
      aria-hidden="true"
      focusable="false"
    >
      <path className="admin-myweek-sprout-pot" d={`M38 ${SOIL_Y} h44 l-5 24 h-34 z`} />
      <rect className="admin-myweek-sprout-rim" x="35" y={SOIL_Y - 4} width="50" height="7" rx="2" />
      {fed === 0 && <ellipse className="admin-myweek-sprout-seed" cx="60" cy={SOIL_Y - 6} rx="4" ry="3" />}
      {leaves > 0 && <path className="admin-myweek-sprout-stem" d={`M60 ${SOIL_Y - 4} C 57 ${(SOIL_Y + top) / 2}, 63 ${(SOIL_Y + top) / 2}, 60 ${top}`} />}
      {Array.from({ length: leaves }, (_, i) => {
        const y = SOIL_Y - 10 - i * STEP;
        const left = i % 2 === 0;
        const d = left ? `M60 ${y} q-16 -13 -24 0 q12 9 24 0 z` : `M60 ${y} q16 -13 24 0 q-12 9 -24 0 z`;
        return (
          <path key={i} className={`admin-myweek-sprout-leaf ${left ? "is-left" : "is-right"}${i >= firstFresh ? " is-new" : ""}`} d={d}>
            {names[i] && <title>{names[i]}</title>}
          </path>
        );
      })}
      {bud && <ellipse className={`admin-myweek-sprout-bud${fed - 1 >= firstFresh ? " is-new" : ""}`} cx="60" cy={top - 2} rx="6" ry="8" />}
      {bloom && (
        <g className={`admin-myweek-sprout-bloom${PLANT_BLOOM_AT - 1 >= firstFresh ? " is-new" : ""}`}>
          {[0, 72, 144, 216, 288].map((a) => (
            <ellipse key={a} className="admin-myweek-sprout-petal" cx="60" cy={top - 9} rx="5.5" ry="9" transform={`rotate(${a} 60 ${top})`} />
          ))}
          <circle className="admin-myweek-sprout-heart" cx="60" cy={top} r="5" />
        </g>
      )}
    </svg>
  );
}
