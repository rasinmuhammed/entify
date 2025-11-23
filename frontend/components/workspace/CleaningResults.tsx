"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CheckCircle2, TrendingUp, TrendingDown, Download, BarChart3 } from 'lucide-react'
import { DataQualityMetrics } from '@/lib/cleaning/dataQuality'

interface CleaningResultsProps {
    initialRows: number
    finalRows: number
    rowsRemoved: number
    columnsModified: string[]
    qualityMetrics?: DataQualityMetrics
    cleanedFilePath?: string | null
    onExport?: () => void
    onContinue?: () => void
}

export function CleaningResults({
    initialRows,
    finalRows,
    rowsRemoved,
    columnsModified,
    qualityMetrics,
    cleanedFilePath,
    onExport,
    onContinue
}: CleaningResultsProps) {
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
