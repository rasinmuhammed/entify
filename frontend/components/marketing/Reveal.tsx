"use client"

import { useEffect, useRef, useState } from "react"

/**
 * Scroll-triggered reveal that cannot leave content invisible.
 *
 * framer-motion's `whileInView` gates opacity on an IntersectionObserver
 * callback. When that callback does not fire -- an `overflow-hidden` ancestor,
 * a non-root scroll container, reduced-motion settings, a hydration hiccup --
 * the element stays at `opacity: 0` forever and the page silently renders
 * blank below the fold. That happened here.
 *
 * The rule this encodes: animation may enhance content, never gate it. The
 * observer is still used for choreography, but a timeout reveals everything
 * regardless, and `prefers-reduced-motion` skips straight to visible.
 */
export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = "div",
}: {
  children: React.ReactNode
  delay?: number
  className?: string
  as?: "div" | "section" | "h2" | "p"
}) {
  const ref = useRef<HTMLElement | null>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reduceMotion || typeof IntersectionObserver === "undefined") {
      setShown(true)
      return
    }

    const node = ref.current
    if (!node) {
      setShown(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShown(true)
          observer.disconnect()
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.01 }
    )
    observer.observe(node)

    // Safety net: if the observer has not fired by now, show anyway.
    const fallback = window.setTimeout(() => setShown(true), 1200)

    return () => {
      observer.disconnect()
      window.clearTimeout(fallback)
    }
  }, [])

  return (
    <Tag
      ref={ref as never}
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "none" : "translateY(14px)",
        transition: `opacity 600ms cubic-bezier(0.22,1,0.36,1) ${delay}ms, transform 600ms cubic-bezier(0.22,1,0.36,1) ${delay}ms`,
      }}
    >
      {children}
    </Tag>
  )
}
