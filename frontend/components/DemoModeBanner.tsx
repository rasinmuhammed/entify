"use client"

import { useEffect, useState } from "react"
import { Database, X } from "lucide-react"
import { demoMode } from "@/lib/config"

const DISMISS_KEY = "entify:demo-banner-dismissed"

/**
 * Tells the user their work is stored locally.
 *
 * Silently persisting to localStorage would be a nasty surprise the first time
 * someone clears their browser, so demo mode announces itself once and is then
 * dismissible.
 */
export default function DemoModeBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (demoMode && window.localStorage.getItem(DISMISS_KEY) !== "1") {
      setVisible(true)
    }
  }, [])

  if (!visible) return null

  return (
    <div className="border-b border-amber-500/30 bg-amber-500/10">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-6 py-2 text-sm">
        <Database className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
        {/* Colours are set per scheme: amber-200 on a translucent amber wash
            is unreadable against a light background. */}
        <p className="flex-1 text-amber-900 dark:text-amber-200/90">
          <span className="font-medium text-amber-950 dark:text-amber-100">Demo mode.</span>{" "}
          No account needed — projects are saved in this browser only. Add Clerk and
          Supabase keys to{" "}
          <code className="rounded bg-amber-500/15 px-1">.env.local</code> for
          sign-in and shared storage.
        </p>
        <button
          onClick={() => {
            window.localStorage.setItem(DISMISS_KEY, "1")
            setVisible(false)
          }}
          className="rounded p-1 text-amber-800/70 transition hover:bg-amber-500/15 hover:text-amber-950 dark:text-amber-200/70 dark:hover:text-amber-100"
          aria-label="Dismiss demo mode notice"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
