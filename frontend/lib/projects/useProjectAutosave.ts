"use client"

import { useEffect } from "react"

import { saveProjectFields } from "@/lib/projects/persistence"
import type { ComparisonConfig } from "@/lib/comparison/comparisonMethods"
import { createClient } from "@/utils/supabase/client"

type SupabaseClient = ReturnType<typeof createClient>

interface UseProjectAutosaveOptions {
  supabase: SupabaseClient
  projectId?: string
  blockingRules: string[]
  comparisons: ComparisonConfig[]
  globalSettings: Record<string, unknown>
  threshold: number
  semanticBlocking: Array<{ column: string; run_id: string; rule: string }>
  activePhase: string
  baseConfiguration?: Record<string, unknown>
  onWarning?: (message: string) => void
}

export function useProjectAutosave({
  supabase,
  projectId,
  blockingRules,
  comparisons,
  globalSettings,
  threshold,
  semanticBlocking,
  activePhase,
  baseConfiguration,
  onWarning,
}: UseProjectAutosaveOptions) {
  useEffect(() => {
    if (!projectId || blockingRules.length === 0) return

    const timeout = setTimeout(async () => {
      const { error } = await saveProjectFields(supabase, projectId, {
        blocking_rules: blockingRules,
      })

      if (error) {
        onWarning?.(`Blocking rules save failed: ${error.message}`)
      }
    }, 1000)

    return () => clearTimeout(timeout)
  }, [blockingRules, onWarning, projectId, supabase])

  useEffect(() => {
    if (!projectId || comparisons.length === 0) return

    const timeout = setTimeout(async () => {
      const { error } = await saveProjectFields(supabase, projectId, {
        comparisons,
        comparison_config: comparisons,
      })

      if (error) {
        onWarning?.(`Comparisons save failed: ${error.message}`)
      }
    }, 1000)

    return () => clearTimeout(timeout)
  }, [comparisons, onWarning, projectId, supabase])

  useEffect(() => {
    if (!projectId) return

    const timeout = setTimeout(async () => {
      const { error } = await saveProjectFields(supabase, projectId, {
        global_settings: globalSettings,
      })

      if (error) {
        onWarning?.(`Global settings save failed: ${error.message}`)
      }
    }, 1000)

    return () => clearTimeout(timeout)
  }, [globalSettings, onWarning, projectId, supabase])

  useEffect(() => {
    if (!projectId) return

    const timeout = setTimeout(async () => {
      const { error } = await saveProjectFields(supabase, projectId, {
        threshold,
      })

      if (error) {
        onWarning?.(`Threshold save failed: ${error.message}`)
      }
    }, 1000)

    return () => clearTimeout(timeout)
  }, [onWarning, projectId, supabase, threshold])

  useEffect(() => {
    if (!projectId) return

    const timeout = setTimeout(async () => {
      const { error } = await saveProjectFields(supabase, projectId, {
        configuration: {
          ...(baseConfiguration || {}),
          semantic_blocking: semanticBlocking,
        },
      })

      if (error) {
        onWarning?.(`Semantic blocking save failed: ${error.message}`)
      }
    }, 1000)

    return () => clearTimeout(timeout)
  }, [baseConfiguration, onWarning, projectId, semanticBlocking, supabase])

  useEffect(() => {
    if (!projectId || !activePhase) return

    const timeout = setTimeout(async () => {
      const { error } = await saveProjectFields(supabase, projectId, {
        active_phase: activePhase,
      })

      if (error) {
        onWarning?.(`Active phase save failed: ${error.message}`)
      }
    }, 500)

    return () => clearTimeout(timeout)
  }, [activePhase, onWarning, projectId, supabase])
}
