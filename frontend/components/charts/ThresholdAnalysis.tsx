"use client"

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts'
import { Activity, AlertCircle } from 'lucide-react'

interface ThresholdAnalysisProps {
    currentThreshold?: number
    onThresholdChange?: (threshold: number) => void
}

interface ThresholdMetrics {
    threshold: number
    match_count: number
    cluster_count: number
    singleton_count: number
    avg_cluster_size: number
    max_cluster_size: number
    avg_match_probability: number
}

interface AnalysisData {
    thresholds: ThresholdMetrics[]
    total_predictions: number
}

export function ThresholdAnalysis({ currentThreshold = 0.5, onThresholdChange }: ThresholdAnalysisProps) {
    const [data, setData] = useState<AnalysisData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const fetchAnalysis = async () => {
            try {
                setLoading(true)
                const response = await fetch('http://localhost:8000/api/threshold-analysis')

                if (!response.ok) {
                    const errorData = await response.json()
                    throw new Error(errorData.detail || 'Failed to fetch analysis')
                }

                const result = await response.json()
                setData(result)
                setError(null)
            } catch (err) {
                console.error('Error fetching threshold analysis:', err)
                setError(err instanceof Error ? err.message : 'Unknown error')
            } finally {
                setLoading(false)
            }
        }

        fetchAnalysis()
    }, [])

    if (loading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Activity className="h-5 w-5" />
                        Threshold Sensitivity Analysis
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-center h-[400px]">
                        <div className="text-muted-foreground">Analyzing thresholds...</div>
                    </div>
                </CardContent>
            </Card>
        )
    }

    if (error) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Activity className="h-5 w-5" />
                        Threshold Sensitivity Analysis
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-center h-[400px]">
                        <div className="text-destructive">{error}</div>
                    </div>
                </CardContent>
            </Card>
        )
    }

    if (!data || data.thresholds.length === 0) return null

    // Find recommended threshold (balanced metrics)
    const recommendedThreshold = data.thresholds.reduce((best, current) => {
        // Balance: maximize clusters while keeping reasonable cluster sizes
        const score = current.cluster_count * (current.avg_cluster_size > 1 ? 1.2 : 1)
        const bestScore = best.cluster_count * (best.avg_cluster_size > 1 ? 1.2 : 1)
        return score > bestScore ? current : best
    })

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    Threshold Sensitivity Analysis
                </CardTitle>
                <CardDescription>
                    How matching metrics change at different threshold values
                </CardDescription>
            </CardHeader>
            <CardContent>
                {/* Key Metrics Table */}
                <div className="mb-6 overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b">
                                <th className="text-left p-2 font-medium">Threshold</th>
                                <th className="text-right p-2 font-medium">Matches</th>
                                <th className="text-right p-2 font-medium">Clusters</th>
                                <th className="text-right p-2 font-medium">Singletons</th>
                                <th className="text-right p-2 font-medium">Avg Size</th>
                                <th className="text-right p-2 font-medium">Max Size</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.thresholds.map((metrics) => {
                                const isCurrent = metrics.threshold === currentThreshold
                                const isRecommended = metrics.threshold === recommendedThreshold.threshold

                                return (
                                    <tr
                                        key={metrics.threshold}
                                        className={`border-b hover:bg-muted/50 cursor-pointer ${isCurrent ? 'bg-blue-50 dark:bg-blue-950/30' : ''
                                            }`}
                                        onClick={() => onThresholdChange?.(metrics.threshold)}
                                    >
                                        <td className="p-2 font-mono">
                                            {metrics.threshold.toFixed(2)}
                                            {isCurrent && <span className="ml-2 text-xs text-blue-600">← Current</span>}
                                            {isRecommended && <span className="ml-2 text-xs text-green-600">✓ Recommended</span>}
                                        </td>
                                        <td className="p-2 text-right">{metrics.match_count.toLocaleString()}</td>
                                        <td className="p-2 text-right">{metrics.cluster_count.toLocaleString()}</td>
                                        <td className="p-2 text-right">{metrics.singleton_count.toLocaleString()}</td>
                                        <td className="p-2 text-right">{metrics.avg_cluster_size.toFixed(2)}</td>
                                        <td className="p-2 text-right">{metrics.max_cluster_size}</td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Line Chart */}
                <ResponsiveContainer width="100%" height={350}>
                    <LineChart data={data.thresholds}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis
                            dataKey="threshold"
                            className="text-xs"
                            label={{ value: 'Threshold', position: 'insideBottom', offset: -5 }}
                            tickFormatter={(value) => value.toFixed(2)}
                        />
                        <YAxis
                            className="text-xs"
                            label={{ value: 'Count', angle: -90, position: 'insideLeft' }}
                        />
                        <Tooltip
                            content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                    const data = payload[0].payload as ThresholdMetrics
                                    return (
                                        <div className="bg-background border rounded-lg p-3 shadow-lg">
                                            <p className="font-medium mb-2">Threshold: {data.threshold.toFixed(2)}</p>
                                            <div className="space-y-1 text-xs">
                                                <div className="flex justify-between gap-4">
                                                    <span className="text-muted-foreground">Matches:</span>
                                                    <span className="font-medium">{data.match_count.toLocaleString()}</span>
                                                </div>
                                                <div className="flex justify-between gap-4">
                                                    <span className="text-muted-foreground">Clusters:</span>
                                                    <span className="font-medium">{data.cluster_count.toLocaleString()}</span>
                                                </div>
                                                <div className="flex justify-between gap-4">
                                                    <span className="text-muted-foreground">Singletons:</span>
                                                    <span className="font-medium">{data.singleton_count.toLocaleString()}</span>
                                                </div>
                                                <div className="flex justify-between gap-4">
                                                    <span className="text-muted-foreground">Avg Size:</span>
                                                    <span className="font-medium">{data.avg_cluster_size.toFixed(2)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                }
                                return null
                            }}
                        />
                        <Legend />
                        <Line
                            type="monotone"
                            dataKey="match_count"
                            stroke="#3b82f6"
                            strokeWidth={2}
                            name="Matches"
                            dot={{ r: 4 }}
                            activeDot={{ r: 6 }}
                        />
                        <Line
                            type="monotone"
                            dataKey="cluster_count"
                            stroke="#10b981"
                            strokeWidth={2}
                            name="Clusters"
                            dot={{ r: 4 }}
                            activeDot={{ r: 6 }}
                        />
                        {currentThreshold && (
                            <ReferenceLine
                                x={currentThreshold}
                                stroke="#ef4444"
                                strokeWidth={2}
                                strokeDasharray="5 5"
                                label={{ value: 'Current', position: 'top', fill: '#ef4444' }}
                            />
                        )}
                    </LineChart>
                </ResponsiveContainer>

                {/* Recommendation */}
                <div className="mt-4 p-4 bg-green-50 dark:bg-green-950/20 rounded-lg">
                    <div className="flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 text-green-600 mt-0.5" />
                        <div className="text-sm">
                            <p className="font-medium text-green-900 dark:text-green-100 mb-1">💡 Recommendation</p>
                            <p className="text-green-700 dark:text-green-300">
                                Based on the analysis, a threshold of <strong>{recommendedThreshold.threshold.toFixed(2)}</strong> appears optimal,
                                yielding {recommendedThreshold.cluster_count.toLocaleString()} clusters with an average size of {recommendedThreshold.avg_cluster_size.toFixed(2)}.
                                {recommendedThreshold.threshold !== currentThreshold && " Click on the row above to select it."}
                            </p>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
