import { requirePermission } from "@/kernel/identity/access-request";
import { homeTenure } from "./home-tenure";
import { permissionRegistry } from "@/kernel/identity/permission-registry";
import { permissionForPath } from "@/kernel/identity/permission-lookup";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { mayProp } from "@/kernel/identity/may-prop";
import { getOwnProfile, getOpenRoles } from "@/entities/team/lib/data";
import { getClientRoadmapSnippets } from "@/entities/team/lib/hub-clients";
import { getMyGoals, getMyCoaching, hubOneOnOnePrompt, preMeetingAnswered, saigonToday } from "@/entities/coaching";
import { readCertifications } from "@/entities/team/lib/certifications";
import { Badge } from "@/kernel/ui/Badge";
import { formatDate } from "@/kernel/ui/format";
import { OnboardingWalkthrough } from "@/entities/team/ui/OnboardingWalkthrough";
import { StartHerePanel } from "@/entities/team/ui/StartHerePanel";
import { HomeOnboardingPlan } from "@/entities/team/ui/HomeOnboardingPlan";
import { HomeWeekChecklist } from "@/entities/team/ui/HomeWeekChecklist";
import { getHomeOnboarding } from "@/entities/team/lib/home-onboarding";
import { homePeople, isNewFace } from "@/entities/team/lib/home-people";
import { comingUp, meetLine, newFaces, shuffle, storyOrder } from "@/entities/team/lib/home-compose";
import { HomeStory, type StorySlide } from "@/entities/team/ui/home/HomeStory";
import { HomeMeet } from "@/entities/team/ui/home/HomeMeet";
import { HomeWeek } from "@/entities/team/ui/home/HomeWeek";
import { HomeInstitute } from "@/entities/team/ui/home/HomeInstitute";
import { HomeOut, HomeNewFaces, HomeComingUp, HomeGoals, type RailGoal } from "@/entities/team/ui/home/HomeRail";
import { HomeClients } from "@/entities/team/ui/home/HomeClients";
import { HomeKudos } from "@/entities/team/ui/home/HomeKudos";
import { kudosForMonth } from "@/entities/team/lib/kudos";
import { addMonths, kudosRecipients, monthName, monthOf } from "@/entities/team/lib/kudos-rules";
import { toneFor } from "@/entities/team/ui/home/HomeFace";
import { HomeSpark } from "./ideas/HomeSpark";
import { sparkForHome } from "./ideas/spark-home";
import { listGalleryPhotos } from "@/entities/site";
import { getAllPublishedPosts } from "@/entities/campaigns";
import { openSurveysFor } from "@/entities/org";
import { readMyWeek, myWeek, sprintStartOf } from "@/entities/boards";
import { whoIsOut, upcomingHolidays } from "@/entities/time-off";
import { upcomingTeamEvents } from "@/entities/retreats";
import { setOnboardingDone, toggleMyOnboardingTask } from "./actions";

// The core teaching every new hire reads first.
const CORE_TEACHING_SLUG = "the-other-50-percent-of-leadership";

// The team Home (TH.1, approved on the TH.1 canvas 2026-10-09): the home of
// Edge8, not a second My week. The company's story in photos, everyone in it
// shuffled so everyone gets to know everyone, the person's week as a doorway to
// My week, the certification every teammate completes, Spark, and the
// clients we build for. A new hire's onboarding still leads the main column for
// their first 30 days.
//
// Everything here is self-scoped or company-visible by design: the week, goals,
// certification and onboarding are read for the actor alone; the people, the
// photos, who is out and Spark are the whole company's.

// A FAST Goal's percentage, from the measured start/current/target when set.
function goalPct(start: number | null, current: number | null, target: number | null): number | null {
  if (start === null || current === null || target === null || target === start) return null;
  return Math.max(0, Math.min(100, Math.round(((current - start) / (target - start)) * 100)));
}

function photoMeta(taken: string | null, category: string | null): string | null {
  const date = taken ? new Date(`${taken}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : null;
  const kind = category ? category[0].toUpperCase() + category.slice(1) : null;
  return [kind, date].filter(Boolean).join(" · ") || null;
}

export default async function TeamHome() {
  // The page's declared permission (entities/team/permissions.ts, ADR 0013).
  const access = await requirePermission("surface.team");
  const actor = await requireTeamMember();
  // A link shows only when its page would open (AC.19): a contractor without
  // the Company module is not offered the directory, the gallery or Spark.
  const routes = permissionRegistry().routes;
  const may = (href: string) => access.may(permissionForPath(routes, href) ?? "surface.team");
  const hrefIf = (href: string) => (may(href) ? href : null);
  const today = saigonToday();

  const [profile, clientSnippets, openRoles, photos, people, out, goals, coaching, openSurveys, weekRead, events, holidays] = await Promise.all([
    getOwnProfile(actor),
    getClientRoadmapSnippets(actor, 2),
    // Only for the "you're hiring" card, so a failed read drops that card.
    getOpenRoles().catch((e: unknown) => {
      console.error("[team/home] open roles unavailable", e);
      return [];
    }),
    listGalleryPhotos(),
    homePeople(),
    whoIsOut(today),
    getMyGoals(actor),
    getMyCoaching(actor),
    openSurveysFor(actor.personId),
    readMyWeek(actor.personId, sprintStartOf(today)),
    upcomingTeamEvents(3),
    upcomingHolidays(today, 2),
  ]);
  const month = monthOf(today);
  const showKudos = may("/team/kudos");
  const [spark, kudos] = await Promise.all([
    may("/team/ideas") ? sparkForHome(actor.personId) : null,
    showKudos ? kudosForMonth(month) : null,
  ]);
  const week = myWeek(weekRead, today);
  const myOpenRoles = openRoles.filter((r) => r.hiringManagerPersonId === actor.personId);

  // The company runs on Saigon time; the server renders in UTC.
  const now = new Date();
  const dateLine = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", weekday: "long", day: "numeric", month: "long" }).format(now);
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", hour: "numeric", hour12: false }).format(now));
  const salutation = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const heroSub = [profile?.departmentName, profile?.positionTitle].filter(Boolean).join(" · ") || "Team workspace";

  const onboardingDone = Boolean((profile?.person?.metadata as Record<string, unknown> | null)?.onboarding_completed_at);
  // Counted in Saigon days from the start date, so a render never reads the clock twice.
  const daysSinceStart = profile?.start_date ? Math.floor((Date.parse(today) - Date.parse(profile.start_date)) / 86_400_000) : null;
  const { newHire, dayLabel } = homeTenure(daysSinceStart, profile?.employmentStage);
  const coreTeaching = newHire ? ((await getAllPublishedPosts()).find((p) => p.slug === CORE_TEACHING_SLUG) ?? null) : null;
  const onboarding = newHire ? await getHomeOnboarding(actor, goals.length > 0) : null;
  const fastGoalDue = onboarding?.milestones.find((m) => m.day === 7)?.on ?? null;

  // The story: the newest two photos, then the rest at random (TH.1.1).
  const slides: StorySlide[] = storyOrder(photos).map((p) => ({
    id: p.id,
    src: p.image_url,
    caption: p.caption?.trim() || "From the gallery",
    meta: photoMeta(p.taken_on, p.category),
  }));

  // Everyone, shuffled for this visit (TH.1.2); null means the read failed.
  const everyone = people ?? [];
  const meet = shuffle(everyone).map((p) => ({
    id: p.id,
    name: p.name,
    firstName: p.firstName,
    avatarUrl: p.avatarUrl,
    tone: toneFor(p.personId),
    line: meetLine(p, today),
    isNew: isNewFace(p.startDate, today),
  }));
  const byPerson = new Map(everyone.map((p) => [p.personId, p]));
  // Kudos offers a few faces from its own shuffle, so the card changes each visit too.
  const thankable = kudosRecipients(
    shuffle(everyone).map((p) => ({ personId: p.personId, name: p.name, firstName: p.firstName, avatarUrl: p.avatarUrl, tone: toneFor(p.personId) })),
    actor.personId,
  );
  const faceOf = (personId: string) => ({ avatarUrl: byPerson.get(personId)?.avatarUrl ?? null, tone: toneFor(personId) });

  const goalsForRail: RailGoal[] = goals.map((g) => ({
    id: g.id,
    title: g.title,
    pct: goalPct(g.startValue, g.currentValue, g.targetValue),
    current: g.currentValue,
    target: g.targetValue,
    unit: g.metricUnit,
    status: g.status.replace(/_/g, " "),
  }));
  const oneOnOnePrompt = coaching
    ? hubOneOnOnePrompt(
        {
          coachName: coaching.coachName,
          nextOn: coaching.nextOneOnOneOn,
          answered: preMeetingAnswered(coaching.preMeeting.answers),
          weekday: coaching.nextOneOnOneOn ? new Date(`${coaching.nextOneOnOneOn}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long" }) : null,
        },
        today,
      )
    : null;

  const directoryHref = hrefIf("/team/directory");
  const clientsHref = "/team/clients";

  return (
    <div className="th-home">
      <HomeStory
        slides={slides}
        dateLine={dateLine}
        greeting={actor.greeting ? `${salutation}, ${actor.greeting}` : salutation}
        sub={heroSub}
        galleryHref={hrefIf("/team/gallery")}
      />

      {people && <HomeMeet people={meet} directoryHref={directoryHref} />}

      <div className="th-grid">
        <div className="th-col">
          {newHire && (
            <section className="th-card" aria-labelledby="th-start-h">
              <div className="th-card-h">
                <h2 id="th-start-h">Get started</h2>
                <span className="th-meta">{dayLabel}</span>
              </div>
              <div className="th-pad">
              {onboarding && (
                <HomeOnboardingPlan plan={onboarding} roleTitle={profile?.positionTitle ?? null} managerName={profile?.managerName ?? null} nextOneOnOneOn={coaching?.nextOneOnOneOn ?? null} />
              )}
              {onboarding?.week && (
                <HomeWeekChecklist week={onboarding.week} planHref={onboarding.hasPlan ? `/team/onboarding/plan/${onboarding.journeyId}` : null} onToggle={toggleMyOnboardingTask} />
              )}
              {coreTeaching && <StartHerePanel coreTeaching={coreTeaching} goalHint={null} />}
              </div>
            </section>
          )}
          <HomeWeek model={week} />
          <HomeInstitute tracks={readCertifications(profile?.person?.metadata)} greeting={actor.greeting || null} />
          {spark && <HomeSpark spark={spark} faceOf={faceOf} />}
        </div>
        <div className="th-col">
          {out && (
            <HomeOut
              people={out.map((o) => ({ id: o.personId, name: o.name, avatarUrl: o.avatarUrl, tone: toneFor(o.personId), line: o.backOn }))}
              timeOffHref={hrefIf("/team/time-off")}
            />
          )}
          <HomeNewFaces
            people={newFaces(everyone, today).map((p) => ({
              id: p.id,
              name: p.name,
              avatarUrl: p.avatarUrl,
              tone: toneFor(p.personId),
              line: [p.role, p.startDate ? `joined ${formatDate(p.startDate)}` : null].filter(Boolean).join(" · "),
            }))}
            directoryHref={directoryHref}
          />
          <HomeComingUp items={comingUp({ surveys: openSurveys, events, holidays })} />
          {myOpenRoles.length > 0 && (
            <section className="th-card" aria-labelledby="th-hiring-h">
              <div className="th-card-h">
                <h2 id="th-hiring-h">You&rsquo;re hiring</h2>
              </div>
              <div className="th-pad">
                {myOpenRoles.map((r) => (
                  <div key={r.id} className="th-person">
                    <div className="u-min-0">
                      <div className="th-person-name">{r.title}</div>
                      <div className="th-meta">{r.location || "Location not set"}</div>
                    </div>
                    {r.isPublic && r.slug ? (
                      <a href={`/careers/${r.slug}/`} target="_blank" rel="noreferrer">
                        Posting →
                      </a>
                    ) : (
                      <Badge tone="warn">Not published</Badge>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
          <HomeGoals
            goals={goalsForRail}
            hasCoaching={coaching !== null}
            lastOneOnOne={coaching?.recaps?.[0]?.heldOn ?? null}
            prompt={oneOnOnePrompt}
            emptyNote={newHire && goals.length === 0 ? `Not written yet. Due day 7${fastGoalDue ? `, ${formatDate(fastGoalDue)}` : ""}. Your plan names the key result to link it to.` : null}
          />
        </div>
      </div>

      {/* The foot of the page: the clients in two thirds, Kudos in the right third (TH.1.8). */}
      <div className={showKudos ? "th-bottom" : undefined}>
        <HomeClients snippets={clientSnippets} clientsHref={clientsHref} />
        {showKudos && (
          <HomeKudos
            month={monthName(month, month)}
            currentMonth={month}
            prevMonth={{ label: monthName(addMonths(month, -1), month), href: `/team/kudos?month=${addMonths(month, -1)}` }}
            kudosHref="/team/kudos"
            notes={kudos}
            viewerPersonId={actor.personId}
            quick={thankable.quick}
            everyone={thankable.everyone}
            may={mayProp(access, ["team.culture"])}
          />
        )}
      </div>

      {/* The welcome tour is a new-hire aid; established staff never see it. */}
      {newHire && <OnboardingWalkthrough name={actor.greeting} startOpen={!onboardingDone} onFinish={setOnboardingDone} />}
    </div>
  );
}
