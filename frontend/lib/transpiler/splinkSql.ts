import { BlockingRule, ComparisonPart } from "../store/useBlockingStore"

export function compilePart(part: ComparisonPart): string {
    if (!part.field) return ""

    // Handle spaces in column names by quoting them
    const field = part.field.includes(" ") ? `"${part.field}"` : part.field
    const l = `l.${field}`
    const r = `r.${field}`

    switch (part.method) {
        case "exact":
            return `${l} = ${r}`
        case "fuzzy_levenshtein":
            // Default threshold for Levenshtein in Splink usually requires a specific function or logic
            // DuckDB: levenshtein(s1, s2)
            return `levenshtein(${l}, ${r}) <= 2`
        case "jaro_winkler":
            return `jaro_winkler_similarity(${l}, ${r}) > 0.9`
        case "fuzzy_metaphone":
            // Requires dmetaphone extension in DuckDB, fallback to exact if not sure
            // We'll assume it's available or use soundex which is standard
            return `soundex(${l}) = soundex(${r})`
        case "first_n_chars":
            const n = part.parameters?.n || 1
            return `SUBSTRING(${l}, 1, ${n}) = SUBSTRING(${r}, 1, ${n})`
        default:
            return `${l} = ${r}`
    }
}

export function compileBlockingRule(rule: BlockingRule): string {
    const parts = rule.parts
        .map(compilePart)
        .filter(Boolean) // Remove empty strings

    if (parts.length === 0) return ""

    return parts.join(" AND ")
}

export function compileAllRules(rules: BlockingRule[]): string[] {
    return rules
        .map(compileBlockingRule)
        .filter(Boolean)
}
