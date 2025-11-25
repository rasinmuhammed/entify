"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CheckCircle2, TrendingUp, TrendingDown, Download, BarChart3, Table, ArrowLeftRight } from 'lucide-react'
import { DataQualityMetrics } from '@/lib/cleaning/dataQuality'
import { DataComparisonViewer } from './DataComparisonViewer'

interface CleaningResultsProps {
    initialRows: number
    finalRows: number
    rowsRemoved: number
    columnsModified: string[]
    qualityMetrics?: DataQualityMetrics
    cleanedFilePath?: string | null
    onExport?: () => void
    onContinue?: () => void
    duckDB?: any  // DuckDB instance for data preview
    tableName?: string  // Table name for preview
}

export function CleaningResults({
    initialRows,
    finalRows,
    rowsRemoved,
    columnsModified,
    qualityMetrics,
    cleanedFilePath,
    onExport,
    onContinue,
    duckDB,
    tableName
}: CleaningResultsProps) {
    const [rawData, setRawData] = useState<any[]>([])
    const [cleanedData, setCleanedData] = useState<any[]>([])
    const [dataView, setDataView] = useState<'raw' | 'cleaned'>('cleaned')
    const [loadingData, setLoadingData] = useState(false)

    useEffect(() => {
        if (duckDB && tableName) {
            loadDataPreviews()
        }
    }, [duckDB, tableName])

    const loadDataPreviews = async () => {
        if (!duckDB || !tableName) return

        setLoadingData(true)
        try {
            const conn = await duckDB.connect()

            // Load raw data preview
            const rawResult = await conn.query(`SELECT * FROM "${tableName}_raw" LIMIT 100`)
            setRawData(rawResult.toArray().map((r: any) => r.toJSON()))

            // Load cleaned data preview
            const cleanedResult = await conn.query(`SELECT * FROM "${tableName}_cleaned" LIMIT 100`)
            setCleanedData(cleanedResult.toArray().map((r: any) => r.toJSON()))

            await conn.close()
        } catch (error) {
            console.error('Failed to load data previews:', error)
        } finally {
            setLoadingData(false)
        }
    }

    const qualityScore = qualityMetrics?.overall || 0
    const qualityGrade = qualityScore >= 90 ? { label: 'Excellent', color: 'bg-green-500', emoji: '🏆' } :
        qualityScore >= 75 ? { label: 'Good', color: 'bg-blue-500', emoji: '✅' } :
            qualityScore >= 60 ? { label: 'Fair', color: 'bg-yellow-500', emoji: '⚠️' } :
                { label: 'Needs Work', color: 'bg-red-500', emoji: '❌' }

    return (
        <div className="space-y-6">
            {/* Success Header */}
            <Card className="border-green-500/50 bg-green-50/50 dark:bg-green-950/20">
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <CheckCircle2 className="h-8 w-8 text-green-600" />
                        <div>
                            <CardTitle className="text-2xl">Cleaning Complete!</CardTitle>
                            <CardDescription>Your data has been successfully cleaned and optimized</CardDescription>
                        </div>
                    </div>
                </CardHeader>
            </Card>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Row Count */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Total Rows</CardDescription>
                        <CardTitle className="text-3xl">{finalRows.toLocaleString()}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {rowsRemoved > 0 ? (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <TrendingDown className="h-4 w-4 text-red-500" />
                                <span>-{rowsRemoved.toLocaleString()} rows removed</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <TrendingUp className="h-4 w-4 text-green-500" />
                                <span>No rows removed</span>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Columns Modified */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Columns Modified</CardDescription>
                        <CardTitle className="text-3xl">{columnsModified.length}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {columnsModified.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                                {columnsModified.slice(0, 3).map(col => (
                                    <Badge key={col} variant="secondary" className="text-xs">
                                        {col}
                                    </Badge>
                                ))}
                                {columnsModified.length > 3 && (
                                    <Badge variant="outline" className="text-xs">
                                        +{columnsModified.length - 3} more
                                    </Badge>
                                )}
                            </div>
                        ) : (
                            <span className="text-sm text-muted-foreground">No changes</span>
                        )}
                    </CardContent>
                </Card>

                {/* Quality Score */}
                <Card className="relative overflow-hidden">
                    <div className={`absolute inset-0 ${qualityGrade.color} opacity-5`} />
                    <CardHeader className="pb-3">
                        <CardDescription>Data Quality Score</CardDescription>
                        <CardTitle className="text-3xl flex items-center gap-2">
                            {qualityScore.toFixed(1)}
                            <span className="text-lg text-muted-foreground">/100</span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-2">
                            <span className="text-2xl">{qualityGrade.emoji}</span>
                            <Badge className={qualityGrade.color}>
                                {qualityGrade.label}
                            </Badge>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Quality Breakdown */}
            {qualityMetrics && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <BarChart3 className="h-5 w-5" />
                            Quality Breakdown
                        </CardTitle>
                        <CardDescription>Detailed metrics across different dimensions</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {[
                                { label: 'Completeness', value: qualityMetrics.completeness, desc: 'Non-null values' },
                                { label: 'Uniqueness', value: qualityMetrics.uniqueness, desc: 'Distinct values' },
                                { label: 'Consistency', value: qualityMetrics.consistency, desc: 'Pattern matching' },
                                { label: 'Validity', value: qualityMetrics.validity, desc: 'Validation rules' }
                            ].map(metric => (
                                <div key={metric.label} className="space-y-2">
                                    <div className="flex items-center justify-between text-sm">
                                        <div>
                                            <span className="font-medium">{metric.label}</span>
                                            <span className="text-muted-foreground ml-2">({metric.desc})</span>
                                        </div>
                                        <span className="font-semibold">{metric.value.toFixed(1)}%</span>
                                    </div>
                                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-primary transition-all"
                                            style={{ width: `${metric.value}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Data Preview */}
            {duckDB && tableName && (rawData.length > 0 || cleanedData.length > 0) && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Table className="h-5 w-5" />
                            Data Preview
                        </CardTitle>
                        <CardDescription>Compare raw and cleaned data side by side</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Tabs value={dataView} onValueChange={(v) => setDataView(v as any)}>
                            <TabsList className="grid w-full grid-cols-3 mb-4">
                                <TabsTrigger value="raw">
                                    Raw Data ({rawData.length} rows)
                                </TabsTrigger>
                                <TabsTrigger value="cleaned">
                                    Cleaned Data ({cleanedData.length} rows)
                                </TabsTrigger>
                                <TabsTrigger value="comparison">
                                    <ArrowLeftRight className="h-4 w-4 mr-2" />
                                    Comparison
                                </TabsTrigger>
                            </TabsList>

                            <TabsContent value="raw" className="mt-0">
                                {rawData.length > 0 ? (
                                    <div className="border rounded-lg overflow-auto max-h-[400px]">
                                        <table className="w-full text-sm">
                                            <thead className="bg-muted sticky top-0">
                                                <tr>
                                                    {Object.keys(rawData[0]).map((key) => (
                                                        <th key={key} className="px-4 py-2 text-left font-medium">
                                                            {key}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {rawData.slice(0, 10).map((row, idx) => (
                                                    <tr key={idx} className="border-t hover:bg-muted/50">
                                                        {Object.values(row).map((val: any, i) => (
                                                            <td key={i} className="px-4 py-2">
                                                                {val?.toString() || '-'}
                                                            </td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <div className="text-center py-8 text-muted-foreground">
                                        No raw data available
                                    </div>
                                )}                            </TabsContent>

                            <TabsContent value="cleaned" className="mt-0">
                                {cleanedData.length > 0 ? (
                                    <div className="border rounded-lg overflow-auto max-h-[400px]">
                                        <table className="w-full text-sm">
                                            <thead className="bg-muted sticky top-0">
                                                <tr>
                                                    {Object.keys(cleanedData[0]).map((key) => {
                                                        const isCleaned = key.endsWith('_clean')
                                                        return (
                                                            <th key={key} className={`px-4 py-2 text-left font-medium ${isCleaned ? 'bg-green-50/50 dark:bg-green-900/10' : ''}`}>
                                                                <div className="flex items-center gap-2">
                                                                    {key}
                                                                    {isCleaned && (
                                                                        <Badge variant="default" className="bg-green-600 hover:bg-green-700 text-[10px] h-5 px-1.5">
                                                                            Cleaned
                                                                        </Badge>
                                                                    )}
                                                                </div>
                                                            </th>
                                                        )
                                                    })}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {cleanedData.slice(0, 10).map((row, idx) => (
                                                    <tr key={idx} className="border-t hover:bg-muted/50">
                                                        {Object.entries(row).map(([key, val]: [string, any], i) => (
                                                            <td key={i} className={`px-4 py-2 ${key.endsWith('_clean') ? 'bg-green-50/30 dark:bg-green-900/5' : ''}`}>
                                                                {val?.toString() || '-'}
                                                            </td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <div className="text-center py-8 text-muted-foreground">
                                        No cleaned data available
                                    </div>
                                )}
                            </TabsContent>

                            <TabsContent value="comparison" className="mt-0">
                                <DataComparisonViewer
                                    duckDB={duckDB}
                                    originalTableName={`${tableName}_original`}
                                    cleanedTableName={tableName}
                                />
                            </TabsContent>
                        </Tabs>
                    </CardContent>
                </Card>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3">
                {cleanedFilePath && onExport && (
                    <Button variant="outline" onClick={onExport}>
                        <Download className="h-4 w-4 mr-2" />
                        Export Cleaned Data
                    </Button>
                )}
                {onContinue && (
                    <Button onClick={onContinue} size="lg">
                        Continue to Matching
                    </Button>
                )}
            </div>
        </div>
    )
}
