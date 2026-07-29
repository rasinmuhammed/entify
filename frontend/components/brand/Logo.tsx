"use client"

import { useId } from "react"

/**
 * The Entify mark.
 *
 * Two rings sharing a solid lens: two records, one entity. It states what the
 * product does rather than decorating around it, which is why it replaced the
 * previous generic "connected nodes" glyph.
 *
 * Drawn in `currentColor` with no gradient, so it inherits from context and
 * survives being printed, favicon-sized, or placed on any surface. The lens is
 * the only filled area — at 16px that solid shape is what stays legible after
 * the rings blur together.
 */
export function Logo({
  className = "h-6 w-6",
  strokeWidth = 2,
}: {
  className?: string
  strokeWidth?: number
}) {
  // Multiple marks can render on one page; clip ids must not collide.
  const clipId = useId()

  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <clipPath id={clipId}>
          <circle cx="12" cy="16" r="7.5" />
        </clipPath>
      </defs>

      {/* The shared region: where the two records agree. */}
      <circle cx="20" cy="16" r="7.5" fill="currentColor" clipPath={`url(#${clipId})`} />

      <circle cx="12" cy="16" r="7.5" stroke="currentColor" strokeWidth={strokeWidth} />
      <circle cx="20" cy="16" r="7.5" stroke="currentColor" strokeWidth={strokeWidth} />
    </svg>
  )
}

/**
 * Mark plus wordmark.
 *
 * The wordmark is set solid, tight, and in a single weight. The previous
 * version ran a violet-to-purple gradient through the text; gradients on type
 * date a brand quickly and fail the moment the logo appears on an unexpected
 * background.
 */
export function Wordmark({
  className = "",
  showMark = true,
}: {
  className?: string
  showMark?: boolean
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      {showMark && <Logo className="h-[22px] w-[22px]" />}
      <span className="text-[17px] font-medium tracking-[-0.02em]">Entify</span>
    </span>
  )
}
