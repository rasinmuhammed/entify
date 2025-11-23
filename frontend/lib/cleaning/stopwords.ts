/**
 * Stopwords and Text Processing Utilities
 * Common words to remove during text cleaning
 */

export const ENGLISH_STOPWORDS = [
    // Articles
    'a', 'an', 'the',

    // Conjunctions
    'and', 'or', 'but', 'nor', 'so', 'yet',

    // Prepositions
    'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as',
    'into', 'onto', 'upon', 'about', 'above', 'across', 'after', 'against',
    'along', 'among', 'around', 'before', 'behind', 'below', 'beneath',
    'beside', 'between', 'beyond', 'during', 'except', 'inside', 'near',
    'off', 'out', 'outside', 'over', 'through', 'toward', 'under', 'until',
    'up', 'within', 'without',

    // Pronouns
    'i', 'you', 'he', 'she', 'it', 'we', 'they',
    'me', 'him', 'her', 'us', 'them',
    'my', 'your', 'his', 'her', 'its', 'our', 'their',
    'mine', 'yours', 'hers', 'ours', 'theirs',
    'this', 'that', 'these', 'those',
    'who', 'whom', 'whose', 'which', 'what',

    // Verbs (common)
    'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'having',
    'do', 'does', 'did', 'doing',
    'will', 'would', 'shall', 'should', 'may', 'might', 'must', 'can', 'could',

    // Other common words
    'not', 'no', 'yes', 'all', 'any', 'both', 'each', 'few', 'more', 'most',
    'other', 'some', 'such', 'only', 'own', 'same', 'than', 'too', 'very',
    'just', 'now', 'then', 'there', 'here', 'when', 'where', 'why', 'how'
]

/**
 * Create regex pattern for stopwords removal
 */
export function createStopwordsPattern(stopwords: string[] = ENGLISH_STOPWORDS): string {
    // Escape special regex characters and join with |
    const escaped = stopwords.map(word =>
        word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    )
    return `\\b(${escaped.join('|')})\\b`
}

/**
 * Generate DuckDB SQL for stopwords removal
 */
export function generateStopwordsSQL(column: string, stopwords: string[] = ENGLISH_STOPWORDS): string {
    const pattern = createStopwordsPattern(stopwords)
    return `TRIM(REGEXP_REPLACE(${column}, '${pattern}', '', 'gi'))`
}

/**
 * Generate DuckDB SQL for text normalization
 */
export function generateNormalizeSQL(
    column: string,
    options: {
        lowercase?: boolean
        removeAccents?: boolean
        removeSpecialChars?: boolean
        trimWhitespace?: boolean
        removeExtraSpaces?: boolean
    }
): string {
    let sql = column

    // Remove accents (convert to ASCII)
    if (options.removeAccents) {
        sql = `TRANSLATE(${sql}, 'àáâãäåèéêëìíîïòóôõöùúûüýÿñçÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÝŸÑÇ', 'aaaaaaeeeeiiiioooooouuuuyyncAAAAAAEEEEIIIIOOOOOUUUUYYNC')`
    }

    // Remove special characters (keep only alphanumeric and spaces)
    if (options.removeSpecialChars) {
        sql = `REGEXP_REPLACE(${sql}, '[^a-zA-Z0-9\\s]', '', 'g')`
    }

    // Convert to lowercase
    if (options.lowercase) {
        sql = `LOWER(${sql})`
    }

    // Remove extra spaces
    if (options.removeExtraSpaces) {
        sql = `REGEXP_REPLACE(${sql}, '\\s+', ' ', 'g')`
    }

    // Trim whitespace
    if (options.trimWhitespace) {
        sql = `TRIM(${sql})`
    }

    return sql
}

/**
 * Generate DuckDB SQL for pattern replacement
 */
export function generatePatternReplaceSQL(
    column: string,
    pattern: string,
    replacement: string,
    flags: string = 'g'
): string {
    // Escape single quotes in pattern and replacement
    const escapedPattern = pattern.replace(/'/g, "''")
    const escapedReplacement = replacement.replace(/'/g, "''")

    return `REGEXP_REPLACE(${column}, '${escapedPattern}', '${escapedReplacement}', '${flags}')`
}
