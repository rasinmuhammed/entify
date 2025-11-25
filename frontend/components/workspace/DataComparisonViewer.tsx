"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Download, ArrowLeftRight, Info } from 'lucide-react'
import { AsyncDuckDB } from '@duckdb/duckdb-wasm'

interface DataComparisonViewerProps {
    duckDB: AsyncDuckDB | null
    originalTableName: string
    cleanedTableName?: string
    onClose?: () => void
}

interface ColumnComparison {
    column: string
    originalValue: any
    cleanedValue: any
    isDifferent: boolean
    changeType: 'modified' | 'added' | 'removed' | 'unchanged'
}

interface RowComparison {
    rowId: string | number
    columns: ColumnComparison[]
}

export function DataComparisonViewer({
    duckDB,
    originalTableName,
    cleanedTableName,
    onClose
}: DataComparisonViewerProps) {
    const [originalData, setOriginalData] = useState<any[]>([])
    const [cleanedData, setCleanedData] = useState<any[]>([])
    const [comparison, setComparison] = useState<RowComparison[]>([])
    const [stats, setStats] = useState({
        totalRows: 0,
        rowsModified: 0,
        columnsModified: 0,
        totalChanges: 0
    })
    const [loading, setLoading] = useState(true)
    const [activeView, setActiveView] = useState<'original' | 'cleaned' | 'comparison'>('comparison')

    useEffect(() => {
        if (duckDB) {
            loadData()
        }
    }, [duckDB, originalTableName, cleanedTableName])

    const loadData = async () => {
        if (!duckDB) return
        setLoading(true)

        try {
            const conn = await duckDB.connect()

            // Load original data
            const originalResult = await conn.query(`SELECT * FROM ${originalTableName} LIMIT 100`)
            const originalRows = originalResult.toArray().map(row => row.toJSON())
            setOriginalData(originalRows)

            // Load cleaned data if available
            if (cleanedTableName) {
                const cleanedResult = await conn.query(`SELECT * FROM ${cleanedTableName} LIMIT 100`)
                const cleanedRows = cleanedResult.toArray().map(row => row.toJSON())
                setCleanedData(cleanedRows)

                // Generate comparison
                const comparisonData = generateComparison(originalRows, cleanedRows)
                setComparison(comparisonData)
            }

            await conn.close()
        } catch (error) {
            console.error('Error loading data:', error)
        } finally {
            setLoading(false)
        }
    }

    const generateComparison = (original: any[], cleaned: any[]): RowComparison[] => {
        const comparisons: RowComparison[] = []
        let totalChanges = 0
        const modifiedColumns = new Set<string>()

        original.forEach((origRow, idx) => {
            const cleanRow = cleaned[idx]
            if (!cleanRow) return

            const columnComparisons: ColumnComparison[] = []
            const origKeys = Object.keys(origRow)
            const cleanKeys = Object.keys(cleanRow)
            const allKeys = new Set([...origKeys, ...cleanKeys])

            allKeys.forEach(key => {
                const origValue = origRow[key]
                const cleanValue = cleanRow[key]
                const isDifferent = origValue !== cleanValue

                if (isDifferent) {
                    totalChanges++
                    modifiedColumns.add(key)
                }

                let changeType: ColumnComparison['changeType'] = 'unchanged'
                if (!origKeys.includes(key)) changeType = 'added'
                else if (!cleanKeys.includes(key)) changeType = 'removed'
                else if (isDifferent) changeType = 'modified'

                columnComparisons.push({
                    column: key,
                    originalValue: origValue,
                    cleanedValue: cleanValue,
                    isDifferent,
                    changeType
                })
            })

            comparisons.push({
                rowId: origRow.id || origRow.unique_id || idx,
                columns: columnComparisons
            })
        })

        // Update stats
        setStats({
            totalRows: original.length,
            rowsModified: comparisons.filter(c => c.columns.some(col => col.isDifferent)).length,
            columnsModified: modifiedColumns.size,
            totalChanges
        })

        return comparisons
    }

    const exportComparison = () => {
        const csv = generateComparisonCSV()
        const blob = new Blob([csv], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `data_comparison_${Date.now()}.csv`
        a.click()
    }

    const generateComparisonCSV = (): string => {
        if (comparison.length === 0) return ''

        const headers = ['Row ID', 'Column', 'Original Value', 'Cleaned Value', 'Status']
        const rows = comparison.flatMap(row =>
            row.columns
                .filter(col => col.isDifferent)
                .map(col => [
                    row.rowId,
                    col.column,
                    col.originalValue ?? '',
                    col.cleanedValue ?? '',
                    col.changeType
                ])
        )

        return [headers, ...rows].map(row => row.join(',')).join('\n')
    }

    if (loading) {
        return (
            <Card>
                <CardContent className="p-6">
                    <div className="text-center text-muted-foreground">
                        Loading data comparison...
                    </div>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card className="w-full">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <ArrowLeftRight className="h-5 w-5" />
                            Data Comparison
                        </CardTitle>
                        <CardDescription>
                            Compare original and cleaned datasets side-by-side
                        </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={exportComparison}>
                            <Download className="h-4 w-4 mr-2" />
                            Export Comparison
                        </Button>
                        {onClose && (
                            <Button variant="ghost" size="sm" onClick={onClose}>
                                Close
                            </Button>
                        )}
                    </div>
                </div>
            </CardHeader>

            <CardContent>
                {/* Statistics */}
                <div className="grid grid-cols-4 gap-4 mb-6">
                    <div className="bg-muted/50 rounded-lg p-3">
                        <div className="text-xs text-muted-foreground">Total Rows</div>
                        <div className="text-2xl font-bold">{stats.totalRows}</div>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3">
                        <div className="text-xs text-muted-foreground">Rows Modified</div>
                        <div className="text-2xl font-bold text-blue-600">{stats.rowsModified}</div>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3">
                        <div className="text-xs text-muted-foreground">Columns Modified</div>
                        <div className="text-2xl font-bold text-orange-600">{stats.columnsModified}</div>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3">
                        <div className="text-xs text-muted-foreground">Total Changes</div>
                        <div className="text-2xl font-bold text-green-600">{stats.totalChanges}</div>
                    </div>
                </div>

                {/* Tabs for different views */}
                <Tabs value={activeView} onValueChange={(v) => setActiveView(v as any)}>
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="original">Original Data</TabsTrigger>
                        <TabsTrigger value="cleaned">Cleaned Data</TabsTrigger>
                        <TabsTrigger value="comparison">Comparison</TabsTrigger>
                    </TabsList>

                    {/* Original Data View */}
                    <TabsContent value="original" className="mt-4">
                        <div className="rounded-lg border overflow-auto max-h-[500px]">
                            <table className="w-full text-sm">
                                <thead className="bg-muted sticky top-0">
                                    <tr>
                                        {originalData[0] && Object.keys(originalData[0]).map(key => (
                                            <th key={key} className="px-4 py-2 text-left font-medium">
                                                {key}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {originalData.map((row, idx) => (
                                        <tr key={idx} className="border-t hover:bg-muted/50">
                                            {Object.values(row).map((value: any, vIdx) => (
                                                <td key={vIdx} className="px-4 py-2">
                                                    {value?.toString() || '-'}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </TabsContent>

                    {/* Cleaned Data View */}
                    <TabsContent value="cleaned" className="mt-4">
                        <div className="rounded-lg border overflow-auto max-h-[500px]">
                            <table className="w-full text-sm">
                                <thead className="bg-muted sticky top-0">
                                    <tr>
                                        {cleanedData[0] && Object.keys(cleanedData[0]).map(key => (
                                            <th key={key} className="px-4 py-2 text-left font-medium">
                                                {key}
                                                {key.endsWith('_clean') && (
                                                    <Badge variant="secondary" className="ml-2 text-xs">
                                                        Cleaned
                                                    </Badge>
                                                )}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {cleanedData.map((row, idx) => (
                                        <tr key={idx} className="border-t hover:bg-muted/50">
                                            {Object.values(row).map((value: any, vIdx) => (
                                                <td key={vIdx} className="px-4 py-2">
                                                    {value?.toString() || '-'}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </TabsContent>

                    {/* Comparison View */}
                    <TabsContent value="comparison" className="mt-4">
                        <div className="space-y-4">
                            {comparison.slice(0, 20).map((row, idx) => {
                                const hasChanges = row.columns.some(col => col.isDifferent)
                                if (!hasChanges) return null

                                return (
                                    <Card key={idx} className="border-l-4 border-l-blue-500">
                                        <CardHeader className="pb-3">
                                            <CardTitle className="text-sm">
                                                Row ID: {row.rowId}
                                                <Badge variant="outline" className="ml-2">
                                                    {row.columns.filter(c => c.isDifferent).length} changes
                                                </Badge>
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="space-y-2">
                                                {row.columns.filter(col => col.isDifferent).map((col, cIdx) => (
                                                    <div key={cIdx} className="flex items-center gap-4 p-2 bg-muted/30 rounded">
                                                        <div className="font-medium w-32 text-sm">{col.column}</div>
                                                        <div className="flex-1 flex items-center gap-2">
                                                            <div className="flex-1 text-sm text-muted-foreground line-through">
                                                                {String(col.originalValue || '-')}
                                                            </div>
                                                            <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
                                                            <div className="flex-1 text-sm font-medium text-green-600 dark:text-green-400">
                                                                {String(col.cleanedValue || '-')}
                                                            </div>
                                                        </div>
                                                        <Badge variant={
                                                            col.changeType === 'modified' ? 'default' :
                                                                col.changeType === 'added' ? 'secondary' :
                                                                    'destructive'
                                                        }>
                                                            {col.changeType}
                                                        </Badge>
                                                    </div>
                                                ))}
                                            </div>
                                        </CardContent>
                                    </Card>
                                )
                            })}
                        </div>
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    )
}
