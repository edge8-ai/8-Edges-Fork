import Image from 'next/image'
import type { CaseStudyStory } from '@/entities/site/lib/caseStudyStories'

// The top of a case study card. A study with a photo shows it; a story-format
// study has no photo and shows its three headline numbers instead, so the proof
// is on the index before the click.
export default function CaseStudyCardMedia({
  title, image, story, imgClassName, width, height,
}: {
  title: string
  image?: string
  story?: CaseStudyStory
  imgClassName: string
  width: number
  height: number
}) {
  if (image) return <Image src={image} alt={title} width={width} height={height} className={imgClassName} />
  if (!story) return null
  return (
    <div className="site-cs-stats">
      {story.stats.map((s) => (
        <div key={s.value + s.label} className="site-cs-stat">
          <span className="site-cs-stat-num">{s.value}</span>
          <span className="site-cs-stat-label">{s.short}</span>
        </div>
      ))}
    </div>
  )
}
