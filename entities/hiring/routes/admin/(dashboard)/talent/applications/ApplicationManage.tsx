"use client";

import type { PersonOption } from "@/entities/crm";
import { InterviewRounds } from "./InterviewRounds";
import type { AppManageData } from "./manage/shared";
import { useApplicationHead } from "./manage/useApplicationHead";
import { DecisionHeader } from "./manage/DecisionHeader";
import { PipelineStrip } from "./manage/PipelineStrip";
import { AiScreenCard } from "./manage/AiScreenCard";
import { CoverLetterCard } from "./manage/CoverLetterCard";
import { ContactCard } from "./manage/ContactCard";
import { SourcingCard } from "./manage/SourcingCard";
import { SignalsCard } from "./manage/SignalsCard";
import { AssessmentCard } from "./manage/AssessmentCard";
import { FeedbackThread } from "./manage/FeedbackThread";
import { CandidateMessagesCard } from "./manage/CandidateMessagesCard";
import { DecisionCard } from "./manage/DecisionCard";
import type { ApplicationChainView } from "@/entities/hiring/lib/chain/view";
import type { MayProp } from "@/kernel/identity/may-prop";
export { type AppManageData } from "./manage/shared";

// The whole recruiter workspace for one application: a sticky decision header, a
// clickable pipeline strip, and a two-pane body (what you read to judge on the
// left; the candidate's facts, read-first and editable in place, on the right).
// The data model is unchanged — every edit drives the same server actions the old
// form did; only the surface changed.
export function ApplicationManage({
  app,
  referrerOptions,
  archived,
  stageEnteredAt,
  chain = null,
  chainError = null,
  may = {},
}: {
  app: AppManageData;
  referrerOptions: PersonOption[];
  archived: boolean;
  stageEnteredAt: string | null;
  /** The hiring chain's view of this application (Z.9); null when it has no run. */
  chain?: ApplicationChainView | null;
  chainError?: string | null;
  may?: MayProp;
}) {
  // In a live chain, Hired and Rejected are proposed in the Decision card, not set from the header.
  const proposeDecision = chain !== null && chain.mode !== "shadow" && chain.step !== "closed";
  const {
    stages,
    stagesLoading,
    extras,
    stageId,
    status,
    rating,
    rejectionReason,
    isArchived,
    headErr,
    nextStage,
    moveToStage,
    saveRating,
    saveStatus,
    doReject,
    saveRejectionReason,
    toggleArchive,
  } = useApplicationHead(app, archived);

  return (
    <>
      <DecisionHeader
        name={app.candidateName || "Candidate"}
        jobReqTitle={app.jobReqTitle}
        source={app.source}
        stageName={stageId ? (stages.find((s) => s.id === stageId)?.name ?? app.currentStageName) : app.currentStageName}
        status={status}
        rating={rating}
        onRate={saveRating}
        onStatus={saveStatus}
        onReject={doReject}
        rejectionReason={rejectionReason}
        onRejectionReason={saveRejectionReason}
        nextStage={nextStage}
        advanceDisabled={!app.jobReqId || stagesLoading || !nextStage}
        onAdvance={() => nextStage && moveToStage(nextStage)}
        archived={isArchived}
        onToggleArchive={toggleArchive}
        error={headErr}
        proposeDecision={proposeDecision}
      />

      {app.jobReqId && (
        <PipelineStrip
          stages={stages}
          loading={stagesLoading}
          stageId={stageId}
          stageEnteredAt={stageEnteredAt}
          appliedAt={app.appliedAt}
          onMove={moveToStage}
        />
      )}

      {isArchived && (
        <div className="admin-alert admin-alert--outlined u-mb-4">
          This application is archived and hidden from the pipeline. Use the ⋯ menu to restore it.
        </div>
      )}

      <div className="admin-record-cols">
        <div className="admin-record-main">
          {chainError && <div className="admin-alert admin-alert--err">The hiring chain could not be read: {chainError}</div>}
          {chain && (
            <>
              <DecisionCard view={chain} candidateName={app.candidateName || "the candidate"} roleTitle={app.jobReqTitle} may={may} />
              <CandidateMessagesCard view={chain} may={may} />
            </>
          )}

          {extras && <AiScreenCard extras={extras} resumeDocumentId={app.resumeDocumentId} />}

          {/* The human read sits right under the machine read — AI screen, then
              your assessment — as a paired judgment in the main column. */}
          <AssessmentCard appId={app.id} hrAssessment={app.hrAssessment} />

          <section className="admin-card admin-section-card">
            <InterviewRounds applicationId={app.id} />
          </section>

          <FeedbackThread applicationId={app.id} />

          {extras && (extras.coverLetter || extras.answers.length > 0) && (
            <CoverLetterCard extras={extras} />
          )}
        </div>

        <aside className="admin-record-rail">
          {app.personId ? (
            <ContactCard
              personId={app.personId}
              email={app.email}
              phone={app.phone}
              city={app.city}
              country={app.country}
              linkedinUrl={app.linkedinUrl}
              portfolioUrl={app.portfolioUrl}
              headline={app.headline}
              currentTitle={app.currentTitle}
            />
          ) : (
            <section className="admin-card admin-section-card">
              <div className="admin-section-label u-mb-2">Contact</div>
              <div className="admin-hint">No linked person record.</div>
            </section>
          )}

          <SourcingCard
            appId={app.id}
            source={app.source}
            sourceDetail={app.sourceDetail}
            referrerId={app.referrerId}
            referrerOptions={referrerOptions}
            appliedAt={app.appliedAt}
            decidedAt={app.decidedAt}
            resumeDocumentId={app.resumeDocumentId}
          />

          {app.personId && (
            <SignalsCard
              personId={app.personId}
              englishProficiency={app.englishProficiency}
              canViewSalary={app.canViewSalary}
              salaryExpectationCents={app.salaryExpectationCents}
              salaryExpectationCurrency={app.salaryExpectationCurrency}
              noticePeriod={app.noticePeriod}
              poolStatus={app.poolStatus}
              doNotHire={app.doNotHire}
              aiEnglish={extras?.aiSummary?.english ?? null}
              aiSalary={app.aiSalary}
              aiNotice={extras?.aiSummary?.notice_period ?? null}
            />
          )}
        </aside>
      </div>
    </>
  );
}
