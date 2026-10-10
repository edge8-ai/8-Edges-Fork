import type { MetadataRoute } from 'next'
import { BASE } from '@/entities/site/lib/public-routes'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/t/', '/workflows/private/', '/board/'],
      },
    ],
    // From configuration. Hardcoded, a fork's robots.txt names another
    // company as its canonical host and points crawlers at that company's
    // sitemap — the two lines on the site with the most direct SEO effect.
    ...(BASE ? { sitemap: `${BASE}/sitemap.xml`, host: BASE } : {}),
  }
}
