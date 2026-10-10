import Link from 'next/link'
import CaseStudyCardMedia from '@/entities/site/ui/CaseStudyCardMedia'
import type { CaseStudyMeta } from '@/entities/site/lib/caseStudies'

// One case study card, as it appears on the case studies page.
export default function CaseStudyCard({ cs, className = '' }: { cs: CaseStudyMeta; className?: string }) {
  return (
    <Link href={`/case-studies/${cs.slug}`} className={`cs-card ${className}`.trim()}>
      <CaseStudyCardMedia title={cs.title} image={cs.image} story={cs.story} imgClassName="cs-card-img" width={600} height={338} />
      <div className="cs-card-body">
        <div className="cs-card-title">{cs.title}</div>
        <p className="cs-card-desc">{cs.description}</p>
        <div className="cs-card-highlights">
          {cs.highlights.map((h) => (
            <span key={h} className="cs-card-highlight">{h}</span>
          ))}
        </div>
        <span className="cs-card-more">View Case Study →</span>
      </div>
    </Link>
  )
}
