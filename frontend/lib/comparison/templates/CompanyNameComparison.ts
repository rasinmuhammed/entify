/**
 * Company Name Comparison Template
 * Intelligent multi-level matching for company/organization names
 */

export interface CompanyNameComparisonConfig {
    column: string
    includeAcronymMatch?: boolean
    includeSoundex?: boolean
    jaroWinklerThreshold?: number
    jaccardThreshold?: number
}

/**
 * Legal entity suffixes to strip during normalization
 */
const LEGAL_SUFFIXES = [
    'LLC', 'L.L.C.', 'LLP', 'L.L.P.',
    'Inc', 'Inc.', 'Incorporated',
    'Ltd', 'Ltd.', 'Limited',
    'Corp', 'Corp.', 'Corporation',
    'Co', 'Co.', 'Company',
    'GmbH', 'AG', 'SA', 'SPA', 'NV', 'BV',
    'PLC', 'Pty', 'Pty.', 'LP', 'L.P.'
].map(s => s.toLowerCase())

/**
 * Generate normalization SQL for company names
 */
function generateNormalizationSQL(column: string): string {
    // Remove legal suffixes, extra spaces, punctuation, convert to lowercase
    return `LOWER(REGEXP_REPLACE(REGEXP_REPLACE(${column}, '[.,\\-]', ' ', 'g'), '\\s+', ' ', 'g'))`
}

/**
 * Generate company name comparison for Splink
 */
export function generateCompanyNameComparison(config: CompanyNameComparisonConfig) {
    const {
        column,
        includeAcronymMatch = true,
        includeSoundex = true,
        jaroWinklerThreshold = 0.90,
        jaccardThreshold = 0.7
    } = config

    const comparison_levels = []

    // Level 1: Exact match (original strings)
    comparison_levels.push({
        sql_condition: `${column}_l = ${column}_r`,
        label_for_charts: 'Exact match',
        m_probability: 0.95,
        u_probability: 0.001
    })

    // Level 2: Normalized exact match (after removing suffixes & punctuation)
    const normalizedL = generateNormalizationSQL(`${column}_l`)
    const normalizedR = generateNormalizationSQL(`${column}_r`)

    comparison_levels.push({
        sql_condition: `${normalizedL} = ${normalizedR}`,
        label_for_charts: 'Exact (normalized)',
        m_probability: 0.90,
        u_probability: 0.005
    })

    // Level 3: Acronym match (optional)
    // Match "IBM" to "International Business Machines"
    if (includeAcronymMatch) {
        comparison_levels.push({
            sql_condition: `
        (LENGTH(${column}_l) <= 5 AND ${column}_l = UPPER(REGEXP_REPLACE(${column}_r, '[^A-Z]', '', 'g')))
        OR
        (LENGTH(${column}_r) <= 5 AND ${column}_r = UPPER(REGEXP_REPLACE(${column}_l, '[^A-Z]', '', 'g')))
      `,
            label_for_charts: 'Acronym match',
            m_probability: 0.80,
            u_probability: 0.01
        })
    }

    // Level 4: High Jaro-Winkler similarity (typos/misspellings)
    comparison_levels.push({
        sql_condition: `jaro_winkler_similarity(${normalizedL}, ${normalizedR}) >= ${jaroWinklerThreshold}`,
        label_for_charts: `Jaro-Winkler ≥ ${jaroWinklerThreshold}`,
        m_probability: 0.75,
        u_probability: 0.02
    })

    // Level 5: Soundex (phonetic similarity)
    if (includeSoundex) {
        comparison_levels.push({
            sql_condition: `soundex(${column}_l) = soundex(${column}_r)`,
            label_for_charts: 'Soundex match',
            m_probability: 0.60,
            u_probability: 0.05
        })
    }

    // Level 6: Token Jaccard (word-based overlap)
    // Good for "Google LLC" vs "Google Incorporated"
    comparison_levels.push({
        sql_condition: `jaccard(${column}_l, ${column}_r) >= ${jaccardThreshold}`,
        label_for_charts: `Jaccard ≥ ${jaccardThreshold}`,
        m_probability: 0.50,
        u_probability: 0.08
    })

    // Level 7: Null level (handle nulls)
    comparison_levels.push({
        sql_condition: `${column}_l IS NULL OR ${column}_r IS NULL`,
        label_for_charts: 'Null',
        is_null_level: true,
        m_probability: 0.01,
        u_probability: 0.01
    })

    // Level 8: Else (no match)
    comparison_levels.push({
        sql_condition: 'ELSE',
        label_for_charts: 'No match',
        m_probability: 0.05,
        u_probability: 0.85
    })

    return {
        output_column_name: column,
        comparison_levels,
        comparison_description: 'Intelligent company name matching'
    }
}

/**
 * Check if a column name suggests company/organization data
 */
export function isCompanyColumn(columnName: string): boolean {
    const companyKeywords = [
        'company', 'organization', 'organisation', 'org',
        'business', 'firm', 'entity', 'vendor', 'supplier',
        'customer', 'client', 'corp', 'enterprise'
    ]

    const lowerName = columnName.toLowerCase()
    return companyKeywords.some(keyword => lowerName.includes(keyword))
}

/**
 * Get default config for company name comparison
 */
export function getDefaultCompanyNameConfig(columnName: string): CompanyNameComparisonConfig {
    return {
        column: columnName,
        includeAcronymMatch: true,
        includeSoundex: true,
        jaroWinklerThreshold: 0.90,
        jaccardThreshold: 0.70
    }
}
