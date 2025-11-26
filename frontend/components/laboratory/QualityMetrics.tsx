"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LineChart, BarChart3, Loader2, AlertCircle } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts'

export function QualityMetrics() {
    const [settings, setSettings] = useState<any>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [selectedComparison, setSelectedComparison] = useState<string>("")

    const fetchSettings = async () => {
        setLoading(true)
        setError(null)
        try {
            const response = await fetch('http://localhost:8000/api/model-settings')
            if (!response.ok) {
                const errorText = await response.text()
                try {
                    const errorJson = JSON.parse(errorText)
                    throw new Error(errorJson.detail || 'Failed to fetch settings')
                } catch (e) {
                    throw new Error(`Failed to fetch settings: ${response.status}`)
                }
            }
            const data = await response.json()
            setSettings(data)

            // Select first comparison by default
            if (data.comparisons && data.comparisons.length > 0) {
                setSelectedComparison(data.comparisons[0].output_column_name)
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchSettings()
    }, [])

    if (loading) {
        return (
            <Card>
                <CardContent className="pt-6 flex justify-center items-center min-h-[300px]">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </CardContent>
            </Card>
        )
    }

    if (error) {
        return (
            <Card>
                <CardContent className="pt-6">
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-4 rounded-md">
                            <AlertCircle className="h-5 w-5" />
                            <p>Error loading metrics: {error}</p>
                        </div>
                        {(error.includes('Engine not initialized') || error.includes('not available')) && (
                            <div className="bg-muted p-3 rounded text-sm">
                                <p className="font-medium mb-1">Why is this happening?</p>
                                <p className="text-muted-foreground">
                                    The backend may have restarted, clearing the in-memory data. Please go back to the Training phase and run matching again.
                                </p>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        )
    }

    if (!settings || !settings.comparisons) {
        return null
    }

    // Prepare data for the selected comparison
    const comparison = settings.comparisons.find((c: any) => c.output_column_name === selectedComparison)

    const chartData = comparison?.comparison_levels.map((level: any) => {
        // Calculate match weight: log2(m/u)
        // Note: m and u might be missing if not estimated yet
        const m = level.m_probability
        const u = level.u_probability

        let weight = 0
        if (m && u && u > 0) {
            weight = Math.log2(m / u)
        } else if (level.bayes_factor) {
            weight = Math.log2(level.bayes_factor)
        }

        return {
            name: level.label_for_charts || level.sql_condition,
            weight: weight,
            m_probability: m,
            u_probability: u,
            is_null: level.is_null_level
        }
    }) || []

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <LineChart className="h-5 w-5" />
                    Match Weights Analysis
                </CardTitle>
                <CardDescription>
                    Visualize the predictive power of each comparison level
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-6">
                    <div className="flex items-center gap-4">
                        <label className="text-sm font-medium whitespace-nowrap">Select Column:</label>
                        <Select value={selectedComparison} onValueChange={setSelectedComparison}>
                            <SelectTrigger className="w-[250px]">
                                <SelectValue placeholder="Select column" />
                            </SelectTrigger>
                            <SelectContent>
                                {settings.comparisons.map((c: any) => (
                                    <SelectItem key={c.output_column_name} value={c.output_column_name}>
                                        {c.output_column_name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="h-[400px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                layout="vertical"
                                data={chartData}
                                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis type="number" domain={['auto', 'auto']} label={{ value: 'Match Weight (log2 bayes factor)', position: 'insideBottom', offset: -5 }} />
                                <YAxis dataKey="name" type="category" width={150} tick={{ fontSize: 12 }} />
                                <Tooltip
                                    content={({ active, payload }) => {
                                        if (active && payload && payload.length) {
                                            const data = payload[0].payload
                                            return (
                                                <div className="bg-background border rounded-lg p-3 shadow-lg text-sm">
                                                    <p className="font-medium mb-2">{data.name}</p>
                                                    <div className="space-y-1 text-muted-foreground">
                                                        <p>Match Weight: <span className="font-mono text-foreground">{data.weight.toFixed(2)}</span></p>
                                                        {data.m_probability && <p>m-prob: <span className="font-mono text-foreground">{data.m_probability.toFixed(4)}</span></p>}
                                                        {data.u_probability && <p>u-prob: <span className="font-mono text-foreground">{data.u_probability.toFixed(4)}</span></p>}
                                                    </div>
                                                </div>
                                            )
                                        }
                                        return null
                                    }}
                                />
                                <ReferenceLine x={0} stroke="#666" />
                                <Bar dataKey="weight" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="text-sm text-muted-foreground bg-muted/30 p-4 rounded-lg">
                        <p>
                            <strong>Positive weights</strong> indicate evidence <em>for</em> a match.<br />
                            <strong>Negative weights</strong> indicate evidence <em>against</em> a match.<br />
                            Larger magnitude means stronger evidence.
                        </p>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
