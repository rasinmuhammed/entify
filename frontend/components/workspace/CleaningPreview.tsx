"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ArrowRight, Eye } from 'lucide-react'
import { useWasm } from '@/lib/wasm/WasmContext'

interface CleaningPreviewProps {
    tableName: string
    cleanedTableName: string
    columns?: string[]
    maxRows?: number
}

export function CleaningPreview({
    tableName,
    cleanedTableName,
    columns,
    maxRows = 10
}: CleaningPreviewProps) {
    const { duckDB } = useWasm()
    const [beforeData, setBeforeData] = useState<any[]>([])
    const [afterData, setAfterData] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [displayColumns, setDisplayColumns] = useState<string[]>([])

    useEffect(() => {
        loadPreviewData()
    }, [tableName, cleanedTableName, duckDB])

    const loadPreviewData = async () => {
        if (!duckDB) return

        setIsLoading(true)
        try {
            const conn = await duckDB.connect()

            // Load before data
            const beforeResult = await conn.query(`SELECT * FROM "${tableName}" LIMIT ${maxRows}`)
            const beforeRows = beforeResult.toArray().map((r: any) => r.toJSON())
            setBeforeData(beforeRows)

            // Load after data
            const afterResult = await conn.query(`SELECT * FROM "${cleanedTableName}" LIMIT ${maxRows}`)
            const afterRows = afterResult.toArray().map((r: any) => r.toJSON())
            setAfterData(afterRows)

            // Get columns from both before and after (union of all columns)
            if (beforeRows.length > 0 && afterRows.length > 0) {
                const beforeCols = Object.keys(beforeRows[0])
                const afterCols = Object.keys(afterRows[0])

                // Combine columns, preferring to show cleaned columns if they exist
                const allCols = new Set([...beforeCols, ...afterCols])
                const cols = columns || Array.from(allCols)

                // Prioritize showing cleaned columns (those ending with _cleaned or only in after)
                const cleanedCols = cols.filter(c => c.endsWith('_cleaned') || (afterCols.includes(c) && !beforeCols.includes(c)))
                const originalCols = cols.filter(c => !c.endsWith('_cleaned') && beforeCols.includes(c))

                // Show cleaned columns first, then a few original columns
                const displayCols = [...cleanedCols, ...originalCols.slice(0, Math.max(1, 5 - cleanedCols.length))]
                setDisplayColumns(displayCols)
            }

            await conn.close()
        } catch (error) {
            console.error('Failed to load preview data:', error)
        } finally {
            setIsLoading(false)
        }
    }

    if (isLoading) {
        return (
            <Card>
                <CardContent className="py-8 text-center">
                    <p className="text-muted-foreground">Loading preview...</p>
                </CardContent>
            </Card>
        )
    }

    if (beforeData.length === 0) {
        return (
            <Card>
                <CardContent className="py-8 text-center">
                    <Eye className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                    <p className="text-muted-foreground">No data to preview</p>
                </CardContent>
            </Card>
        )
    }

    // Detect changes
    const hasChanges = beforeData.some((beforeRow, idx) => {
        const afterRow = afterData[idx]
        if (!afterRow) return true
        return displayColumns.some(col => beforeRow[col] !== afterRow[col])
    })

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                        <Eye className="h-5 w-5" />
                        Live Preview
                    </CardTitle>
                    <Badge variant={hasChanges ? 'default' : 'secondary'}>
                        {hasChanges ? 'Changes detected' : 'No changes'}
                    </Badge>
                </div>
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-[400px]">
                    <div className="space-y-4">
                        {beforeData.map((beforeRow, rowIdx) => {
                            const afterRow = afterData[rowIdx]
                            if (!afterRow) return null

                            return (
                                <Card key={rowIdx} className="bg-muted/30">
                                    <CardContent className="p-4">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Badge variant="outline" className="text-xs">
                                                Row {rowIdx + 1}
                                            </Badge>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {/* Before */}
                                            <div className="space-y-2">
                                                <p className="text-xs font-medium text-muted-foreground">Before</p>
                                                {displayColumns.map(col => {
                                                    const beforeExists = col in beforeRow
                                                    const beforeValue = beforeExists ? String(beforeRow[col] || '') : null
                                                    const afterValue = String(afterRow[col] || '')
                                                    const changed = beforeExists && beforeValue !== afterValue

                                                    return (
                                                        <div key={col} className="space-y-1">
                                                            <p className="text-xs font-medium">{col}</p>
                                                            <div className={`p-2 rounded text-sm font-mono ${!beforeExists
                                                                    ? 'bg-muted/50 text-muted-foreground'
                                                                    : changed
                                                                        ? 'bg-red-50 dark:bg-red-950/20 border border-red-200'
                                                                        : 'bg-background'
                                                                }`}>
                                                                {!beforeExists ? (
                                                                    <span className="text-muted-foreground italic text-xs">(new column)</span>
                                                                ) : beforeValue ? (
                                                                    beforeValue
                                                                ) : (
                                                                    <span className="text-muted-foreground italic">empty</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>

                                            {/* Arrow */}
                                            <div className="hidden md:flex items-center justify-center">
                                                <ArrowRight className="h-6 w-6 text-muted-foreground" />
                                            </div>

                                            {/* After */}
                                            <div className="space-y-2">
                                                <p className="text-xs font-medium text-muted-foreground">After</p>
                                                {displayColumns.map(col => {
                                                    const beforeValue = String(beforeRow[col] || '')
                                                    const afterValue = String(afterRow[col] || '')
                                                    const changed = beforeValue !== afterValue

                                                    return (
                                                        <div key={col} className="space-y-1">
                                                            <p className="text-xs font-medium">{col}</p>
                                                            <div className={`p-2 rounded text-sm font-mono ${changed ? 'bg-green-50 dark:bg-green-950/20 border border-green-200' : 'bg-background'}`}>
                                                                {afterValue || <span className="text-muted-foreground italic">empty</span>}
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            )
                        })}
                    </div>
                </ScrollArea>

                <p className="text-xs text-muted-foreground mt-4 text-center">
                    Showing {Math.min(beforeData.length, maxRows)} of {beforeData.length} rows •
                    {displayColumns.length} of {Object.keys(beforeData[0] || {}).length} columns
                </p>
            </CardContent>
        </Card>
    )
}
