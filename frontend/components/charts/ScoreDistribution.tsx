"use client"

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts'
import { TrendingUp, BarChart3 } from 'lucide-react'

interface ScoreDistributionProps {
    currentThreshold?: number
}

interface DistributionData {
    bins: number[]
    counts: number[]
    total_comparisons: number
    statistics: {
        mean: number
        median: number
        std: number
        min: number
        max: number
    }
}

export function ScoreDistribution({ currentThreshold = 0.5 }: ScoreDistributionProps) {
    const [data, setData] = useState<DistributionData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const fetchDistribution = async () => {
            try {
                setLoading(true)
                const response = await fetch('http://localhost:8000/api/score-distribution')

                if (!response.ok) {
                    const errorData = await response.json()
                    throw new Error(errorData.detail || 'Failed to fetch distribution')
                }

                const result = await response.json()
                setData(result)
                setError(null)
            } catch (err) {
                console.error('Error fetching score distribution:', err)
                setError(err instanceof Error ? err.message : 'Unknown error')
            } finally {
                setLoading(false)
            }
        }

        fetchDistribution()
    }, [])

    if (loading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <BarChart3 className="h-5 w-5" />
                        Match Score Distribution
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-center h-[300px]">
                        <div className="text-muted-foreground">Loading distribution...</div>
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
                        <BarChart3 className="h-5 w-5" />
                        Match Score Distribution
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-center h-[300px]">
                        <div className="text-destructive">{error}</div>
                    </div>
                </CardContent>
            </Card>
        )
    }

    if (!data) return null

    // Prepare chart data
    const chartData = data.bins.slice(0, -1).map((binStart, index) => {
        const binEnd = data.bins[index + 1]
        const midpoint = (binStart + binEnd) / 2

        return {
            range: `${binStart.toFixed(2)}-${binEnd.toFixed(2)}`,
            midpoint: midpoint,
            count: data.counts[index],
            label: `${(midpoint * 100).toFixed(0)}%`
        }
    })

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Match Score Distribution
                </CardTitle>
                <CardDescription>
                    Distribution of match probabilities across {data.total_comparisons.toLocaleString()} comparisons
                </CardDescription>
            </CardHeader>
            <CardContent>
                {/* Summary Statistics */}
                <div className="grid grid-cols-4 gap-4 mb-6">
                    <div className="text-center p-3 bg-muted/30 rounded-lg">
                        <div className="text-xs text-muted-foreground">Mean</div>
                        <div className="text-lg font-semibold">{(data.statistics.mean * 100).toFixed(1)}%</div>
                    </div>
                    <div className="text-center p-3 bg-muted/30 rounded-lg">
                        <div className="text-xs text-muted-foreground">Median</div>
                        <div className="text-lg font-semibold">{(data.statistics.median * 100).toFixed(1)}%</div>
                    </div>
                    <div className="text-center p-3 bg-muted/30 rounded-lg">
                        <div className="text-xs text-muted-foreground">Std Dev</div>
                        <div className="text-lg font-semibold">{(data.statistics.std * 100).toFixed(1)}%</div>
                    </div>
                    <div className="text-center p-3 bg-muted/30 rounded-lg">
                        <div className="text-xs text-muted-foreground">Range</div>
                        <div className="text-lg font-semibold">
                            {(data.statistics.min * 100).toFixed(0)}-{(data.statistics.max * 100).toFixed(0)}%
                        </div>
                    </div>
                </div>

                {/* Histogram Chart */}
                <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis
                            dataKey="label"
                            className="text-xs"
                            label={{ value: 'Match Probability', position: 'insideBottom', offset: -5 }}
                        />
                        <YAxis
                            className="text-xs"
                            label={{ value: 'Count', angle: -90, position: 'insideLeft' }}
                        />
                        <Tooltip
                            content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                    const data = payload[0].payload
                                    return (
                                        <div className="bg-background border rounded-lg p-3 shadow-lg">
                                            <p className="font-medium">{data.range}</p>
                                            <p className="text-sm text-muted-foreground">
                                                Count: {data.count.toLocaleString()}
                                            </p>
                                            <p className="text-sm text-muted-foreground">
                                                {((data.count / chartData.reduce((sum, d) => sum + d.count, 0)) * 100).toFixed(1)}% of total
                                            </p>
                                        </div>
                                    )
                                }
                                return null
                            }}
                        />
                        <Bar
                            dataKey="count"
                            fill="#3b82f6"
                            radius={[8, 8, 0, 0]}
                        />
                        {currentThreshold && (
                            <ReferenceLine
                                x={`${(currentThreshold * 100).toFixed(0)}%`}
                                stroke="#ef4444"
                                strokeWidth={2}
                                strokeDasharray="5 5"
                                label={{ value: 'Current Threshold', position: 'top', fill: '#ef4444' }}
                            />
                        )}
                    </BarChart>
                </ResponsiveContainer>

                {/* Insights */}
                <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                    <div className="flex items-start gap-3">
                        <TrendingUp className="h-5 w-5 text-blue-600 mt-0.5" />
                        <div className="text-sm">
                            <p className="font-medium text-blue-900 dark:text-blue-100 mb-1">💡 Insight</p>
                            <p className="text-blue-700 dark:text-blue-300">
                                {data.statistics.mean > 0.8
                                    ? "High average score indicates strong matching confidence across comparisons."
                                    : data.statistics.mean < 0.3
                                        ? "Low average score suggests most comparisons are non-matches. This is normal for large datasets."
                                        : "Mixed distribution - consider adjusting your threshold based on precision/recall needs."}
                            </p>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
