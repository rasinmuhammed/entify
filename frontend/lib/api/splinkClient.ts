/**
 * API client for entity resolution endpoints
 * Clean abstraction over fetch calls
 */

import { buildApiUrl, fetchApiJson } from "@/lib/api/client"

export interface SplinkSettings {
    link_type: string
    unique_id_column_name: string
    blocking_rules_to_generate_predictions: string[]
    comparisons: Array<{
        output_column_name: string
        comparison_levels: Array<{
            sql_condition: string
            label_for_charts?: string
            m_probability?: number
            u_probability?: number
        }>
    }>
}

export interface EntityResolutionRequest {
    data: string // Base64-encoded CSV
    settings: SplinkSettings
    threshold: number
    table_name?: string
    primary_key_column?: string
    semantic_blocking?: Array<{
        column: string
        run_id: string
        rule: string
    }>
}

export interface EntityResolutionResponse {
    status: string
    matches: any[]
    total_pairs: number
    execution_time_ms: number
    clusters?: any[]
    error?: string
}

/**
 * Run entity resolution using real Splink on server
 */
export async function runEntityResolution(
    csvData: string,
    settings: SplinkSettings,
    threshold: number = 0.5,
    primaryKeyColumn?: string,
    semanticBlocking?: Array<{ column: string; run_id: string; rule: string }>
): Promise<EntityResolutionResponse> {
    // Encode CSV as base64 (UTF-8 safe, handles large data)
    const encoder = new TextEncoder()
    const data = encoder.encode(csvData)

    // Process in chunks to avoid call stack overflow
    const CHUNK_SIZE = 8192
    let binary = ''
    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
        const chunk = data.slice(i, i + CHUNK_SIZE)
        binary += String.fromCharCode(...Array.from(chunk))
    }
    const base64Data = btoa(binary)

    const request: EntityResolutionRequest = {
        data: base64Data,
        settings,
        threshold,
        primary_key_column: primaryKeyColumn,
        semantic_blocking: semanticBlocking
    }

    return fetchApiJson<EntityResolutionResponse>('/api/resolve', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(request)
    })
}

/**
 * Upload file and run resolution (alternative endpoint)
 */
export async function runEntityResolutionFromFile(
    file: File,
    settings: SplinkSettings,
    threshold: number = 0.5
): Promise<EntityResolutionResponse> {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('settings', JSON.stringify(settings))
    formData.append('threshold', threshold.toString())

    const response = await fetch(buildApiUrl('/api/resolve/file'), {
        method: 'POST',
        body: formData
    })

    if (!response.ok) {
        throw new Error('Entity resolution failed')
    }

    return response.json()
}

/**
 * Profile dataset
 */
export async function profileDataset(file: File) {
    const formData = new FormData()
    formData.append('file', file)

    const response = await fetch(buildApiUrl('/api/profile'), {
        method: 'POST',
        body: formData
    })

    if (!response.ok) {
        throw new Error('Dataset profiling failed')
    }

    return response.json()
}

/**
 * Health check
 */
export async function checkHealth() {
    return fetchApiJson('/api/health')
}

/**
 * Ask the backend to infer a complete matching configuration.
 *
 * This is the capability the whole project is built around, and until now it
 * existed only as an endpoint: the workspace made you write blocking rules by
 * hand, which is exactly the barrier auto-configuration was meant to remove.
 *
 * Returns the primary key, blocking rules, comparisons and a threshold, each
 * with the reason it was chosen, so the UI can show the decisions rather than
 * silently applying them.
 */
export type AutoConfigColumn = {
    name: string
    role: string
    distinct: number
    empty_ratio: number
    uniqueness: number
    used_for_matching: boolean
    reason: string
}

export type AutoConfigResult = {
    primary_key_column: string | null
    threshold: number
    estimated_pairs: number
    notes: string[]
    columns: AutoConfigColumn[]
    settings: {
        blocking_rules_to_generate_predictions: string[]
        comparisons: Array<Record<string, unknown>>
        unique_id_column_name?: string
    }
}

export async function autoConfigure(
    csvData: string,
    threshold: number = 0.95,
    tableName: string = "input_data"
): Promise<AutoConfigResult> {
    const formData = new FormData()
    // Sent as a file rather than base64: the endpoint takes an upload, and a
    // Blob avoids building a second copy of the data as a string.
    formData.append("file", new Blob([csvData], { type: "text/csv" }), "data.csv")
    formData.append("threshold", threshold.toString())
    formData.append("table_name", tableName)

    const response = await fetch(buildApiUrl("/api/autoconfig"), {
        method: "POST",
        body: formData,
    })

    if (!response.ok) {
        const detail = await response.json().catch(() => null)
        throw new Error(
            detail?.detail ?? `Auto-configuration failed (${response.status})`
        )
    }

    return response.json()
}
