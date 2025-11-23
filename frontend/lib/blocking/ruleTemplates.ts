/**
 * Blocking Rule Templates Library
 * Preset patterns for common blocking scenarios in entity resolution
 */

export type RuleCategory = 'exact' | 'fuzzy' | 'compound' | 'geographic' | 'temporal' | 'custom'
export type Selectivity = 'high' | 'medium' | 'low'

export interface BlockingRuleTemplate {
    id: string
    name: string
    description: string
    category: RuleCategory
    sqlExpression: (columns: string[]) => string
    requiredColumns: number
    columnHints?: string[] // Suggested column names
    example: string
    estimatedSelectivity: Selectivity
    splinkFunction?: string
    pros: string[]
    cons: string[]
}

export const BLOCKING_RULE_TEMPLATES: BlockingRuleTemplate[] = [
    // EXACT MATCH RULES
    {
        id: 'exact_email',
        name: 'Exact Email Match',
        description: 'Match records with identical email addresses. Highly selective and reliable for unique identifiers.',
        category: 'exact',
        sqlExpression: (cols) => `l.${cols[0]} = r.${cols[0]}`,
        requiredColumns: 1,
        columnHints: ['email', 'email_address', 'mail'],
        example: 'john.doe@example.com = john.doe@example.com',
        estimatedSelectivity: 'high',
        splinkFunction: 'block_on("email")',
        pros: ['Very high precision', 'Fast to compute', 'No false positives'],
        cons: ['Misses typos', 'Misses different email addresses for same person']
    },
    {
        id: 'exact_id',
        name: 'Exact ID Match',
        description: 'Match on unique identifiers like SSN, customer ID, or account number.',
        category: 'exact',
        sqlExpression: (cols) => `l.${cols[0]} = r.${cols[0]}`,
        requiredColumns: 1,
        columnHints: ['id', 'customer_id', 'ssn', 'account_number', 'unique_id'],
        example: '123-45-6789 = 123-45-6789',
        estimatedSelectivity: 'high',
        splinkFunction: 'block_on("id")',
        pros: ['Perfect precision', 'Deterministic', 'Fast'],
        cons: ['Requires clean, standardized IDs', 'Misses missing IDs']
    },
    {
        id: 'exact_phone',
        name: 'Exact Phone Match',
        description: 'Match records with identical phone numbers (ensure standardized format).',
        category: 'exact',
        sqlExpression: (cols) => `l.${cols[0]} = r.${cols[0]}`,
        requiredColumns: 1,
        columnHints: ['phone', 'phone_number', 'mobile', 'telephone'],
        example: '+1-555-0123 = +1-555-0123',
        estimatedSelectivity: 'high',
        splinkFunction: 'block_on("phone")',
        pros: ['High precision', 'Good for contact matching'],
        cons: ['Requires standardized format', 'People change numbers']
    },

    // FUZZY MATCH RULES
    {
        id: 'name_prefix_3',
        name: 'Name Prefix (3 chars)',
        description: 'Match on first 3 characters of name. Handles minor typos and variations.',
        category: 'fuzzy',
        sqlExpression: (cols) => `SUBSTRING(l.${cols[0]}, 1, 3) = SUBSTRING(r.${cols[0]}, 1, 3)`,
        requiredColumns: 1,
        columnHints: ['name', 'first_name', 'last_name', 'full_name'],
        example: 'Joh = Joh (matches John, Johnny, Johannes)',
        estimatedSelectivity: 'medium',
        pros: ['Catches typos', 'Handles name variations', 'Simple to compute'],
        cons: ['More false positives', 'Common prefixes (e.g., "Smi" for Smith)']
    },
    {
        id: 'name_soundex',
        name: 'Soundex Match',
        description: 'Phonetic matching for names that sound similar but spelled differently.',
        category: 'fuzzy',
        sqlExpression: (cols) => `SOUNDEX(l.${cols[0]}) = SOUNDEX(r.${cols[0]})`,
        requiredColumns: 1,
        columnHints: ['name', 'first_name', 'last_name'],
        example: 'Smith = Smyth (both → S530)',
        estimatedSelectivity: 'medium',
        pros: ['Catches phonetic variations', 'Good for names'],
        cons: ['English-centric', 'Can over-match']
    },
    {
        id: 'email_domain',
        name: 'Email Domain Match',
        description: 'Match records from the same email domain (useful for organizational matching).',
        category: 'fuzzy',
        sqlExpression: (cols) => `SUBSTRING(l.${cols[0]}, POSITION('@' IN l.${cols[0]})) = SUBSTRING(r.${cols[0]}, POSITION('@' IN r.${cols[0]}))`,
        requiredColumns: 1,
        columnHints: ['email'],
        example: '@example.com = @example.com',
        estimatedSelectivity: 'low',
        pros: ['Groups by organization', 'Useful for B2B'],
        cons: ['Very low selectivity', 'Many false positives']
    },

    // COMPOUND RULES
    {
        id: 'compound_name',
        name: 'First + Last Name',
        description: 'Exact match on both first and last name. More selective than single name.',
        category: 'compound',
        sqlExpression: (cols) => `l.${cols[0]} = r.${cols[0]} AND l.${cols[1]} = r.${cols[1]}`,
        requiredColumns: 2,
        columnHints: ['first_name', 'last_name'],
        example: 'John + Smith = John + Smith',
        estimatedSelectivity: 'high',
        splinkFunction: 'block_on(["first_name", "last_name"])',
        pros: ['Higher precision than single name', 'Still relatively fast'],
        cons: ['Misses name changes', 'Misses typos']
    },
    {
        id: 'compound_name_dob',
        name: 'Name + Date of Birth',
        description: 'Match on full name and birth date. Very high precision.',
        category: 'compound',
        sqlExpression: (cols) => `l.${cols[0]} = r.${cols[0]} AND l.${cols[1]} = r.${cols[1]} AND l.${cols[2]} = r.${cols[2]}`,
        requiredColumns: 3,
        columnHints: ['first_name', 'last_name', 'dob'],
        example: 'John + Smith + 1990-01-15',
        estimatedSelectivity: 'high',
        splinkFunction: 'block_on(["first_name", "last_name", "dob"])',
        pros: ['Very high precision', 'Unlikely false positives'],
        cons: ['Requires complete data', 'Very strict']
    },
    {
        id: 'compound_name_zip',
        name: 'Last Name + ZIP Code',
        description: 'Match on last name and location. Good for geographic clustering.',
        category: 'compound',
        sqlExpression: (cols) => `l.${cols[0]} = r.${cols[0]} AND l.${cols[1]} = r.${cols[1]}`,
        requiredColumns: 2,
        columnHints: ['last_name', 'zip_code'],
        example: 'Smith + 90210',
        estimatedSelectivity: 'medium',
        pros: ['Geographic context', 'Reduces common name issues'],
        cons: ['People move', 'Common names in same area']
    },

    // GEOGRAPHIC RULES
    {
        id: 'exact_zip',
        name: 'Exact ZIP Code',
        description: 'Match records in the same ZIP code. Useful for local matching.',
        category: 'geographic',
        sqlExpression: (cols) => `l.${cols[0]} = r.${cols[0]}`,
        requiredColumns: 1,
        columnHints: ['zip_code', 'postal_code', 'zipcode'],
        example: '90210 = 90210',
        estimatedSelectivity: 'low',
        pros: ['Simple', 'Geographic clustering'],
        cons: ['Low selectivity', 'Many people per ZIP']
    },
    {
        id: 'zip_prefix',
        name: 'ZIP Code Prefix (3 digits)',
        description: 'Match on first 3 digits of ZIP (broader geographic area).',
        category: 'geographic',
        sqlExpression: (cols) => `SUBSTRING(l.${cols[0]}, 1, 3) = SUBSTRING(r.${cols[0]}, 1, 3)`,
        requiredColumns: 1,
        columnHints: ['zip_code', 'postal_code'],
        example: '902 = 902 (matches 90210, 90211, etc.)',
        estimatedSelectivity: 'low',
        pros: ['Broader geographic matching', 'Handles moves within region'],
        cons: ['Very low selectivity', 'Large comparison sets']
    },

    // TEMPORAL RULES
    {
        id: 'exact_dob',
        name: 'Exact Date of Birth',
        description: 'Match on exact birth date. Good discriminator when available.',
        category: 'temporal',
        sqlExpression: (cols) => `l.${cols[0]} = r.${cols[0]}`,
        requiredColumns: 1,
        columnHints: ['dob', 'date_of_birth', 'birth_date', 'birthdate'],
        example: '1990-01-15 = 1990-01-15',
        estimatedSelectivity: 'medium',
        pros: ['Good discriminator', 'Stable over time'],
        cons: ['Data quality issues', 'Privacy concerns']
    },
    {
        id: 'birth_year',
        name: 'Birth Year',
        description: 'Match on birth year only. More forgiving than exact date.',
        category: 'temporal',
        sqlExpression: (cols) => `EXTRACT(YEAR FROM l.${cols[0]}) = EXTRACT(YEAR FROM r.${cols[0]})`,
        requiredColumns: 1,
        columnHints: ['dob', 'date_of_birth'],
        example: '1990 = 1990',
        estimatedSelectivity: 'low',
        pros: ['More forgiving', 'Handles partial dates'],
        cons: ['Low selectivity', 'Many people born same year']
    }
]

/**
 * Get templates by category
 */
export function getTemplatesByCategory(category: RuleCategory): BlockingRuleTemplate[] {
    return BLOCKING_RULE_TEMPLATES.filter(t => t.category === category)
}

/**
 * Find templates suitable for given columns
 */
export function suggestTemplates(columns: string[]): BlockingRuleTemplate[] {
    const columnSet = new Set(columns.map(c => c.toLowerCase()))

    return BLOCKING_RULE_TEMPLATES.filter(template => {
        if (!template.columnHints) return false

        // Check if any column hint matches available columns
        return template.columnHints.some(hint =>
            columnSet.has(hint.toLowerCase()) ||
            columns.some(col => col.toLowerCase().includes(hint.toLowerCase()))
        )
    })
}

/**
 * Generate Splink block_on() function call
 */
export function generateBlockOn(columns: string[]): string {
    if (columns.length === 0) return ''
    if (columns.length === 1) {
        return `block_on("${columns[0]}")`
    }
    return `block_on([${columns.map(c => `"${c}"`).join(', ')}])`
}

/**
 * Estimate pair count reduction
 */
export function estimatePairReduction(
    totalRecords: number,
    rule: BlockingRuleTemplate,
    columnCardinality?: number
): {
    totalPairs: number
    blockedPairs: number
    reduction: number
    reductionPercent: number
} {
    const totalPairs = (totalRecords * (totalRecords - 1)) / 2

    // Estimate based on selectivity and cardinality
    let avgBlockSize: number

    if (columnCardinality) {
        avgBlockSize = totalRecords / columnCardinality
    } else {
        // Rough estimates based on selectivity
        switch (rule.estimatedSelectivity) {
            case 'high':
                avgBlockSize = Math.sqrt(totalRecords) / 10
                break
            case 'medium':
                avgBlockSize = Math.sqrt(totalRecords)
                break
            case 'low':
                avgBlockSize = Math.sqrt(totalRecords) * 5
                break
        }
    }

    const blockedPairs = (avgBlockSize * (avgBlockSize - 1)) / 2 * (totalRecords / avgBlockSize)
    const reduction = totalPairs - blockedPairs
    const reductionPercent = (reduction / totalPairs) * 100

    return {
        totalPairs,
        blockedPairs: Math.round(blockedPairs),
        reduction: Math.round(reduction),
        reductionPercent: Math.round(reductionPercent * 10) / 10
    }
}
