"use client";

// Fades in every element marked `.reveal` as it scrolls into view, by adding
// `.visible`. Pure presentation with no data, used by the marketing site's
// pages and the retreats pages, so it lives in the kernel (entities.md: code two
// entities need that has no data of its own). It moved here from the site with
// A.79.6, ADR 0034 step 2.
import { useEffect } from "react";

export default function RevealObserver() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('visible')
            observer.unobserve(e.target)
          }
        }),
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    )
    document.querySelectorAll('.reveal').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  return null
}
