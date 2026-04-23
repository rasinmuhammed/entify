type JsonLikeRecord = Record<string, unknown>

type DuckDbRowLike = {
    toJSON(): JsonLikeRecord
}

export function normalizeDatasetTableName(name: string) {
    return name.replace(/[^a-zA-Z0-9_]/g, "_")
}

export function serializeDuckDbRows(rows: DuckDbRowLike[]) {
    return rows.map((row) => {
        const record = row.toJSON()

        Object.keys(record).forEach((key) => {
            if (typeof record[key] === "bigint") {
                record[key] = Number(record[key])
            }
        })

        return record
    })
}

export function extractColumnsFromRows(rows: JsonLikeRecord[]) {
    if (rows.length === 0) {
        return []
    }

    return Object.keys(rows[0])
}

export function buildCsvFromRows(rows: JsonLikeRecord[]) {
    if (rows.length === 0) {
        throw new Error("No data to process")
    }

    const headers = Object.keys(rows[0])
    const csvRows = [
        headers.join(","),
        ...rows.map((row) => headers.map((header) => JSON.stringify(row[header] ?? "")).join(",")),
    ]

    return {
        headers,
        csvData: csvRows.join("\n"),
    }
}

export function getPrimaryTableVariants(datasetName: string) {
    const normalizedTableName = normalizeDatasetTableName(datasetName)

    return [
        datasetName,
        normalizedTableName,
        `${datasetName}_raw`,
        `${normalizedTableName}_raw`,
        `${datasetName}_cleaned`,
        `${normalizedTableName}_cleaned`,
    ]
}
