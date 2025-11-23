"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Mail, User, Calendar, MapPin, Hash, Type, Zap, Info, Plus, Trash2, Settings } from 'lucide-react'
import {
    ComparisonConfig,
    COMPARISON_METHODS,
    getMethodsForColumnType,
    suggestMethod,
    suggestWeight
} from '@/lib/comparison/comparisonMethods'

interface ComparisonLevel {
    method: string
    threshold?: number
    mProbability: number  // Match probability
    uProbability: number  // Non-match probability
    label: string
}

interface AdvancedComparisonConfig extends ComparisonConfig {
    levels?: ComparisonLevel[]
}

interface SimpleComparisonBuilderProps {
    columns: string[]
    onConfigChange: (config: ComparisonConfig[]) => void
    initialConfig?: ComparisonConfig[]
}

function detectColumnType(columnName: string): 'email' | 'name' | 'date' | 'location' | 'number' | 'text' {
    const lower = columnName.toLowerCase()
    if (lower.includes('email') || lower.includes('mail')) return 'email'
    if (lower.includes('name') || lower.includes('first') || lower.includes('last')) return 'name'
    if (lower.includes('date') || lower.includes('dob') || lower.includes('birth')) return 'date'
    if (lower.includes('zip') || lower.includes('city') || lower.includes('state') || lower.includes('address')) return 'location'
    if (lower.includes('id') || lower.includes('number') || lower.includes('phone') || lower.includes('age')) return 'number'
    return 'text'
}

function getColumnIcon(type: string) {
    switch (type) {
        case 'email': return <Mail className="h-4 w-4" />
        case 'name': return <User className="h-4 w-4" />
        case 'date': return <Calendar className="h-4 w-4" />
        case 'location': return <MapPin className="h-4 w-4" />
        case 'number': return <Hash className="h-4 w-4" />
        default: return <Type className="h-4 w-4" />
    }
}

const WEIGHT_LABELS = [
    { value: 0.05, label: 'Very Low' },
    { value: 0.1, label: 'Low' },
    { value: 0.2, label: 'Medium' },
    { value: 0.3, label: 'High' },
    { value: 0.4, label: 'Very High' }
]

function getWeightLabel(weight: number): string {
    const closest = WEIGHT_LABELS.reduce((prev, curr) =>
        Math.abs(curr.value - weight) < Math.abs(prev.value - weight) ? curr : prev
    )
    return closest.label
}

export function SimpleComparisonBuilder({ columns, onConfigChange, initialConfig = [] }: SimpleComparisonBuilderProps) {
    const [configs, setConfigs] = useState<AdvancedComparisonConfig[]>([])
    const [advancedMode, setAdvancedMode] = useState(false)

    useEffect(() => {
        if (columns.length === 0) return
        if (configs.length > 0) return

        const newConfigs = columns.map(col => {
            const type = detectColumnType(col)
            const method = suggestMethod(col, type)
            const weight = suggestWeight(col)
            const methodDef = COMPARISON_METHODS.find(m => m.method === method)

            return {
                column: col,
                enabled: false,
                method,
                weight,
                threshold: methodDef?.defaultThreshold,
                params: {},
                levels: [
                    { method: 'exact', mProbability: 0.9, uProbability: 0.05, label: 'Exact Match' },
                    { method: 'levenshtein', threshold: 2, mProbability: 0.7, uProbability: 0.2, label: 'Similar' },
                    { method: 'else', mProbability: 0.1, uProbability: 0.75, label: 'Else' }
                ]
            }
        })
        setConfigs(newConfigs)
    }, [columns.length])

    useEffect(() => {
        const activeConfigs = configs.filter(c => c.enabled)
        onConfigChange(activeConfigs)
    }, [configs])

    const handleToggle = (column: string, enabled: boolean) => {
        setConfigs(prev => prev.map(c => c.column === column ? { ...c, enabled } : c))
    }

    const handleMethodChange = (column: string, method: string) => {
        setConfigs(prev => prev.map(c => {
            if (c.column === column) {
                const methodDef = COMPARISON_METHODS.find(m => m.method === method)
                return { ...c, method: method as any, threshold: methodDef?.defaultThreshold }
            }
            return c
        }))
    }

    const handleWeightChange = (column: string, weight: number) => {
        setConfigs(prev => prev.map(c => c.column === column ? { ...c, weight } : c))
    }

    const handleThresholdChange = (column: string, threshold: number) => {
        setConfigs(prev => prev.map(c => c.column === column ? { ...c, threshold } : c))
    }

    // Advanced mode handlers
    const handleAddLevel = (column: string) => {
        setConfigs(prev => prev.map(c => {
            if (c.column === column && c.levels) {
                return {
                    ...c,
                    levels: [...c.levels, { method: 'exact', mProbability: 0.5, uProbability: 0.5, label: 'New Level' }]
                }
            }
            return c
        }))
    }

    const handleRemoveLevel = (column: string, index: number) => {
        setConfigs(prev => prev.map(c => {
            if (c.column === column && c.levels) {
                return { ...c, levels: c.levels.filter((_, i) => i !== index) }
            }
            return c
        }))
    }

    const handleLevelChange = (column: string, levelIndex: number, field: keyof ComparisonLevel, value: any) => {
        setConfigs(prev => prev.map(c => {
            if (c.column === column && c.levels) {
                const newLevels = [...c.levels]
                newLevels[levelIndex] = { ...newLevels[levelIndex], [field]: value }
                return { ...c, levels: newLevels }
            }
            return c
        }))
    }

    const enabledCount = configs.filter(c => c.enabled).length
    const totalWeight = configs.filter(c => c.enabled).reduce((sum, c) => sum + c.weight, 0)

    return (
        <div className="space-y-6">
            {/* Header with Mode Toggle */}
            <Card className="border-blue-500/50 bg-blue-50/50 dark:bg-blue-950/20">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <Zap className="h-5 w-5" />
                                Comparison Configuration
                            </CardTitle>
                            <CardDescription>
                                {advancedMode
                                    ? 'Configure multiple comparison levels per field with probabilities'
                                    : 'Choose how to compare each field for matching'}
                            </CardDescription>
                        </div>
                        <div className="flex items-center gap-3">
                            <Badge variant={enabledCount > 0 ? 'default' : 'secondary'}>
                                {enabledCount} {enabledCount === 1 ? 'field' : 'fields'}
                            </Badge>
                            {totalWeight > 0 && !advancedMode && (
                                <Badge variant="outline">
                                    Total weight: {(totalWeight * 100).toFixed(0)}%
                                </Badge>
                            )}
                            <div className="flex items-center gap-2 px-3 py-1 bg-background rounded-lg border">
                                <Settings className="h-4 w-4" />
                                <span className="text-xs font-medium">Advanced</span>
                                <Switch checked={advancedMode} onCheckedChange={setAdvancedMode} />
                            </div>
                        </div>
                    </div>
                </CardHeader>
            </Card>

            {/* Info Alert for Advanced Mode */}
            {advancedMode && (
                <Card className="border-purple-500/50 bg-purple-50/50 dark:bg-purple-950/20">
                    <CardContent className="py-4">
                        <div className="flex items-start gap-3">
                            <Info className="h-5 w-5 text-purple-500 flex-shrink-0 mt-0.5" />
                            <div className="space-y-1">
                                <p className="text-sm font-medium">Advanced Multi-Level Comparison</p>
                                <p className="text-xs text-muted-foreground">
                                    Configure multiple comparison levels per field with m-probabilities (match) and u-probabilities (non-match).
                                    This gives you fine-grained control over how Splink evaluates similarity.
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Column Cards */}
            <div className="grid grid-cols-1 gap-4">
                {configs.map((config) => {
                    const type = detectColumnType(config.column)
                    const methods = getMethodsForColumnType(type)
                    const selectedMethod = COMPARISON_METHODS.find(m => m.method === config.method)

                    return (
                        <Card
                            key={config.column}
                            className={`transition-all ${config.enabled ? 'border-primary shadow-md' : 'border-muted'}`}
                        >
                            <CardHeader className="pb-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        {getColumnIcon(type)}
                                        <div>
                                            <CardTitle className="text-sm font-mono">{config.column}</CardTitle>
                                            <CardDescription className="text-xs">
                                                {type.charAt(0).toUpperCase() + type.slice(1)} field
                                            </CardDescription>
                                        </div>
                                    </div>
                                    <Switch
                                        checked={config.enabled}
                                        onCheckedChange={(checked) => handleToggle(config.column, checked)}
                                    />
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {!advancedMode ? (
                                    // Simple Mode
                                    <>
                                        <div className="space-y-2">
                                            <label className="text-xs font-medium text-muted-foreground">Comparison Method</label>
                                            <Select
                                                value={config.method}
                                                onValueChange={(value) => handleMethodChange(config.column, value)}
                                                disabled={!config.enabled}
                                            >
                                                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    {methods.map(method => (
                                                        <SelectItem key={method.method} value={method.method}>
                                                            <div className="flex items-center gap-2">
                                                                <span>{method.icon}</span>
                                                                <div>
                                                                    <div className="font-medium">{method.label}</div>
                                                                    <div className="text-xs text-muted-foreground">{method.description}</div>
                                                                </div>
                                                            </div>
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        {config.enabled && (
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <label className="text-xs font-medium text-muted-foreground">Importance</label>
                                                    <Badge variant="outline" className="text-xs">
                                                        {getWeightLabel(config.weight)} ({(config.weight * 100).toFixed(0)}%)
                                                    </Badge>
                                                </div>
                                                <Slider
                                                    value={[config.weight]}
                                                    onValueChange={([value]) => handleWeightChange(config.column, value)}
                                                    min={0.05}
                                                    max={0.4}
                                                    step={0.05}
                                                    className="w-full"
                                                />
                                            </div>
                                        )}

                                        {config.enabled && selectedMethod?.requiresThreshold && (
                                            <div className="space-y-2">
                                                <label className="text-xs font-medium text-muted-foreground">Threshold</label>
                                                <Input
                                                    type="number"
                                                    value={config.threshold || 0}
                                                    onChange={(e) => handleThresholdChange(config.column, parseFloat(e.target.value))}
                                                    min={0}
                                                    max={config.method === 'date_diff' ? 365 : 1}
                                                    step={config.method === 'date_diff' ? 1 : 0.05}
                                                    className="h-9"
                                                />
                                                <p className="text-xs text-muted-foreground">
                                                    {config.method === 'date_diff' && 'Maximum days difference'}
                                                    {config.method === 'numeric_diff' && 'Maximum % difference (0-1)'}
                                                    {!['date_diff', 'numeric_diff'].includes(config.method) && 'Minimum similarity score (0-1)'}
                                                </p>
                                            </div>
                                        )}

                                        {config.enabled && selectedMethod && (
                                            <div className="bg-muted/50 p-3 rounded text-xs space-y-1">
                                                <div className="flex items-start gap-2">
                                                    <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
                                                    <div>
                                                        <p className="font-medium">{selectedMethod.label}</p>
                                                        <p className="text-muted-foreground">{selectedMethod.description}</p>
                                                        <p className="mt-1"><strong>Example:</strong> {selectedMethod.example}</p>
                                                        <p className="mt-1"><strong>Best for:</strong> {selectedMethod.bestFor.join(', ')}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    // Advanced Mode - Multiple Levels
                                    config.enabled && (
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between">
                                                <label className="text-xs font-medium text-muted-foreground">Comparison Levels</label>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => handleAddLevel(config.column)}
                                                    className="h-7 text-xs"
                                                >
                                                    <Plus className="h-3 w-3 mr-1" />
                                                    Add Level
                                                </Button>
                                            </div>

                                            {config.levels?.map((level, idx) => (
                                                <Card key={idx} className="bg-muted/30">
                                                    <CardContent className="p-3 space-y-3">
                                                        <div className="flex items-center justify-between">
                                                            <Input
                                                                value={level.label}
                                                                onChange={(e) => handleLevelChange(config.column, idx, 'label', e.target.value)}
                                                                className="h-8 text-xs font-medium flex-1 mr-2"
                                                                placeholder="Level name"
                                                            />
                                                            {config.levels && config.levels.length > 1 && (
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    onClick={() => handleRemoveLevel(config.column, idx)}
                                                                    className="h-8 w-8 p-0"
                                                                >
                                                                    <Trash2 className="h-3 w-3" />
                                                                </Button>
                                                            )}
                                                        </div>

                                                        <div className="grid grid-cols-2 gap-2">
                                                            <div className="space-y-1">
                                                                <label className="text-xs text-muted-foreground">Method</label>
                                                                <Select
                                                                    value={level.method}
                                                                    onValueChange={(value) => handleLevelChange(config.column, idx, 'method', value)}
                                                                >
                                                                    <SelectTrigger className="h-8 text-xs">
                                                                        <SelectValue />
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        {methods.map(m => (
                                                                            <SelectItem key={m.method} value={m.method} className="text-xs">
                                                                                {m.label}
                                                                            </SelectItem>
                                                                        ))}
                                                                        <SelectItem value="else" className="text-xs">Else (Catch-all)</SelectItem>
                                                                    </SelectContent>
                                                                </Select>
                                                            </div>

                                                            {level.method !== 'else' && COMPARISON_METHODS.find(m => m.method === level.method)?.requiresThreshold && (
                                                                <div className="space-y-1">
                                                                    <label className="text-xs text-muted-foreground">Threshold</label>
                                                                    <Input
                                                                        type="number"
                                                                        value={level.threshold || 0}
                                                                        onChange={(e) => handleLevelChange(config.column, idx, 'threshold', parseFloat(e.target.value))}
                                                                        className="h-8 text-xs"
                                                                        step={0.05}
                                                                    />
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div className="grid grid-cols-2 gap-2">
                                                            <div className="space-y-1">
                                                                <label className="text-xs text-muted-foreground">m-probability</label>
                                                                <Input
                                                                    type="number"
                                                                    value={level.mProbability}
                                                                    onChange={(e) => handleLevelChange(config.column, idx, 'mProbability', parseFloat(e.target.value))}
                                                                    min={0}
                                                                    max={1}
                                                                    step={0.05}
                                                                    className="h-8 text-xs"
                                                                />
                                                            </div>
                                                            <div className="space-y-1">
                                                                <label className="text-xs text-muted-foreground">u-probability</label>
                                                                <Input
                                                                    type="number"
                                                                    value={level.uProbability}
                                                                    onChange={(e) => handleLevelChange(config.column, idx, 'uProbability', parseFloat(e.target.value))}
                                                                    min={0}
                                                                    max={1}
                                                                    step={0.05}
                                                                    className="h-8 text-xs"
                                                                />
                                                            </div>
                                                        </div>
                                                    </CardContent>
                                                </Card>
                                            ))}
                                        </div>
                                    )
                                )}
                            </CardContent>
                        </Card>
                    )
                })}
            </div>

            {/* Summary */}
            {enabledCount > 0 && (
                <Card className="bg-green-50/50 dark:bg-green-950/20 border-green-500/50">
                    <CardContent className="py-4">
                        <div className="space-y-2">
                            <p className="text-sm font-medium">
                                ✅ {enabledCount} {enabledCount === 1 ? 'field' : 'fields'} configured for comparison
                            </p>
                            {!advancedMode && (
                                <p className="text-xs text-muted-foreground">
                                    Total weight: {(totalWeight * 100).toFixed(0)}%
                                    {totalWeight < 0.9 && ' (Consider adding more fields or increasing weights)'}
                                    {totalWeight > 1.1 && ' (Total weight exceeds 100%, will be normalized)'}
                                </p>
                            )}
                            {advancedMode && (
                                <p className="text-xs text-muted-foreground">
                                    Using multi-level comparison with custom probabilities for Splink matching
                                </p>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
