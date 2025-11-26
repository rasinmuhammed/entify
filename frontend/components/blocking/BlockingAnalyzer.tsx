"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { BarChart3, TrendingDown, Zap, AlertCircle, CheckCircle, Info, Sparkles } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { AsyncDuckDB } from '@duckdb/duckdb-wasm'
import {
    analyzeBlockingRules,
    generateSummary,
    generateRecommendations,
    optimizeBlockingRules,
    formatNumber,
    BlockingAnalysis
} from '@/lib/blocking/analysis'

interface BlockingAnalyzerProps {
    blockingRules: string[]
    datasetSize: number
    duckDB?: AsyncDuckDB | null
    tableName?: string
    onOptimize?: (optimizedRules: string[]) => void
}

export function BlockingAnalyzer({
    blockingRules,
    datasetSize,
    duckDB,
    tableName,
    onOptimize
}: BlockingAnalyzerProps) {
    const [analysis, setAnalysis] = useState<BlockingAnalysis[]>([])
    const [isAnalyzing, setIsAnalyzing] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (blockingRules.length > 0 && duckDB && tableName) {
            runAnalysis()
        }
    }, [blockingRules, datasetSize, duckDB, tableName])

    const runAnalysis = async () => {
        if (!duckDB || !tableName) {
            setError('Database not ready')
            return
        }

        setIsAnalyzing(true)
        setError(null)

        try {
            const results = await analyzeBlockingRules(
                blockingRules,
                datasetSize,
                duckDB,
                tableName
            )
            setAnalysis(results)
        } catch (err: any) {
            console.error('Analysis failed:', err)
            setError(err.message || 'Analysis failed')
        } finally {
            setIsAnalyzing(false)
        }
    }

    const summary = analysis.length > 0 ? generateSummary(datasetSize, analysis) : null
    const recommendations = analysis.length > 0 ? generateRecommendations(analysis, datasetSize) : []

    // Prepare chart data
    const chartData = analysis.length > 0 ? [
        {
            name: 'Baseline',
            comparisons: summary!.baselineComparisons,
            label: 'No Blocking'
        },
        ...analysis.map((a, idx) => ({
            name: `Rule ${idx + 1}`,
            comparisons: a.comparisons,
            label: a.column
        }))
    ] : []

    const handleOptimize = () => {
        const optimized = optimizeBlockingRules(blockingRules, analysis)
        onOptimize?.(optimized)
    }

    if (blockingRules.length === 0) {
        return (
            <Card>
                <CardContent className="p-6 text-center text-muted-foreground">
                    <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Add blocking rules to see performance analysis</p>
                </CardContent>
            </Card>
        )
    }

    if (isAnalyzing) {
        return (
            <Card>
                <CardContent className="p-6 text-center">
                    <div className="animate-pulse">
                        <BarChart3 className="h-12 w-12 mx-auto mb-4 text-primary" />
                        <p className="text-muted-foreground">Analyzing blocking rules...</p>
                    </div>
                </CardContent>
            </Card>
        )
    }

    if (error) {
        return (
            <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
            </Alert>
        )
    }

    return (
        <div className="space-y-6">
            {/* Performance Summary */}
            {summary && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card>
                        <CardContent className="p-4">
                            <div className="text-sm text-muted-foreground mb-1">Baseline Comparisons</div>
                            <div className="text-2xl font-bold text-muted-foreground line-through">
                                {formatNumber(summary.baselineComparisons)}
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-primary">
                        <CardContent className="p-4">
                            <div className="text-sm text-muted-foreground mb-1">After Blocking</div>
                            <div className="text-2xl font-bold text-primary">
                                {formatNumber(summary.finalComparisons)}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                                Est. runtime: {summary.estimatedRuntime}
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-green-50 dark:bg-green-950/20 border-green-600">
                        <CardContent className="p-4">
                            <div className="flex items-center gap-2 mb-1">
                                <TrendingDown className="h-4 w-4 text-green-600" />
                                <div className="text-sm text-green-700 dark:text-green-400">Total Reduction</div>
                            </div>
                            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                                {summary.totalReduction.toFixed(1)}%
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Cumulative Comparisons Chart */}
            {chartData.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <BarChart3 className="h-5 w-5" />
                            Cumulative Comparisons
                        </CardTitle>
                        <CardDescription>
                            Visual representation of comparison reduction through blocking rules
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                            <LineChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis
                                    dataKey="name"
                                    tick={{ fontSize: 12 }}
                                />
                                <YAxis
                                    scale="log"
                                    domain={['auto', 'auto']}
                                    tick={{ fontSize: 12 }}
                                    tickFormatter={(value) => formatNumber(value)}
                                />
                                <Tooltip
                                    formatter={(value: number) => formatNumber(value)}
                                    labelFormatter={(label) => chartData.find(d => d.name === label)?.label || label}
                                />
                                <Legend />
                                <Line
                                    type="monotone"
                                    dataKey="comparisons"
                                    stroke="#3b82f6"
                                    strokeWidth={2}
                                    name="Total Comparisons"
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            )}

            {/* Rule-by-Rule Analysis */}
            <Card>
                <CardHeader>
                    <CardTitle>Rule-by-Rule Analysis</CardTitle>
                    <CardDescription>Detailed breakdown of each blocking rule's impact</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3">
                        {analysis.map((result, idx) => (
                            <Card key={idx} className={result.isEfficient ? 'border-green-500/50' : 'border-orange-500/50'}>
                                <CardContent className="p-4">
                                    <div className="flex items-start justify-between mb-2">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <Badge variant="outline">Rule {idx + 1}</Badge>
                                                <code className="text-xs bg-muted px-2 py-1 rounded">
                                                    {result.rule}
                                                </code>
                                            </div>
                                        </div>
                                        <Badge
                                            variant={result.isEfficient ? 'default' : 'secondary'}
                                            className={result.isEfficient ? 'bg-green-600' : ''}
                                        >
                                            {result.efficiency}/100
                                        </Badge>
                                    </div>

                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                        <div>
                                            <div className="text-muted-foreground text-xs">Comparisons</div>
                                            <div className="font-semibold">{formatNumber(result.comparisons)}</div>
                                        </div>
                                        <div>
                                            <div className="text-muted-foreground text-xs">Reduction</div>
                                            <div className="font-semibold text-green-600">
                                                {result.reduction.toFixed(1)}%
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-muted-foreground text-xs">Cardinality</div>
                                            <div className="font-semibold">{formatNumber(result.cardinality)}</div>
                                        </div>
                                        <div>
                                            <div className="text-muted-foreground text-xs">Avg Block Size</div>
                                            <div className="font-semibold">{result.avgBlockSize}</div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Recommendations */}
            {recommendations.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Sparkles className="h-5 w-5" />
                            AI Recommendations
                        </CardTitle>
                        <CardDescription>Insights and suggestions to improve your blocking strategy</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {recommendations.map((rec, idx) => (
                                <Alert key={idx} variant={rec.type === 'warning' ? 'destructive' : 'default'}>
                                    {rec.type === 'success' && <CheckCircle className="h-4 w-4" />}
                                    {rec.type === 'warning' && <AlertCircle className="h-4 w-4" />}
                                    {rec.type === 'info' && <Info className="h-4 w-4" />}
                                    <AlertDescription>{rec.message}</AlertDescription>
                                </Alert>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Actions */}
            {onOptimize && analysis.length > 1 && (
                <div className="flex items-center gap-3">
                    <Button onClick={handleOptimize} className="flex items-center gap-2">
                        <Zap className="h-4 w-4" />
                        Auto-Optimize Rule Order
                    </Button>
                    <p className="text-sm text-muted-foreground">
                        Reorder rules by efficiency for best performance
                    </p>
                </div>
            )}
        </div>
    )
}
