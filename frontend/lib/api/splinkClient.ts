/**
 * API client for entity resolution endpoints
 * Clean abstraction over fetch calls
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

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
    primaryKeyColumn?: string
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
        primary_key_column: primaryKeyColumn
    }

    const response = await fetch(`${API_BASE_URL}/api/resolve`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(request)
    })

    if (!response.ok) {
        const error = await response.json()
        console.error('❌ API Error Details:', JSON.stringify(error, null, 2))
        throw new Error(error.detail || 'Entity resolution failed')
    }

    return response.json()
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

    const response = await fetch(`${API_BASE_URL}/api/resolve/file`, {
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

    const response = await fetch(`${API_BASE_URL}/api/profile`, {
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
    const response = await fetch(`${API_BASE_URL}/api/health`)
    return response.json()
}
