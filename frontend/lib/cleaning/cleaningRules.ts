/**
 * Data Cleaning Rules
 * Defines available cleaning operations for the drag-and-drop studio
 */

import { DataQualityMetrics } from './dataQuality'

export type CleaningRuleType =
    | 'remove_nulls'
    | 'trim'
    | 'lowercase'
    | 'uppercase'
    | 'remove_duplicates'
    | 'regex_replace'
    | 'standardize_phone'
    | 'remove_special_chars'
    | 'remove_stopwords'
    | 'normalize_text'
    | 'replace_pattern'


export interface CleaningRule {
    id: string
    type: CleaningRuleType
    column: string // Empty string means apply to all columns
    enabled: boolean
    params?: Record<string, any>
}

export interface CleaningRuleDefinition {
    type: CleaningRuleType
    label: string
    description: string
    icon: string
    requiresColumn: boolean
    params?: Array<{
        name: string
        label: string
        type: 'string' | 'number' | 'boolean'
        default?: any
    }>
}

/**
 * Available cleaning operations
 */
export const CLEANING_RULES: CleaningRuleDefinition[] = [
    {
        type: 'remove_nulls',
        label: 'Remove Nulls',
        description: 'Remove rows where the column value is NULL or empty',
        icon: '🗑️',
        requiresColumn: true
    },
    {
        type: 'trim',
        label: 'Trim Whitespace',
        description: 'Remove leading and trailing whitespace',
        icon: '✂️',
        requiresColumn: true
    },
    {
        type: 'lowercase',
        label: 'Lowercase',
        description: 'Convert all text to lowercase',
        icon: '🔤',
        requiresColumn: true
    },
    {
        type: 'uppercase',
        label: 'Uppercase',
        description: 'Convert all text to UPPERCASE',
        icon: '🔠',
        requiresColumn: true
    },
    {
        type: 'remove_duplicates',
        label: 'Remove Duplicates',
        description: 'Remove exact duplicate rows',
        icon: '🔁',
        requiresColumn: false
    },
    {
        type: 'regex_replace',
        label: 'Regex Replace',
        description: 'Replace text using regular expressions',
        icon: '🔍',
        requiresColumn: true,
        params: [
            { name: 'pattern', label: 'Pattern', type: 'string', default: '' },
            { name: 'replacement', label: 'Replacement', type: 'string', default: '' }
        ]
    },
    {
        type: 'standardize_phone',
        label: 'Standardize Phone',
        description: 'Format phone numbers to E.164 format',
        icon: '📞',
        requiresColumn: true
    },
    {
        type: 'remove_special_chars',
        label: 'Remove Special Chars',
        description: 'Remove special characters, keep alphanumeric',
        icon: '🧹',
        requiresColumn: true
    },
    {
        type: 'remove_stopwords',
        label: 'Remove Stopwords',
        description: 'Remove common words (the, a, an, and, or, etc.)',
        icon: '🚫',
        requiresColumn: true,
        params: [
            { name: 'language', label: 'Language', type: 'string', default: 'english' },
            { name: 'customWords', label: 'Custom Words (comma-separated)', type: 'string', default: '' }
        ]
    },
    {
        type: 'normalize_text',
        label: 'Normalize Text',
        description: 'Standardize text format (lowercase, remove accents, etc.)',
        icon: '📝',
        requiresColumn: true,
        params: [
            { name: 'lowercase', label: 'Convert to Lowercase', type: 'boolean', default: true },
            { name: 'removeAccents', label: 'Remove Accents', type: 'boolean', default: true },
            { name: 'removeSpecialChars', label: 'Remove Special Characters', type: 'boolean', default: false },
            { name: 'trimWhitespace', label: 'Trim Whitespace', type: 'boolean', default: true },
            { name: 'removeExtraSpaces', label: 'Remove Extra Spaces', type: 'boolean', default: true }
        ]
    },
    {
        type: 'replace_pattern',
        label: 'Replace Pattern',
        description: 'Find and replace text patterns (regex supported)',
        icon: '🔄',
        requiresColumn: true,
        params: [
            { name: 'pattern', label: 'Find Pattern (regex)', type: 'string', default: '' },
            { name: 'replacement', label: 'Replace With', type: 'string', default: '' },
            { name: 'flags', label: 'Flags (g, i, etc.)', type: 'string', default: 'g' }
        ]
    }
]

/**
 * Generate SQL for a cleaning rule
 */
export function generateCleaningSQL(
    rule: CleaningRule,
    tableName: string,
    tempTableName: string
): string {
    const col = `"${rule.column}"`  // Properly quote column names

    switch (rule.type) {
        case 'remove_nulls':
            return `CREATE OR REPLACE TABLE "${tempTableName}" AS 
                SELECT * FROM "${tableName}" 
                WHERE ${col} IS NOT NULL AND ${col} != ''`

        case 'trim':
            return `CREATE OR REPLACE TABLE "${tempTableName}" AS 
                SELECT * REPLACE (TRIM(${col}) AS ${col}) 
                FROM "${tableName}"`

        case 'lowercase':
            return `CREATE OR REPLACE TABLE "${tempTableName}" AS 
                SELECT * REPLACE (LOWER(${col}) AS ${col}) 
                FROM "${tableName}"`

        case 'uppercase':
            return `CREATE OR REPLACE TABLE "${tempTableName}" AS 
                SELECT * REPLACE (UPPER(${col}) AS ${col}) 
                FROM "${tableName}"`

        case 'remove_duplicates':
            return `CREATE OR REPLACE TABLE "${tempTableName}" AS 
                SELECT DISTINCT * FROM "${tableName}"`

        case 'regex_replace':
            const pattern = rule.params?.pattern || ''
            const replacement = rule.params?.replacement || ''
            return `CREATE OR REPLACE TABLE "${tempTableName}" AS 
                SELECT * REPLACE (
                    REGEXP_REPLACE(${col}, '${pattern}', '${replacement}') AS ${col}
                ) FROM "${tableName}"`

        case 'standardize_phone':
            return `CREATE OR REPLACE TABLE "${tempTableName}" AS 
                SELECT * REPLACE (
                    REGEXP_REPLACE(${col}, '[^0-9+]', '') AS ${col}
                ) FROM "${tableName}"`

        case 'remove_special_chars':
            return `CREATE OR REPLACE TABLE "${tempTableName}" AS 
                SELECT * REPLACE (
                    REGEXP_REPLACE(${col}, '[^a-zA-Z0-9 ]', '') AS ${col}
                ) FROM "${tableName}"`

        case 'remove_stopwords':
            const customWords = rule.params?.customWords || ''
            const stopwordsList = customWords
                ? customWords.split(',').map((w: string) => w.trim()).filter(Boolean)
                : []
            // Import stopwords dynamically or use default pattern
            const stopwordsPattern = stopwordsList.length > 0
                ? `\\\\b(${stopwordsList.join('|')})\\\\b`
                : '\\\\b(the|a|an|and|or|but|in|on|at|to|for|of|with|by|from|as|is|was|are|were|be|been|being|have|has|had|do|does|did)\\\\b'
            return `CREATE OR REPLACE TABLE "${tempTableName}" AS 
                SELECT * REPLACE (
                    TRIM(REGEXP_REPLACE(${col}, '${stopwordsPattern}', '', 'gi')) AS ${col}
                ) FROM "${tableName}"`

        case 'normalize_text':
            let normalizeSQL = col
            if (rule.params?.removeAccents) {
                normalizeSQL = `TRANSLATE(${normalizeSQL}, 'àáâãäåèéêëìíîïòóôõöùúûüýÿñçÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÝŸÑÇ', 'aaaaaaeeeeiiiioooooouuuuyyncAAAAAAEEEEIIIIOOOOOUUUUYYNC')`
            }
            if (rule.params?.removeSpecialChars) {
                normalizeSQL = `REGEXP_REPLACE(${normalizeSQL}, '[^a-zA-Z0-9\\\\s]', '', 'g')`
            }
            if (rule.params?.lowercase) {
                normalizeSQL = `LOWER(${normalizeSQL})`
            }
            if (rule.params?.removeExtraSpaces) {
                normalizeSQL = `REGEXP_REPLACE(${normalizeSQL}, '\\\\s+', ' ', 'g')`
            }
            if (rule.params?.trimWhitespace) {
                normalizeSQL = `TRIM(${normalizeSQL})`
            }
            return `CREATE OR REPLACE TABLE "${tempTableName}" AS 
                SELECT * REPLACE (${normalizeSQL} AS ${col}) FROM "${tableName}"`

        case 'replace_pattern':
            const findPattern = rule.params?.pattern || ''
            const replaceWith = rule.params?.replacement || ''
            const flags = rule.params?.flags || 'g'
            return `CREATE OR REPLACE TABLE "${tempTableName}" AS 
                SELECT * REPLACE (
                    REGEXP_REPLACE(${col}, '${findPattern}', '${replaceWith}', '${flags}') AS ${col}
                ) FROM "${tableName}"`


        default:
            return `SELECT * FROM "${tableName}"`
    }
}

export interface CleaningResult {
    success: boolean
    rowCount: number
    rowsRemoved: number
    columnsModified: string[]
    error?: string
    qualityMetrics?: any
    cleanedFilePath?: string | null
}

/**
 * Apply multiple cleaning rules in sequence with persistence
 * Creates a cleaned version, uploads to storage, and tracks metadata
 */
export async function applyCleaningRules(
    rules: CleaningRule[],
    tableName: string,
    duckDB: any,
    options?: {
        userId?: string
        datasetId?: string
        persistToStorage?: boolean
    }
): Promise<CleaningResult> {
    const { calculateDataQuality, exportTableToCSV } = await import('./dataQuality')
    const { supabase } = await import('@/lib/supabase')

    try {
        const conn = await duckDB.connect()

        // Get initial row count
        const initialCount = await conn.query(`SELECT COUNT(*) as count FROM "${tableName}"`)
        const initialRows = Number(initialCount.toArray()[0].count)

        // Ensure raw table exists
        const rawTableName = `${tableName}_raw`
        const cleanedTableName = `${tableName}_cleaned`

        const rawCheck = await conn.query(`
            SELECT count(*) as cnt FROM information_schema.tables 
            WHERE table_name = '${rawTableName}'
        `)
        const rawExists = Number(rawCheck.toArray()[0]['cnt']) > 0

        if (!rawExists) {
            console.log('Creating raw table from current dataset...')
            await conn.query(`CREATE TABLE "${rawTableName}" AS SELECT * FROM "${tableName}"`)
        }

        // Filter enabled rules
        const enabledRules = rules.filter(r => r.enabled)

        if (enabledRules.length === 0) {
            await conn.close()
            return {
                success: false,
                error: 'No enabled rules to apply',
                rowCount: initialRows,
                rowsRemoved: 0,
                columnsModified: []
            }
        }

        // Apply rules sequentially
        let currentTable = rawTableName
        const columnsModified = new Set<string>()

        for (let i = 0; i < enabledRules.length; i++) {
            const rule = enabledRules[i]
            const tempTable = `temp_clean_${i}`

            try {
                const sql = generateCleaningSQL(rule, currentTable, tempTable)
                await conn.query(sql)

                // Track which columns were modified
                if (rule.column) {
                    columnsModified.add(rule.column)
                } else {
                    // Rule applies to all columns (e.g., remove_nulls)
                    const schemaResult = await conn.query(`DESCRIBE "${tableName}"`)
                    schemaResult.toArray().forEach((row: any) => {
                        columnsModified.add(row.column_name)
                    })
                }

                currentTable = tempTable
            } catch (error: any) {
                console.error(`Failed to apply rule ${rule.type}:`, error)
                // Clean up temp tables
                for (let j = 0; j <= i; j++) {
                    await conn.query(`DROP TABLE IF EXISTS "temp_clean_${j}"`)
                }
                await conn.close()
                return {
                    success: false,
                    error: `Failed to apply ${rule.type}: ${error.message}`,
                    rowCount: initialRows,
                    rowsRemoved: 0,
                    columnsModified: []
                }
            }
        }

        // Create/replace cleaned table with final result
        if (enabledRules.length > 0) {
            await conn.query(`CREATE OR REPLACE TABLE "${cleanedTableName}" AS SELECT * FROM "${currentTable}"`)

            // ALSO overwrite the main table so it reflects the current cleaned state
            await conn.query(`CREATE OR REPLACE TABLE "${tableName}" AS SELECT * FROM "${cleanedTableName}"`)

            // Clean up temp tables
            for (let i = 0; i < enabledRules.length; i++) {
                await conn.query(`DROP TABLE IF EXISTS "temp_clean_${i}"`)
            }
        } else {
            // No rules, just copy raw to cleaned
            await conn.query(`CREATE OR REPLACE TABLE "${cleanedTableName}" AS SELECT * FROM "${rawTableName}"`)
            // Restore main table to raw
            await conn.query(`CREATE OR REPLACE TABLE "${tableName}" AS SELECT * FROM "${rawTableName}"`)
        }

        // Get final row count
        const finalCount = await conn.query(`SELECT COUNT(*) as count FROM "${cleanedTableName}"`)
        const finalRows = Number(finalCount.toArray()[0].count)
        const rowsRemoved = initialRows - finalRows

        // Calculate data quality metrics
        console.log('Calculating data quality metrics...')
        const qualityMetrics = await calculateDataQuality(duckDB, cleanedTableName)

        // Persist to Supabase Storage if requested
        let cleanedFilePath: string | null = null
        if (options?.persistToStorage && options?.userId && options?.datasetId) {
            try {
                console.log('Exporting cleaned data to CSV...')
                const csvData = await exportTableToCSV(duckDB, cleanedTableName)

                // Upload to Supabase Storage
                const fileName = `${tableName}_cleaned_${Date.now()}.csv`
                cleanedFilePath = `${options.userId}/${fileName}`

                console.log('Uploading to Supabase Storage...')
                const { error: uploadError } = await supabase.storage
                    .from('datasets')
                    .upload(cleanedFilePath, new Blob([csvData], { type: 'text/csv' }), {
                        cacheControl: '3600',
                        upsert: true
                    })

                if (uploadError) {
                    console.error('Failed to upload cleaned data:', uploadError)
                } else {
                    console.log('✅ Cleaned data uploaded to storage')

                    // Update dataset metadata
                    const cleaningMetadata = {
                        rulesApplied: enabledRules.map(r => ({
                            type: r.type,
                            column: r.column,
                            params: r.params
                        })),
                        timestamp: new Date().toISOString(),
                        stats: {
                            initialRows,
                            finalRows,
                            rowsRemoved,
                            columnsModified: Array.from(columnsModified)
                        },
                        qualityMetrics
                    }

                    const { error: updateError } = await supabase
                        .from('datasets')
                        .update({
                            cleaning_status: 'cleaned',
                            cleaned_file_path: cleanedFilePath,
                            cleaning_metadata: cleaningMetadata,
                            data_quality_score: qualityMetrics.overall
                        })
                        .eq('id', options.datasetId)

                    if (updateError) {
                        console.error('Failed to update dataset metadata:', updateError)
                    } else {
                        console.log('✅ Dataset metadata updated')
                    }
                }
            } catch (error) {
                console.error('Error persisting cleaned data:', error)
            }
        }

        await conn.close()

        return {
            success: true,
            rowCount: finalRows,
            rowsRemoved,
            columnsModified: Array.from(columnsModified),
            qualityMetrics,
            cleanedFilePath
        }
    } catch (error: any) {
        console.error('Error applying cleaning rules:', error)
        return {
            success: false,
            error: error.message,
            rowCount: 0,
            rowsRemoved: 0,
            columnsModified: [],
            qualityMetrics: undefined,
            cleanedFilePath: undefined
        }
    }
}
