"use client"
import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '@/components/ui/table'
import { Database, Download, RefreshCw, BarChart3 } from 'lucide-react'
import { useWasm } from '@/lib/wasm/WasmContext'

interface DataManagerProps {
    tableName: string
    onDataLoaded?: (rowCount: number, columns: string[]) => void
    dataView?: 'raw' | 'cleaned'  // New prop to toggle view
}

export function DataManager({ tableName, onDataLoaded, dataView }: DataManagerProps) {
    const { duckDB, isReady } = useWasm()
    const [previewData, setPreviewData] = useState<any[]>([])
    const [columns, setColumns] = useState<string[]>([])
    const [stats, setStats] = useState<{
        totalRows: number
        columns: Array<{
            name: string
            type: string
            nullCount: number
            uniqueCount: number
        }>
    } | null>(null)
    const [isLoading, setIsLoading] = useState(false)

    useEffect(() => {
        if (tableName && duckDB && isReady) {
            loadData()
        }
    }, [tableName, duckDB, isReady, dataView]) // Reload when dataView changes

    const loadData = async () => {
        if (!duckDB || !tableName) return

        setIsLoading(true)
        try {
            // Determine which table to query
            let targetTable = tableName

            if (dataView === 'cleaned') {
                targetTable = `${tableName}_cleaned`
            } else if (dataView === 'raw') {
                targetTable = `${tableName}_raw`
            }

            const conn = await duckDB.connect()

            // Check if table exists
            const tableCheck = await conn.query(`
                SELECT count(*) as cnt FROM information_schema.tables 
                WHERE table_name = '${targetTable}'
            `)

            let tableExists = Number(tableCheck.toArray()[0]['cnt']) > 0

            // Fallback logic
            if (!tableExists) {
                console.warn(`Table ${targetTable} not found`)

                if (dataView === 'raw') {
                    // Fallback to main table if raw doesn't exist (assuming main IS raw initially)
                    console.log('Raw table not found, falling back to main table')
                    targetTable = tableName
                    tableExists = true // Try main table
                } else if (dataView === 'cleaned') {
                    // Fallback to main table if cleaned doesn't exist
                    console.log('Cleaned table not found, falling back to main table')
                    targetTable = tableName
                    tableExists = true
                }
            }

            // Verify fallback table exists
            if (tableExists) {
                const fallbackCheck = await conn.query(`
                    SELECT count(*) as cnt FROM information_schema.tables 
                    WHERE table_name = '${targetTable}'
                `)
                if (Number(fallbackCheck.toArray()[0]['cnt']) === 0) {
                    tableExists = false
                }
            }

            if (!tableExists) {
                console.warn(`Table ${targetTable} not found in DuckDB - data may not be loaded yet`)
                await conn.close()
                setIsLoading(false)
                return
            }

            // Get preview data
            const previewQuery = `SELECT * FROM "${targetTable}" LIMIT 100`
            const result = await conn.query(previewQuery)
            const rows = result.toArray().map((r: any) => {
                const obj = r.toJSON()
                // Convert BigInt to Number
                Object.keys(obj).forEach(key => {
                    if (typeof obj[key] === 'bigint') {
                        obj[key] = Number(obj[key])
                    }
                })
                return obj
            })
            setPreviewData(rows)

            if (rows.length > 0) {
                const cols = Object.keys(rows[0])
                setColumns(cols)

                // Get stats
                const totalRows = await conn.query(`SELECT COUNT(*) as count FROM "${tableName}"`)
                const rowCount = Number(totalRows.toArray()[0].count) // Convert BigInt to Number

                // Get column stats
                const columnStats = await Promise.all(
                    cols.map(async (col) => {
                        const typeResult = await conn.query(`
                            SELECT typeof ("${col}") as type FROM "${tableName}" LIMIT 1
    `)
                        const nullResult = await conn.query(`
                            SELECT COUNT(*) as count FROM "${tableName}" WHERE "${col}" IS NULL
    `)
                        const uniqueResult = await conn.query(`
                            SELECT COUNT(DISTINCT "${col}") as count FROM "${tableName}"
                        `)

                        return {
                            name: col,
                            type: typeResult.toArray()[0]?.type || 'unknown',
                            nullCount: Number(nullResult.toArray()[0].count), // Convert BigInt to Number
                            uniqueCount: Number(uniqueResult.toArray()[0].count) // Convert BigInt to Number
                        }
                    })
                )

                setStats({
                    totalRows: rowCount,
                    columns: columnStats
                })

                onDataLoaded?.(rowCount, cols)
            }

            await conn.close()
        } catch (error) {
            console.error('Failed to load data:', error)
            // Don't show error to user if it's just a missing table
            if (error instanceof Error && !error.message.includes('does not exist')) {
                alert(`Error loading data: ${error.message} `)
            }
        } finally {
            setIsLoading(false)
        }
    }

    const handleExportCSV = async () => {
        if (!duckDB) return

        try {
            const conn = await duckDB.connect()
            const result = await conn.query(`SELECT * FROM "${tableName}"`)
            const rows = result.toArray().map((r: any) => {
                const obj = r.toJSON()
                // Convert BigInt to Number
                Object.keys(obj).forEach(key => {
                    if (typeof obj[key] === 'bigint') {
                        obj[key] = Number(obj[key])
                    }
                })
                return obj
            })
            await conn.close()

            if (rows.length === 0) return

            // Convert to CSV
            const headers = Object.keys(rows[0])
            const csvRows = [
                headers.join(','),
                ...rows.map(row => headers.map(h => JSON.stringify(row[h] ?? '')).join(','))
            ]
            const csvContent = csvRows.join('\n')

            // Download
            const blob = new Blob([csvContent], { type: 'text/csv' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${tableName} _cleaned.csv`
            a.click()
            URL.revokeObjectURL(url)
        } catch (error) {
            console.error('Failed to export CSV:', error)
        }
    }

    if (!tableName) {
        return (
            <Card>
                <CardContent className="py-10 text-center text-muted-foreground">
                    <Database className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No data loaded</p>
                </CardContent>
            </Card>
        )
    }

    return (
        <div className="space-y-4">
            {/* Stats Overview */}
            {stats && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card>
                        <CardContent className="pt-6">
                            <div className="text-2xl font-bold">{stats.totalRows.toLocaleString()}</div>
                            <p className="text-xs text-muted-foreground">Total Rows</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-6">
                            <div className="text-2xl font-bold">{stats.columns.length}</div>
                            <p className="text-xs text-muted-foreground">Columns</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-6">
                            <div className="text-2xl font-bold">
                                {stats.columns.reduce((sum, col) => sum + col.nullCount, 0)}
                            </div>
                            <p className="text-xs text-muted-foreground">Total Nulls</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-6">
                            <div className="text-2xl font-bold">{previewData.length}</div>
                            <p className="text-xs text-muted-foreground">Preview Rows</p>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Data Preview */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <Database className="h-5 w-5" />
                                Data Preview
                            </CardTitle>
                            <CardDescription>
                                Showing first {previewData.length} rows
                            </CardDescription>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={loadData} disabled={isLoading}>
                                <RefreshCw className={`h - 4 w - 4 mr - 2 ${isLoading ? 'animate-spin' : ''} `} />
                                Refresh
                            </Button>
                            <Button variant="outline" size="sm" onClick={handleExportCSV}>
                                <Download className="h-4 w-4 mr-2" />
                                Export CSV
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border max-h-[400px] overflow-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    {columns.map(col => (
                                        <TableHead key={col} className="font-medium">
                                            <div className="flex flex-col gap-1">
                                                <span>{col}</span>
                                                {stats && (
                                                    <div className="flex gap-1">
                                                        <Badge variant="outline" className="text-xs font-normal">
                                                            {stats.columns.find(c => c.name === col)?.type}
                                                        </Badge>
                                                        {(stats.columns.find(c => c.name === col)?.nullCount || 0) > 0 && (
                                                            <Badge variant="destructive" className="text-xs font-normal">
                                                                {stats.columns.find(c => c.name === col)?.nullCount} nulls
                                                            </Badge>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </TableHead>
                                    ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {previewData.map((row, idx) => (
                                    <TableRow key={idx}>
                                        {columns.map(col => (
                                            <TableCell key={col}>
                                                {row[col] === null || row[col] === undefined ? (
                                                    <span className="text-muted-foreground italic">null</span>
                                                ) : (
                                                    String(row[col])
                                                )}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            {/* Column Statistics */}
            {stats && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <BarChart3 className="h-5 w-5" />
                            Column Statistics
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Column</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead className="text-right">Nulls</TableHead>
                                    <TableHead className="text-right">Null %</TableHead>
                                    <TableHead className="text-right">Unique</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {stats.columns.map(col => (
                                    <TableRow key={col.name}>
                                        <TableCell className="font-medium">{col.name}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline">{col.type}</Badge>
                                        </TableCell>
                                        <TableCell className="text-right">{col.nullCount}</TableCell>
                                        <TableCell className="text-right">
                                            {((col.nullCount / stats.totalRows) * 100).toFixed(1)}%
                                        </TableCell>
                                        <TableCell className="text-right">{col.uniqueCount}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
