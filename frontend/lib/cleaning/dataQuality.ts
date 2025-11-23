/**
 * Data Quality Metrics Calculator
 * Analyzes dataset quality across multiple dimensions
 */

export interface DataQualityMetrics {
    completeness: number // % of non-null values (0-100)
    uniqueness: number // % of unique values where applicable (0-100)
    consistency: number // % of values matching expected patterns (0-100)
    validity: number // % of values passing validation rules (0-100)
    overall: number // weighted average quality score (0-100)
    details: {
        totalRows: number
        totalColumns: number
        nullCount: number
        duplicateCount: number
        columnMetrics: ColumnQualityMetric[]
    }
}

export interface ColumnQualityMetric {
    column: string
    type: string
    completeness: number
    uniqueness: number
    nullCount: number
    uniqueCount: number
    sampleValues: any[]
}

/**
 * Calculate comprehensive data quality metrics for a dataset
 */
export async function calculateDataQuality(
    duckDB: any,
    tableName: string
): Promise<DataQualityMetrics> {
    const conn = await duckDB.connect()

    try {
        // Get total row count
        const countResult = await conn.query(`SELECT COUNT(*) as count FROM "${tableName}"`)
        const totalRows = Number(countResult.toArray()[0].count)

        // Get column information
        const schemaResult = await conn.query(`DESCRIBE "${tableName}"`)
        const columns = schemaResult.toArray().map((row: any) => ({
            name: row.column_name,
            type: row.column_type
        }))

        const columnMetrics: ColumnQualityMetric[] = []
        let totalNullCount = 0
        let totalCompletenessSum = 0
        let totalUniquenessSum = 0

        // Analyze each column
        for (const col of columns) {
            const statsQuery = `
                SELECT 
                    COUNT(*) as total_count,
                    COUNT("${col.name}") as non_null_count,
                    COUNT(DISTINCT "${col.name}") as unique_count
                FROM "${tableName}"
            `
            const statsResult = await conn.query(statsQuery)
            const stats = statsResult.toArray()[0]

            const nullCount = Number(stats.total_count) - Number(stats.non_null_count)
            const completeness = (Number(stats.non_null_count) / Number(stats.total_count)) * 100
            const uniqueness = (Number(stats.unique_count) / Number(stats.non_null_count)) * 100

            totalNullCount += nullCount
            totalCompletenessSum += completeness
            totalUniquenessSum += uniqueness

            // Get sample values
            const sampleQuery = `SELECT DISTINCT "${col.name}" FROM "${tableName}" LIMIT 5`
            const sampleResult = await conn.query(sampleQuery)
            const sampleValues = sampleResult.toArray().map((r: any) => {
                const val = r[col.name]
                return typeof val === 'bigint' ? Number(val) : val
            })

            columnMetrics.push({
                column: col.name,
                type: col.type,
                completeness: Math.round(completeness * 100) / 100,
                uniqueness: Math.round(uniqueness * 100) / 100,
                nullCount,
                uniqueCount: Number(stats.unique_count),
                sampleValues
            })
        }

        // Calculate overall metrics
        const avgCompleteness = totalCompletenessSum / columns.length
        const avgUniqueness = totalUniquenessSum / columns.length

        // Check for duplicates (simple check based on all columns)
        const duplicateQuery = `
            SELECT COUNT(*) as dup_count 
            FROM (
                SELECT *, COUNT(*) OVER (PARTITION BY *) as cnt 
                FROM "${tableName}"
            ) WHERE cnt > 1
        `
        let duplicateCount = 0
        try {
            const dupResult = await conn.query(duplicateQuery)
            duplicateCount = Number(dupResult.toArray()[0]?.dup_count || 0)
        } catch (e) {
            // Ignore errors in duplicate detection
            console.warn('Could not calculate duplicates:', e)
        }

        // Consistency: assume 100% for now (can be enhanced with pattern matching)
        const consistency = 100

        // Validity: assume 100% for now (can be enhanced with validation rules)
        const validity = 100

        // Overall score: weighted average
        const overall = Math.round(
            (avgCompleteness * 0.4 +
                avgUniqueness * 0.2 +
                consistency * 0.2 +
                validity * 0.2) * 100
        ) / 100

        await conn.close()

        return {
            completeness: Math.round(avgCompleteness * 100) / 100,
            uniqueness: Math.round(avgUniqueness * 100) / 100,
            consistency,
            validity,
            overall,
            details: {
                totalRows,
                totalColumns: columns.length,
                nullCount: totalNullCount,
                duplicateCount,
                columnMetrics
            }
        }
    } catch (error) {
        await conn.close()
        throw error
    }
}

/**
 * Export table data to CSV string
 */
export async function exportTableToCSV(
    duckDB: any,
    tableName: string
): Promise<string> {
    const conn = await duckDB.connect()

    try {
        // Get all data
        const result = await conn.query(`SELECT * FROM "${tableName}"`)
        const rows = result.toArray().map((r: any) => r.toJSON())

        if (rows.length === 0) {
            throw new Error('No data to export')
        }

        // Convert to CSV
        const headers = Object.keys(rows[0])
        const csvRows = [
            headers.join(','),
            ...rows.map((row: any) =>
                headers.map(h => {
                    const value = row[h]
                    // Escape quotes and wrap in quotes if contains comma or quote
                    if (value === null || value === undefined) return ''
                    const str = String(value)
                    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                        return `"${str.replace(/"/g, '""')}"`
                    }
                    return str
                }).join(',')
            )
        ]

        await conn.close()
        return csvRows.join('\n')
    } catch (error) {
        await conn.close()
        throw error
    }
}
