"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, RadialBarChart, RadialBar, PieChart, Pie, Cell } from 'recharts'
import { DataQualityMetrics } from '@/lib/cleaning/dataQuality'
import { TrendingUp, Database, AlertCircle } from 'lucide-react'

interface DataQualityDashboardProps {
    metrics: DataQualityMetrics
}

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444']

export function DataQualityDashboard({ metrics }: DataQualityDashboardProps) {
    // Prepare data for charts
    const qualityData = [
        { name: 'Completeness', value: metrics.completeness, fill: COLORS[0] },
        { name: 'Uniqueness', value: metrics.uniqueness, fill: COLORS[1] },
        { name: 'Consistency', value: metrics.consistency, fill: COLORS[2] },
        { name: 'Validity', value: metrics.validity, fill: COLORS[3] }
    ]

    const overallData = [
        { name: 'Quality', value: metrics.overall, fill: '#8b5cf6' }
    ]

    // Column-level completeness data
    const columnData = metrics.details.columnMetrics
        .sort((a, b) => a.completeness - b.completeness)
        .slice(0, 10) // Top 10 columns by completeness
        .map(col => ({
            name: col.column.length > 15 ? col.column.substring(0, 15) + '...' : col.column,
            completeness: col.completeness,
            nulls: col.nullCount
        }))

    return (
        <div className="space-y-6">
            {/* Header Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription className="flex items-center gap-2">
                            <Database className="h-4 w-4" />
                            Dataset Size
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-1">
                            <div className="text-2xl font-bold">{metrics.details.totalRows.toLocaleString()}</div>
                            <div className="text-sm text-muted-foreground">
                                {metrics.details.totalColumns} columns
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription className="flex items-center gap-2">
                            <AlertCircle className="h-4 w-4" />
                            Data Issues
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-1">
                            <div className="text-2xl font-bold">{metrics.details.nullCount.toLocaleString()}</div>
                            <div className="text-sm text-muted-foreground">
                                null values
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription className="flex items-center gap-2">
                            <TrendingUp className="h-4 w-4" />
                            Duplicates
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-1">
                            <div className="text-2xl font-bold">{metrics.details.duplicateCount.toLocaleString()}</div>
                            <div className="text-sm text-muted-foreground">
                                duplicate rows
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Overall Quality Score */}
                <Card>
                    <CardHeader>
                        <CardTitle>Overall Quality Score</CardTitle>
                        <CardDescription>Composite metric across all dimensions</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={250}>
                            <RadialBarChart
                                cx="50%"
                                cy="50%"
                                innerRadius="60%"
                                outerRadius="90%"
                                data={overallData}
                                startAngle={180}
                                endAngle={0}
                            >
                                <RadialBar
                                    background
                                    dataKey="value"
                                    cornerRadius={10}
                                />
                                <text
                                    x="50%"
                                    y="50%"
                                    textAnchor="middle"
                                    dominantBaseline="middle"
                                    className="fill-foreground text-4xl font-bold"
                                >
                                    {metrics.overall.toFixed(1)}
                                </text>
                                <text
                                    x="50%"
                                    y="60%"
                                    textAnchor="middle"
                                    dominantBaseline="middle"
                                    className="fill-muted-foreground text-sm"
                                >
                                    out of 100
                                </text>
                            </RadialBarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                {/* Quality Dimensions */}
                <Card>
                    <CardHeader>
                        <CardTitle>Quality Dimensions</CardTitle>
                        <CardDescription>Breakdown by category</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={250}>
                            <PieChart>
                                <Pie
                                    data={qualityData}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    label={({ name, value }) => `${name}: ${value.toFixed(1)}%`}
                                    outerRadius={80}
                                    fill="#8884d8"
                                    dataKey="value"
                                >
                                    {qualityData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.fill} />
                                    ))}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                {/* Column Completeness */}
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle>Column Completeness</CardTitle>
                        <CardDescription>Percentage of non-null values by column</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={columnData}>
                                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                <XAxis
                                    dataKey="name"
                                    className="text-xs"
                                    angle={-45}
                                    textAnchor="end"
                                    height={100}
                                />
                                <YAxis
                                    className="text-xs"
                                    domain={[0, 100]}
                                />
                                <Tooltip
                                    content={({ active, payload }) => {
                                        if (active && payload && payload.length) {
                                            return (
                                                <div className="bg-background border rounded-lg p-3 shadow-lg">
                                                    <p className="font-medium">{payload[0].payload.name}</p>
                                                    <p className="text-sm text-muted-foreground">
                                                        Completeness: {payload[0].value}%
                                                    </p>
                                                    <p className="text-sm text-muted-foreground">
                                                        Nulls: {payload[0].payload.nulls}
                                                    </p>
                                                </div>
                                            )
                                        }
                                        return null
                                    }}
                                />
                                <Bar dataKey="completeness" fill="#10b981" radius={[8, 8, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>

            {/* Column Details Table */}
            <Card>
                <CardHeader>
                    <CardTitle>Column Details</CardTitle>
                    <CardDescription>Detailed metrics for each column</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b">
                                    <th className="text-left p-2 font-medium">Column</th>
                                    <th className="text-left p-2 font-medium">Type</th>
                                    <th className="text-right p-2 font-medium">Completeness</th>
                                    <th className="text-right p-2 font-medium">Unique Values</th>
                                    <th className="text-right p-2 font-medium">Null Count</th>
                                </tr>
                            </thead>
                            <tbody>
                                {metrics.details.columnMetrics.map((col, idx) => (
                                    <tr key={idx} className="border-b hover:bg-muted/50">
                                        <td className="p-2 font-mono text-xs">{col.column}</td>
                                        <td className="p-2">
                                            <Badge variant="outline" className="text-xs">
                                                {col.type}
                                            </Badge>
                                        </td>
                                        <td className="p-2 text-right">
                                            <span className={col.completeness < 80 ? 'text-red-600' : 'text-green-600'}>
                                                {col.completeness.toFixed(1)}%
                                            </span>
                                        </td>
                                        <td className="p-2 text-right">{col.uniqueCount.toLocaleString()}</td>
                                        <td className="p-2 text-right">{col.nullCount.toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
