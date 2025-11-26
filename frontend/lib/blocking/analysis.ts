import { AsyncDuckDB } from '@duckdb/duckdb-wasm'

export interface BlockingAnalysis {
    rule: string
    column: string
    cardinality: number
    avgBlockSize: number
    comparisons: number
    reduction: number
    efficiency: number
    isEfficient: boolean
}

export interface BlockingSummary {
    baselineComparisons: number
    finalComparisons: number
    totalReduction: number
    estimatedRuntime: string
}

/**
 * Extract column name from blocking rule SQL
 * Examples:
 *   "l.email = r.email" → "email"
 *   "l.first_name = r.first_name" → "first_name"
 */
export function extractColumnFromRule(rule: string): string {
    // Match pattern like "l.column_name = r.column_name"
    const match = rule.match(/l\.(\w+)\s*=\s*r\.\w+/)
    return match ? match[1] : ''
}

/**
 * Get cardinality (unique values) for a column from DuckDB
 */
export async function getColumnCardinality(
    duckDB: AsyncDuckDB,
    tableName: string,
    columnName: string
): Promise<number> {
    try {
        const conn = await duckDB.connect()
        const result = await conn.query(`
            SELECT COUNT(DISTINCT "${columnName}") as cardinality
            FROM "${tableName}"
        `)
        const cardinality = Number(result.toArray()[0].cardinality)
        await conn.close()
        return cardinality
    } catch (error) {
        console.error(`Failed to get cardinality for ${columnName}:`, error)
        return 0
    }
}

/**
 * Calculate efficiency score (0-100)
 * High reduction + high cardinality = high efficiency
 */
export function calculateEfficiency(reduction: number, cardinality: number, datasetSize: number): number {
    // Reduction is already 0-100
    const reductionScore = reduction

    // Cardinality score: higher cardinality = better (more selective)
    // Scale to 0-100 based on dataset size
    const cardinalityRatio = Math.min(cardinality / datasetSize, 1)
    const cardinalityScore = cardinalityRatio * 100

    // Weighted average (reduction is more important)
    const efficiency = (reductionScore * 0.7) + (cardinalityScore * 0.3)

    return Math.round(efficiency)
}

/**
 * Estimate number of comparisons for a blocking rule
 */
export function estimateComparisons(
    datasetSize: number,
    cardinality: number
): number {
    if (cardinality === 0) return 0

    // Average block size
    const avgBlockSize = datasetSize / cardinality

    // Comparisons per block = n * (n-1) / 2
    const comparisonsPerBlock = (avgBlockSize * (avgBlockSize - 1)) / 2

    // Total comparisons across all blocks
    const totalComparisons = cardinality * comparisonsPerBlock

    return Math.round(totalComparisons)
}

/**
 * Analyze all blocking rules and return detailed analysis
 */
export async function analyzeBlockingRules(
    blockingRules: string[],
    datasetSize: number,
    duckDB: AsyncDuckDB,
    tableName: string
): Promise<BlockingAnalysis[]> {
    const results: BlockingAnalysis[] = []

    // Baseline: no blocking
    let cumulativeComparisons = (datasetSize * (datasetSize - 1)) / 2

    for (const rule of blockingRules) {
        // Extract column from rule
        const column = extractColumnFromRule(rule)

        if (!column) {
            console.warn(`Could not extract column from rule: ${rule}`)
            continue
        }

        // Get cardinality from database
        const cardinality = await getColumnCardinality(duckDB, tableName, column)

        if (cardinality === 0) {
            console.warn(`Column ${column} has 0 cardinality`)
            continue
        }

        // Calculate metrics
        const avgBlockSize = datasetSize / cardinality
        const ruleComparisons = estimateComparisons(datasetSize, cardinality)
        const reduction = ((cumulativeComparisons - ruleComparisons) / cumulativeComparisons) * 100
        const efficiency = calculateEfficiency(reduction, cardinality, datasetSize)
        const isEfficient = efficiency >= 70 // Threshold for "good" rule

        results.push({
            rule,
            column,
            cardinality,
            avgBlockSize: Math.round(avgBlockSize * 10) / 10,
            comparisons: ruleComparisons,
            reduction,
            efficiency,
            isEfficient
        })

        // Update cumulative for next rule
        cumulativeComparisons = ruleComparisons
    }

    return results
}

/**
 * Generate summary statistics
 */
export function generateSummary(
    datasetSize: number,
    analysis: BlockingAnalysis[]
): BlockingSummary {
    const baselineComparisons = (datasetSize * (datasetSize - 1)) / 2
    const finalComparisons = analysis.length > 0
        ? analysis[analysis.length - 1].comparisons
        : baselineComparisons
    const totalReduction = ((baselineComparisons - finalComparisons) / baselineComparisons) * 100

    // Rough runtime estimation (very approximate)
    // Assume 10,000 comparisons per second
    const runtimeSeconds = finalComparisons / 10000
    const estimatedRuntime = formatRuntime(runtimeSeconds)

    return {
        baselineComparisons,
        finalComparisons,
        totalReduction,
        estimatedRuntime
    }
}

/**
 * Format runtime in human-readable format
 */
function formatRuntime(seconds: number): string {
    if (seconds < 1) return '< 1 second'
    if (seconds < 60) return `${Math.round(seconds)} seconds`
    if (seconds < 3600) return `${Math.round(seconds / 60)} minutes`
    return `${Math.round(seconds / 3600)} hours`
}

/**
 * Format large numbers with abbreviations
 */
export function formatNumber(num: number): string {
    if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}B`
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`
    return num.toString()
}

/**
 * Generate AI-powered recommendations
 */
export function generateRecommendations(
    analysis: BlockingAnalysis[],
    datasetSize: number
): Array<{ type: 'success' | 'warning' | 'info'; message: string }> {
    const recommendations = []

    for (let i = 0; i < analysis.length; i++) {
        const result = analysis[i]

        // Excellent rules (>99% reduction)
        if (result.reduction > 99) {
            recommendations.push({
                type: 'success' as const,
                message: `Rule on "${result.column}" reduces ${result.reduction.toFixed(1)}% of comparisons - excellent!`
            })
        }

        // Good rules (90-99% reduction)
        else if (result.reduction > 90) {
            recommendations.push({
                type: 'info' as const,
                message: `Rule on "${result.column}" reduces ${result.reduction.toFixed(1)}% - good performance`
            })
        }

        // Poor rules (<50% reduction)
        else if (result.reduction < 50) {
            recommendations.push({
                type: 'warning' as const,
                message: `Rule on "${result.column}" only reduces ${result.reduction.toFixed(1)}% - consider removing or reordering`
            })
        }

        // Low cardinality warning (< 10 unique values)
        if (result.cardinality < 10) {
            recommendations.push({
                type: 'warning' as const,
                message: `Column "${result.column}" has only ${result.cardinality} unique values - too broad for efficient blocking`
            })
        }

        // Check for similar columns (potential redundancy)
        const similars = analysis.filter((r, idx) =>
            idx !== i && (
                r.column.includes(result.column) ||
                result.column.includes(r.column)
            )
        )
        if (similars.length > 0) {
            recommendations.push({
                type: 'info' as const,
                message: `Multiple rules use similar columns (${result.column}) - check for redundancy`
            })
        }
    }

    // Overall assessment
    const avgEfficiency = analysis.reduce((sum, r) => sum + r.efficiency, 0) / analysis.length
    if (avgEfficiency > 80) {
        recommendations.push({
            type: 'success' as const,
            message: 'Overall blocking strategy is highly efficient!'
        })
    } else if (avgEfficiency < 50) {
        recommendations.push({
            type: 'warning' as const,
            message: 'Overall blocking efficiency is low - consider adding more selective rules'
        })
    }

    return recommendations
}

/**
 * Auto-optimize blocking rules by reordering them
 */
export function optimizeBlockingRules(
    rules: string[],
    analysis: BlockingAnalysis[]
): string[] {
    // Sort by efficiency (highest first)
    const sorted = [...analysis].sort((a, b) => b.efficiency - a.efficiency)

    // Return rules in optimized order
    return sorted.map(a => a.rule)
}
