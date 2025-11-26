"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { GlassCard } from "@/components/ui/glass-card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
    Activity,
    BarChart3,
    Zap,
    Target,
    TrendingUp,
    Users,
    Network,
    Clock
} from "lucide-react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts"

interface MatchStatistics {
    dataset: {
        total_records: number
        max_possible_comparisons: number
    }
    comparisons: {
        actual_comparisons: number
        blocking_efficiency_percent: number
        comparisons_avoided: number
    }
    matches: {
        total_matches: number
        high_confidence: number
        medium_confidence: number
        low_confidence: number
        match_rate_percent: number
    }
    clusters: {
        singletons: number
        pairs: number
        small_groups_3_5: number
        medium_groups_6_10: number
        large_groups_10_plus: number
        total_clusters: number
        largest_cluster_size: number
        avg_cluster_size: number
    }
    threshold: number
}

interface MatchingInsightsPanelProps {
    tableName?: string
    threshold?: number
    onClusterSizeClick?: (range: { min: number, max: number } | null) => void
}

const RANGE_MAP: Record<string, { min: number, max: number }> = {
    "Singletons": { min: 1, max: 1 },
    "Pairs": { min: 2, max: 2 },
    "3-5 entities": { min: 3, max: 5 },
    "6-10 entities": { min: 6, max: 10 },
    ">10 entities": { min: 11, max: 999999 }
}

export function MatchingInsightsPanel({
    tableName = "input_data",
    threshold = 0.9,
    onClusterSizeClick
}: MatchingInsightsPanelProps) {
    const [stats, setStats] = useState<MatchStatistics | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        fetchStatistics()
    }, [tableName, threshold])

    const fetchStatistics = async () => {
        try {
            setLoading(true)
            setError(null)
            const response = await fetch(
                `http://localhost:8000/api/match-statistics?table_name=${tableName}&threshold=${threshold}`
            )

            if (!response.ok) {
                throw new Error("Failed to fetch statistics")
            }

            const data = await response.json()
            setStats(data)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unknown error")
        } finally {
            setLoading(false)
        }
    }

    if (loading) {
        return (
            <GlassCard className="p-6">
                <div className="flex items-center justify-center h-40">
                    <Activity className="h-8 w-8 animate-pulse text-muted-foreground" />
                </div>
            </GlassCard>
        )
    }

    if (error || !stats) {
        return (
            <GlassCard className="p-6">
                <div className="text-center text-muted-foreground">
                    <p>Unable to load statistics</p>
                    {error && <p className="text-xs mt-1">{error}</p>}
                </div>
            </GlassCard>
        )
    }

    // Prepare chart data
    const matchDistribution = [
        { name: "High (≥95%)", value: stats.matches.high_confidence, color: "#10b981" },
        { name: "Medium (80-95%)", value: stats.matches.medium_confidence, color: "#f59e0b" },
        { name: "Low (Threshold-80%)", value: stats.matches.low_confidence, color: "#ef4444" }
    ].filter(item => item.value > 0)

    const clusterDistribution = [
        { name: "Singletons", value: stats.clusters.singletons },
        { name: "Pairs", value: stats.clusters.pairs },
        { name: "3-5 entities", value: stats.clusters.small_groups_3_5 },
        { name: "6-10 entities", value: stats.clusters.medium_groups_6_10 },
        { name: ">10 entities", value: stats.clusters.large_groups_10_plus }
    ].filter(item => item.value > 0)

    const formatNumber = (num: number) => {
        if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
        if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
        return num.toString()
    }

    return (
        <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Records</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.dataset.total_records.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">
                            {formatNumber(stats.dataset.max_possible_comparisons)} possible pairs
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Comparisons Made</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatNumber(stats.comparisons.actual_comparisons)}</div>
                        <p className="text-xs text-green-600 dark:text-green-400">
                            {stats.comparisons.blocking_efficiency_percent.toFixed(1)}% reduction
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Matches</CardTitle>
                        <Target className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.matches.total_matches.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">
                            {stats.matches.match_rate_percent.toFixed(2)}% match rate
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Clusters Formed</CardTitle>
                        <Network className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.clusters.total_clusters.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">
                            Max size: {stats.clusters.largest_cluster_size}
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Detailed Statistics */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Blocking Efficiency */}
                <GlassCard className="p-6">
                    <div className="flex items-center gap-2 mb-4">
                        <Zap className="h-5 w-5 text-yellow-600" />
                        <h3 className="font-semibold">Blocking Efficiency</h3>
                    </div>
                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-muted-foreground">Comparisons Avoided</span>
                            <span className="font-mono font-semibold">
                                {formatNumber(stats.comparisons.comparisons_avoided)}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-muted-foreground">Efficiency Gain</span>
                            <Badge variant="outline" className="bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300">
                                {stats.comparisons.blocking_efficiency_percent.toFixed(2)}%
                            </Badge>
                        </div>
                        <Separator />
                        <div className="text-xs text-muted-foreground">
                            Blocking rules reduced the search space from{" "}
                            <strong>{formatNumber(stats.dataset.max_possible_comparisons)}</strong> to{" "}
                            <strong>{formatNumber(stats.comparisons.actual_comparisons)}</strong> comparisons.
                        </div>
                    </div>
                </GlassCard>

                {/* Match Quality Distribution */}
                <GlassCard className="p-6">
                    <div className="flex items-center gap-2 mb-4">
                        <TrendingUp className="h-5 w-5 text-blue-600" />
                        <h3 className="font-semibold">Match Quality Distribution</h3>
                    </div>
                    <div className="h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={matchDistribution}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    label={({ name, percent }) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`}
                                    outerRadius={80}
                                    fill="#8884d8"
                                    dataKey="value"
                                >
                                    {matchDistribution.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </GlassCard>

                {/* Cluster Size Distribution */}
                <GlassCard className="p-6 lg:col-span-2">
                    <div className="flex items-center gap-2 mb-4">
                        <BarChart3 className="h-5 w-5 text-purple-600" />
                        <h3 className="font-semibold">Cluster Size Distribution</h3>
                        <p className="text-xs text-muted-foreground ml-auto">(Click bars to filter)</p>
                    </div>
                    <div className="h-[250px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={clusterDistribution}>
                                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                <XAxis
                                    dataKey="name"
                                    className="text-xs"
                                    tick={{ fill: 'currentColor' }}
                                />
                                <YAxis
                                    className="text-xs"
                                    tick={{ fill: 'currentColor' }}
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: 'hsl(var(--background))',
                                        border: '1px solid hsl(var(--border))',
                                        borderRadius: '6px'
                                    }}
                                    cursor={{ fill: 'rgba(139, 92, 246, 0.1)' }}
                                />
                                <Bar
                                    dataKey="value"
                                    fill="#8b5cf6"
                                    radius={[4, 4, 0, 0]}
                                    cursor="pointer"
                                    onClick={(data) => {
                                        if (data && data.name) {
                                            const range = RANGE_MAP[data.name]
                                            if (range && onClusterSizeClick) {
                                                onClusterSizeClick(range)
                                            }
                                        }
                                    }}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-4 text-xs text-muted-foreground">
                        <div>
                            <span className="font-medium">Total Clusters:</span> {stats.clusters.total_clusters}
                        </div>
                        <div>
                            <span className="font-medium">Avg Size:</span> {stats.clusters.avg_cluster_size.toFixed(1)}
                        </div>
                        <div>
                            <span className="font-medium">Largest:</span> {stats.clusters.largest_cluster_size}
                        </div>
                    </div>
                </GlassCard>
            </div>
        </div>
    )
}
