import { createClient } from "@/utils/supabase/client"
import type { ComparisonConfig } from "@/lib/comparison/comparisonMethods"

type SupabaseClient = ReturnType<typeof createClient>
type SemanticBlockingConfig = { column: string; run_id: string; rule: string }

export async function saveProjectFields(
  supabase: SupabaseClient,
  projectId: string,
  fields: Record<string, unknown>
) {
  return supabase
    .from("projects")
    .update({
      ...fields,
      last_updated: new Date().toISOString(),
    })
    .eq("id", projectId)
}

export async function saveDatasetPrimaryKey(
  supabase: SupabaseClient,
  datasetId: string,
  columnName: string
) {
  return supabase
    .from("datasets")
    .update({
      primary_key_column: columnName,
    })
    .eq("id", datasetId)
}

export async function loadProjectBundle(supabase: SupabaseClient, id: string) {
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single()

  if (projectError) {
    throw new Error(`Failed to load project: ${projectError.message}`)
  }

  if (!project) {
    throw new Error("Project not found")
  }

  const { data: dataset, error: datasetError } = await supabase
    .from("datasets")
    .select("*")
    .eq("id", project.dataset_id)
    .single()

  if (datasetError || !dataset) {
    throw new Error("Dataset not found")
  }

  return {
    project,
    dataset,
    comparisons: Array.isArray(project.comparisons)
      ? (project.comparisons as ComparisonConfig[])
      : Array.isArray(project.comparison_config)
        ? (project.comparison_config as ComparisonConfig[])
        : [],
    blockingRules: Array.isArray(project.blocking_rules) ? project.blocking_rules : [],
    globalSettings: project.global_settings || {
      probability_two_random_records_match: 0.0001,
    },
    activePhase: project.active_phase || "profile",
    threshold: project.threshold ?? 0.5,
    semanticBlocking: Array.isArray(project.configuration?.semantic_blocking)
      ? (project.configuration.semantic_blocking as SemanticBlockingConfig[])
      : [],
  }
}
