/**
 * Comparison Methods Library
 * Defines available comparison methods for entity matching
 */

export type ComparisonMethod =
    | 'exact'
    | 'levenshtein'
    | 'jaro_winkler'
    | 'jaccard'
    | 'soundex'
    | 'date_diff'
    | 'numeric_diff'
    | 'contains'
    | 'company_name'  // Intelligent company name matching

export interface ComparisonConfig {
    column: string
    enabled: boolean
    method: ComparisonMethod
    weight: number // 0-1, importance of this field
    threshold?: number // For fuzzy methods (0-1)
    params?: {
        case_sensitive?: boolean
        ignore_whitespace?: boolean
        max_distance?: number
        max_days_diff?: number
        max_percent_diff?: number
    }
}

export interface ComparisonMethodDefinition {
    method: ComparisonMethod
    label: string
    description: string
    icon: string
    bestFor: string[]
    example: string
    requiresThreshold: boolean
    defaultThreshold?: number
    splinkEquivalent?: string
}

/**
 * Available comparison methods with metadata
 */
export const COMPARISON_METHODS: ComparisonMethodDefinition[] = [
    {
        method: 'exact',
        label: 'Exact Match',
        description: 'Values must be identical',
        icon: '🎯',
        bestFor: ['IDs', 'Emails', 'Codes'],
        example: '"ABC123" = "ABC123" → 1.0',
        requiresThreshold: false,
        splinkEquivalent: 'exact_match'
    },
    {
        method: 'levenshtein',
        label: 'Levenshtein Distance',
        description: 'Measures minimum character edits needed',
        icon: '✏️',
        bestFor: ['Names with typos', 'Addresses'],
        example: '"Smith" vs "Smyth" (1 edit) → 0.83',
        requiresThreshold: true,
        defaultThreshold: 0.8,
        splinkEquivalent: 'levenshtein'
    },
    {
        method: 'jaro_winkler',
        label: 'Jaro-Winkler',
        description: 'Optimized for short strings like names',
        icon: '👤',
        bestFor: ['First names', 'Last names', 'Short text'],
        example: '"Martha" vs "Marhta" → 0.96',
        requiresThreshold: true,
        defaultThreshold: 0.85,
        splinkEquivalent: 'jaro_winkler'
    },
    {
        method: 'jaccard',
        label: 'Jaccard Similarity',
        description: 'Compares word/token overlap',
        icon: '🔤',
        bestFor: ['Company names', 'Addresses', 'Descriptions'],
        example: '"ABC Corp Inc" vs "ABC Corporation" → 0.67',
        requiresThreshold: true,
        defaultThreshold: 0.7,
        splinkEquivalent: 'jaccard'
    },
    {
        method: 'soundex',
        label: 'Soundex (Phonetic)',
        description: 'Matches words that sound similar',
        icon: '🔊',
        bestFor: ['Names with spelling variations'],
        example: '"Smith" vs "Smythe" → 1.0',
        requiresThreshold: false,
        splinkEquivalent: 'soundex'
    },
    {
        method: 'date_diff',
        label: 'Date Difference',
        description: 'Match if dates are within N days',
        icon: '📅',
        bestFor: ['Birth dates', 'Event dates'],
        example: '2024-01-15 vs 2024-01-17 (2 days) → 1.0',
        requiresThreshold: true,
        defaultThreshold: 7, // days
        splinkEquivalent: 'datediff'
    },
    {
        method: 'numeric_diff',
        label: 'Numeric Difference',
        description: 'Match if numbers are within range',
        icon: '🔢',
        bestFor: ['Ages', 'Amounts', 'Quantities'],
        example: '42 vs 43 (±5%) → 1.0',
        requiresThreshold: true,
        defaultThreshold: 0.05, // 5% difference
        splinkEquivalent: 'numeric_difference'
    },
    {
        method: 'contains',
        label: 'Contains/Substring',
        description: 'One value contains the other',
        icon: '🔍',
        bestFor: ['Addresses', 'Descriptions'],
        example: '"123 Main St" contains "Main" → 1.0',
        requiresThreshold: false,
        splinkEquivalent: 'substring'
    },
    {
        method: 'company_name',
        label: 'Company Name (Smart)',
        description: 'Multi-level intelligent matching for company/organization names',
        icon: '🏢',
        bestFor: ['Company names', 'Organization names', 'Business entities'],
        example: '"Google LLC" vs "Google Incorporated" → 0.95',
        requiresThreshold: false,
        splinkEquivalent: 'custom_template'
    }
]

/**
 * Get comparison methods suitable for a column type
 */
export function getMethodsForColumnType(columnType: 'email' | 'name' | 'date' | 'location' | 'number' | 'text'): ComparisonMethodDefinition[] {
    switch (columnType) {
        case 'email':
            return COMPARISON_METHODS.filter(m => ['exact', 'levenshtein'].includes(m.method))

        case 'name':
            return COMPARISON_METHODS.filter(m =>
                ['exact', 'levenshtein', 'jaro_winkler', 'soundex'].includes(m.method)
            )

        case 'date':
            return COMPARISON_METHODS.filter(m => ['exact', 'date_diff'].includes(m.method))

        case 'location':
            return COMPARISON_METHODS.filter(m =>
                ['exact', 'levenshtein', 'jaro_winkler', 'jaccard', 'contains'].includes(m.method)
            )

        case 'number':
            return COMPARISON_METHODS.filter(m => ['exact', 'numeric_diff'].includes(m.method))

        case 'text':
        default:
            return COMPARISON_METHODS.filter(m =>
                ['exact', 'levenshtein', 'jaro_winkler', 'jaccard', 'contains'].includes(m.method)
            )
    }
}

/**
 * Suggest default comparison method for a column
 */
export function suggestMethod(columnName: string, columnType: string): ComparisonMethod {
    const lower = columnName.toLowerCase()

    if (lower.includes('email')) return 'exact'
    if (lower.includes('id') || lower.includes('code')) return 'exact'
    if (lower.includes('first') || lower.includes('last') || lower.includes('name')) return 'jaro_winkler'
    if (lower.includes('date') || lower.includes('dob')) return 'exact'
    if (lower.includes('age') || lower.includes('amount')) return 'numeric_diff'
    if (lower.includes('address') || lower.includes('street')) return 'jaccard'
    if (lower.includes('phone')) return 'levenshtein'

    // Default based on type
    if (columnType === 'name') return 'jaro_winkler'
    if (columnType === 'date') return 'exact'
    if (columnType === 'number') return 'exact'

    return 'levenshtein'
}

/**
 * Suggest default weight for a column
 */
export function suggestWeight(columnName: string): number {
    const lower = columnName.toLowerCase()

    // High importance (0.3-0.4)
    if (lower.includes('email') || lower.includes('id')) return 0.35
    if (lower.includes('ssn') || lower.includes('tax')) return 0.4

    // Medium-high importance (0.2-0.3)
    if (lower.includes('name')) return 0.25
    if (lower.includes('phone')) return 0.2

    // Medium importance (0.1-0.2)
    if (lower.includes('address')) return 0.15
    if (lower.includes('date')) return 0.15

    // Lower importance (0.05-0.1)
    return 0.1
}

/**
 * Generate Splink comparison configuration
 */
export function generateSplinkComparison(config: ComparisonConfig): any {
    // Special handling for company_name method - use template
    if (config.method === 'company_name') {
        const { generateCompanyNameComparison, getDefaultCompanyNameConfig } = require('./templates/CompanyNameComparison')
        const companyConfig = getDefaultCompanyNameConfig(config.column)
        return generateCompanyNameComparison(companyConfig)
    }

    // Standard methods - ALWAYS include null level + match + else
    const method = COMPARISON_METHODS.find(m => m.method === config.method)
    const column = config.column

    return {
        output_column_name: column,
        comparison_levels: [
            // Level 1: Null level (required by Splink)
            {
                sql_condition: `${column}_l IS NULL OR ${column}_r IS NULL`,
                label_for_charts: "Null",
                is_null_level: true
            },
            // Level 2: Actual comparison (match)
            {
                sql_condition: generateComparisonSQL(config),
                label_for_charts: method?.label || config.method,
                m_probability: config.weight || 0.9,
                u_probability: 0.1
            },
            // Level 3: Else (no match)
            {
                sql_condition: "ELSE",
                label_for_charts: "No match",
                m_probability: 1 - (config.weight || 0.9),
                u_probability: 0.9
            }
        ]
    }
}

/**
 * Generate SQL for comparison
 */
function generateComparisonSQL(config: ComparisonConfig): string {
    // Splink requires _l and _r suffixes for comparisons, not l. and r. aliases
    const l = `"${config.column}_l"`
    const r = `"${config.column}_r"`

    switch (config.method) {
        case 'exact':
            return `${l} = ${r}`

        case 'levenshtein':
            const maxDist = config.threshold ? Math.floor((1 - config.threshold) * 10) : 2
            return `levenshtein(${l}, ${r}) <= ${maxDist}`

        case 'jaro_winkler':
            const minScore = config.threshold || 0.85
            return `jaro_winkler_similarity(${l}, ${r}) >= ${minScore}`

        case 'jaccard':
            const minJaccard = config.threshold || 0.7
            return `jaccard(${l}, ${r}) >= ${minJaccard}`

        case 'soundex':
            return `soundex(${l}) = soundex(${r})`

        case 'date_diff':
            const maxDays = config.params?.max_days_diff || 7
            return `ABS(DATEDIFF('day', ${l}, ${r})) <= ${maxDays}`

        case 'numeric_diff':
            const maxPct = config.params?.max_percent_diff || 0.05
            // Safe division: if denominator is 0, return NULL (no match) or handle appropriately
            // Using NULLIF to avoid division by zero error
            return `ABS(${l} - ${r}) / NULLIF(ABS(${l}), 0) <= ${maxPct}`

        case 'contains':
            return `(${l} LIKE '%' || ${r} || '%' OR ${r} LIKE '%' || ${l} || '%')`

        default:
            return `${l} = ${r}`
    }
}
