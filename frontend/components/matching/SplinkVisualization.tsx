"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loader2, RefreshCw, AlertCircle, BarChart3, Sliders, Eye, TrendingUp, GitCompare } from 'lucide-react'
import { GlassCard } from '@/components/ui/glass-card'

interface SplinkVisualizationProps {
    type?: 'match_weights' | 'waterfall' | 'parameter_estimates' | 'threshold_selection' | 'comparison_viewer' | 'all'
    recordId1?: string
    recordId2?: string
    title?: string
    description?: string
}

interface ChartConfig {
    key: string
    title: string
    description: string
    icon: any
    url: string | ((recordId1?: string, recordId2?: string) => string)
    requiresRecords?: boolean
}

export function SplinkVisualization({
    type = 'all',
    recordId1,
    recordId2,
    title,
    description
}: SplinkVisualizationProps) {
    const [activeTab, setActiveTab] = useState('match_weights')
    const [charts, setCharts] = useState<Record<string, { html: string | null; loading: boolean; error: string | null }>>({})

    const chartConfigs: ChartConfig[] = [
        {
            key: 'match_weights',
            title: 'Match Weights',
            description: 'Distribution of match probabilities across all comparisons',
            icon: BarChart3,
            url: 'http://localhost:8000/api/splink/charts/match-weights'
        },
        {
            key: 'parameter_estimates',
            title: 'Parameter Estimates',
            description: 'M and U probability parameters for each comparison level',
            icon: TrendingUp,
            url: 'http://localhost:8000/api/splink/charts/parameter-estimates'
        },
        {
            key: 'threshold_selection',
            title: 'Threshold Selection',
            description: 'Interactive tool to explore different match thresholds',
            icon: Sliders,
            url: 'http://localhost:8000/api/splink/charts/threshold-selection'
        },
        {
            key: 'comparison_viewer',
            title: 'Comparison Viewer',
            description: 'Side-by-side view of example record comparisons',
            icon: Eye,
            url: 'http://localhost:8000/api/splink/charts/comparison-viewer'
        },
        {
            key: 'waterfall',
            title: 'Waterfall Chart',
            description: 'Detailed match probability breakdown for a specific pair',
            icon: GitCompare,
            url: (rid1, rid2) =>
                `http://localhost:8000/api/splink/charts/waterfall?record_id_1=${encodeURIComponent(rid1 || '')}&record_id_2=${encodeURIComponent(rid2 || '')}`,
            requiresRecords: true
        }
    ]

    // Filter charts based on type prop
    const visibleCharts = type === 'all'
        ? chartConfigs
        : chartConfigs.filter(c => c.key === type)

    const fetchChart = async (chartKey: string) => {
        const config = chartConfigs.find(c => c.key === chartKey)
        if (!config) return

        // Check if records are required but not provided
        if (config.requiresRecords && (!recordId1 || !recordId2)) {
            setCharts(prev => ({
                ...prev,
                [chartKey]: {
                    html: null,
                    loading: false,
                    error: "Record IDs required for this chart"
                }
            }))
            return
        }

        setCharts(prev => ({
            ...prev,
            [chartKey]: { html: null, loading: true, error: null }
        }))

        try {
            const url = typeof config.url === 'function'
                ? config.url(recordId1, recordId2)
                : config.url

            const res = await fetch(url)
            if (!res.ok) {
                if (res.status === 404) {
                    throw new Error("Visualization not available. Please run the matching process first.")
                }
                const err = await res.json()
                throw new Error(err.detail || "Failed to fetch visualization")
            }

            const data = await res.json()
            setCharts(prev => ({
                ...prev,
                [chartKey]: { html: data.html, loading: false, error: null }
            }))
        } catch (err: any) {
            // 404s are expected before running matching - use warn instead of error
            if (err.message?.includes('not available') || err.message?.includes('404')) {
                console.warn(`ℹ️ Chart ${chartKey}:`, err.message)
            } else {
                console.error(`❌ Chart ${chartKey} error:`, err)
            }

            setCharts(prev => ({
                ...prev,
                [chartKey]: { html: null, loading: false, error: err.message }
            }))
        }
    }

    // Auto-fetch on mount
    useEffect(() => {
        if (type === 'all') {
            // Fetch the active tab chart
            fetchChart(activeTab)
        } else {
            // Fetch the single chart type
            fetchChart(type)
        }
    }, [type, recordId1, recordId2])

    // Fetch when tab changes
    const handleTabChange = (value: string) => {
        setActiveTab(value)
        if (!charts[value]?.html && !charts[value]?.loading) {
            fetchChart(value)
        }
    }

    const renderChart = (chartKey: string) => {
        const chartState = charts[chartKey] || { html: null, loading: false, error: null }
        const config = chartConfigs.find(c => c.key === chartKey)

        if (!config) return null

        return (
            <div className="relative w-full h-full min-h-[600px]">
                {chartState.loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                )}

                {chartState.error ? (
                    <div className="flex flex-col items-center justify-center h-full p-6 text-center text-muted-foreground">
                        <AlertCircle className="h-10 w-10 mb-4 text-destructive/50" />
                        <p className="font-medium text-foreground">Failed to load chart</p>
                        <p className="text-sm mt-1 max-w-md">{chartState.error}</p>
                        <Button
                            variant="outline"
                            size="sm"
                            className="mt-4"
                            onClick={() => fetchChart(chartKey)}
                        >
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Try Again
                        </Button>
                    </div>
                ) : chartState.html ? (
                    <iframe
                        srcDoc={chartState.html}
                        className="w-full h-full min-h-[600px] border-0"
                        sandbox="allow-scripts"
                        title={config.title}
                    />
                ) : !chartState.loading ? (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                        <p>Click refresh to load chart</p>
                    </div>
                ) : null}
            </div>
        )
    }

    // Single chart mode
    if (type !== 'all') {
        const config = visibleCharts[0]
        const Icon = config?.icon || BarChart3

        return (
            <GlassCard className="w-full">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <div className="flex items-center gap-2">
                        <Icon className="h-5 w-5 text-primary" />
                        <div>
                            <CardTitle className="text-lg font-medium">
                                {title || config?.title}
                            </CardTitle>
                            {(description || config?.description) && (
                                <CardDescription className="text-sm mt-1">
                                    {description || config?.description}
                                </CardDescription>
                            )}
                        </div>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => fetchChart(type)}
                        disabled={charts[type]?.loading}
                    >
                        <RefreshCw className={`h-4 w-4 ${charts[type]?.loading ? 'animate-spin' : ''}`} />
                    </Button>
                </CardHeader>
                <CardContent className="p-4">
                    {renderChart(type)}
                </CardContent>
            </GlassCard>
        )
    }

    // Multi-chart tabbed mode
    return (
        <GlassCard className="w-full">
            <CardHeader>
                <CardTitle className="text-xl font-semibold">
                    {title || 'Splink Model Insights'}
                </CardTitle>
                {description && (
                    <CardDescription>{description}</CardDescription>
                )}
            </CardHeader>
            <CardContent>
                <Tabs value={activeTab} onValueChange={handleTabChange}>
                    <TabsList className="grid w-full grid-cols-5 mb-4">
                        {visibleCharts.map(config => {
                            const Icon = config.icon
                            return (
                                <TabsTrigger key={config.key} value={config.key} className="gap-2">
                                    <Icon className="h-4 w-4" />
                                    <span className="hidden sm:inline">{config.title}</span>
                                </TabsTrigger>
                            )
                        })}
                    </TabsList>

                    {visibleCharts.map(config => (
                        <TabsContent key={config.key} value={config.key} className="mt-0">
                            <div className="mb-3 flex items-center justify-between">
                                <div>
                                    <h3 className="font-semibold text-lg">{config.title}</h3>
                                    <p className="text-sm text-muted-foreground">
                                        {config.description}
                                    </p>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => fetchChart(config.key)}
                                    disabled={charts[config.key]?.loading}
                                >
                                    <RefreshCw className={`h-4 w-4 ${charts[config.key]?.loading ? 'animate-spin' : ''}`} />
                                </Button>
                            </div>
                            {renderChart(config.key)}
                        </TabsContent>
                    ))}
                </Tabs>
            </CardContent>
        </GlassCard>
    )
}
