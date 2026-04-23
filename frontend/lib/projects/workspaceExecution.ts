import type { AsyncDuckDB } from '@duckdb/duckdb-wasm'

import type { ComparisonConfig } from '@/lib/comparison/comparisonMethods'
import { generateSplinkComparison } from '@/lib/comparison/comparisonMethods'
import { runEntityResolution, type EntityResolutionResponse } from '@/lib/api/splinkClient'
import { createClient } from '@/utils/supabase/client'
import type { DatasetProfile } from '@/lib/store/useDatasetStore'
import {
  buildCsvFromRows,
  extractColumnsFromRows,
  getPrimaryTableVariants,
  normalizeDatasetTableName,
  serializeDuckDbRows,
} from '@/lib/projects/workspaceData'

type SupabaseClient = ReturnType<typeof createClient>
type PreviewRow = Record<string, unknown>

type SemanticBlockingConfig = Array<{
  column: string
  run_id: string
  rule: string
}>

type DuckDbJsonRow = {
  toJSON(): Record<string, unknown>
}

type LoadDatasetParams = {
  activeProjectId?: string
  dataset: Pick<DatasetProfile, 'name' | 'file_path'>
  duckDB: AsyncDuckDB
  getErrorMessage: (error: unknown) => string
  supabase: SupabaseClient
}

export type LoadDatasetResult = {
  isDataLoaded: boolean
  previewData: PreviewRow[]
  dataColumns: string[]
}

type RunProjectResolutionParams = {
  activeDataset: Pick<DatasetProfile, 'name'>
  blockingRules: string[]
  comparisons: ComparisonConfig[]
  duckDB: AsyncDuckDB
  globalSettings: {
    probability_two_random_records_match: number
  }
  primaryKey?: string
  semanticBlocking: SemanticBlockingConfig
}

export async function loadDatasetIntoDuckDb({
  activeProjectId,
  dataset,
  duckDB,
  getErrorMessage,
  supabase,
}: LoadDatasetParams): Promise<LoadDatasetResult> {
  const conn = await duckDB.connect()

  try {
    const tableName = normalizeDatasetTableName(dataset.name)
    const tableCheck = await conn.query(`
      SELECT count(*) as cnt FROM information_schema.tables
      WHERE table_name = '${dataset.name}'
    `)

    const tableExists = Number(tableCheck.toArray()[0]['cnt']) > 0

    if (tableExists) {
      const cleanedCheck = await conn.query(`
        SELECT count(*) as cnt FROM information_schema.tables
        WHERE table_name = '${tableName}_cleaned'
      `)
      const cleanedExists = Number(cleanedCheck.toArray()[0]['cnt']) > 0
      const tableToQuery = cleanedExists ? `${tableName}_cleaned` : tableName
      const preview = await conn.query(`SELECT * FROM "${tableToQuery}" LIMIT 5`)
      const previewRows = serializeDuckDbRows(preview.toArray() as DuckDbJsonRow[])

      return {
        isDataLoaded: true,
        previewData: previewRows,
        dataColumns: extractColumnsFromRows(previewRows),
      }
    }

    if (!dataset.file_path) {
      return {
        isDataLoaded: false,
        previewData: [],
        dataColumns: [],
      }
    }

    const { data: fileData, error: downloadError } = await supabase.storage
      .from('datasets')
      .download(dataset.file_path)

    if (downloadError || !fileData) {
      throw new Error(downloadError?.message || 'File not found in storage')
    }

    const fileName = `${dataset.name}.csv`
    await duckDB.registerFileHandle(fileName, fileData, 2, true)

    for (const variant of getPrimaryTableVariants(dataset.name)) {
      try {
        await conn.query(`DROP TABLE IF EXISTS "${variant}"`)
      } catch {
        // Ignore missing table variants from earlier runs.
      }
    }

    try {
      await conn.query(`CREATE TABLE "${tableName}" AS SELECT * FROM read_csv_auto('${fileName}')`)
    } catch (createError) {
      if (!getErrorMessage(createError).includes('already exists')) {
        throw createError
      }
    }

    try {
      await conn.query(`CREATE TABLE "${tableName}_original" AS SELECT * FROM "${tableName}"`)
    } catch (backupError) {
      if (!getErrorMessage(backupError).includes('already exists')) {
        console.warn('Could not create original table:', getErrorMessage(backupError))
      }
    }

    if (activeProjectId) {
      const { error } = await supabase
        .from('projects')
        .update({
          original_file_path: fileName,
          last_updated: new Date().toISOString(),
        })
        .eq('id', activeProjectId)

      if (error) {
        console.error('Failed to save original file path:', error)
      }
    }

    const preview = await conn.query(`SELECT * FROM "${tableName}" LIMIT 5`)
    const previewRows = serializeDuckDbRows(preview.toArray() as DuckDbJsonRow[])

    return {
      isDataLoaded: true,
      previewData: previewRows,
      dataColumns: extractColumnsFromRows(previewRows),
    }
  } finally {
    await conn.close()
  }
}

export async function runProjectResolution({
  activeDataset,
  blockingRules,
  comparisons,
  duckDB,
  globalSettings,
  primaryKey,
  semanticBlocking,
}: RunProjectResolutionParams): Promise<EntityResolutionResponse> {
  const conn = await duckDB.connect()

  try {
    const tableName = normalizeDatasetTableName(activeDataset.name)
    let tableToUse = tableName

    try {
      const cleanedTableCheck = await conn.query(`
        SELECT count(*) as cnt FROM information_schema.tables
        WHERE table_name = '${tableName}_cleaned'
      `)
      const cleanedExists = Number(cleanedTableCheck.toArray()[0]['cnt']) > 0
      if (cleanedExists) {
        tableToUse = `${tableName}_cleaned`
      }
    } catch {
      console.log(`Using raw data from ${tableName}`)
    }

    const result = await conn.query(`SELECT * FROM "${tableToUse}"`)
    const rows = serializeDuckDbRows(result.toArray() as DuckDbJsonRow[])
    const { headers, csvData } = buildCsvFromRows(rows)

    const splinkComparisons = comparisons.map((comparison) => generateSplinkComparison(comparison))
    const possibleIdColumns = ['id', '_id', 'unique_id', 'pk', 'key']
    let uniqueIdCol = headers.find((header) => possibleIdColumns.includes(header.toLowerCase()))

    if (!uniqueIdCol) {
      uniqueIdCol = headers.find((header) => header.toLowerCase().endsWith('id'))
    }

    if (!uniqueIdCol) {
      uniqueIdCol = headers[0]
    }

    const settings = {
      link_type: 'dedupe_only',
      unique_id_column_name: uniqueIdCol,
      probability_two_random_records_match: globalSettings.probability_two_random_records_match,
      blocking_rules_to_generate_predictions: blockingRules,
      comparisons: splinkComparisons,
    }

    console.log('\n════════════════════════════════════════════════════════════')
    console.log('🚀 FRONTEND: Sending to Backend API')
    console.log('════════════════════════════════════════════════════════════')
    console.log(`📊 Dataset: ${tableToUse}`)
    console.log(`📏 Rows: ${rows.length}`)
    console.log(`🔑 Unique ID: ${uniqueIdCol}`)
    console.log('\n📦 Full Settings Object:')
    console.log(JSON.stringify(settings, null, 2))
    console.log('════════════════════════════════════════════════════════════\n')

    return runEntityResolution(
      csvData,
      settings,
      0.5,
      primaryKey,
      semanticBlocking
    )
  } finally {
    await conn.close()
  }
}

export function getWorkspaceColumns(
  dataColumns: string[],
  datasetColumns: Array<string | { column: string }> | undefined,
  previewData: PreviewRow[]
) {
  if (dataColumns.length > 0) {
    return dataColumns
  }

  if (datasetColumns && datasetColumns.length > 0) {
    return datasetColumns.map((column) => typeof column === 'string' ? column : column.column)
  }

  if (previewData.length > 0) {
    return Object.keys(previewData[0])
  }

  return []
}
