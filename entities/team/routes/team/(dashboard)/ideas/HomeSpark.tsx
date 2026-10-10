// Spark on the team Home (TH.1.5): a band of the team sky, the one-line
// composer, one card from the person's deck and the newest sparks. A taste of
// /team/ideas, built from that page's own parts, so a spark posted here lands
// in the sky as the same shooting star and a deck answer is the same answer.
import Link from "next/link";
import { HomeFace } from "@/entities/team/ui/home/HomeFace";
import { SparkComposer } from "./SparkComposer";
import { SparkDeck } from "./SparkDeck";
import { SKY, SKY_RADIUS, SKY_SPARKLE } from "./sparks-model";
import type { SparkHome } from "./spark-home";

export type SparkFace = { avatarUrl: string | null; tone: number };

const SPARKS = "/team/ideas";

// The Home card is a wide, short band, far wider than the sky on /team/ideas,
// so the stars are spread into a frame of the band's own shape rather than
// cropped from the middle of the original (the sky's 320 units become 640).
const BAND = { w: SKY.w * 2, h: 150 } as const;
const bandX = (x: number) => x * 2;
const bandY = (y: number) => 8 + (y / (SKY.h - SKY.floor)) * (BAND.h - 16);

function when(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Ho_Chi_Minh" });
}

export function HomeSpark({ spark, faceOf }: { spark: SparkHome; faceOf: (personId: string) => SparkFace }) {
  return (
    <section className="th-card" aria-labelledby="th-spark-h">
      <div className="th-sky">
        <svg viewBox={`0 0 ${BAND.w} ${BAND.h}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          {spark.stars.map((s) => (
            <g key={s.id} className={`sparks-star-g is-${s.stage} is-${s.kind}${s.isNew ? " is-new" : ""}${s.fresh ? " is-fresh" : ""}`}>
              {s.fresh && <line className="sparks-comet" x1={bandX(s.x) - 46} y1={bandY(s.y) - 26} x2={bandX(s.x)} y2={bandY(s.y)} />}
              {s.stage === "shipped" ? (
                <path className="sparks-star sparks-star--sparkle" d={SKY_SPARKLE} transform={`translate(${bandX(s.x)} ${bandY(s.y)})`} />
              ) : (
                <circle className="sparks-star" cx={bandX(s.x)} cy={bandY(s.y)} r={SKY_RADIUS[s.stage]} />
              )}
            </g>
          ))}
        </svg>
        <div className="th-sky-h">
          <div className="th-eyebrow">Spark</div>
          <h2 id="th-spark-h">Ideas from all of us</h2>
        </div>
        <Link href={SPARKS}>Open Spark</Link>
      </div>
      <div className="th-spark-body">
        <SparkComposer />
        {spark.deck.length > 0 && <SparkDeck initial={spark.deck} />}
        {spark.latest.length > 0 && (
          <div className="th-feed">
            {spark.latest.map((i) => {
              const face = faceOf(i.person_id);
              return (
                <div key={i.id} className="th-sp">
                  <HomeFace name={i.submitterName} avatarUrl={face.avatarUrl} tone={face.tone} />
                  <div>
                    <div className="th-sp-t">
                      <Link href={`${SPARKS}/${i.id}`}>{i.title}</Link>
                    </div>
                    <div className="th-sp-m">
                      <span className={`th-kind${i.kind === "learning" ? " is-learning" : ""}`}>{i.kind === "learning" ? "I learned" : "We should build"}</span>
                      {i.submitterName} · {when(i.created_at)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
