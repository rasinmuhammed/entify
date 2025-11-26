"use client"

import { useState, useEffect, useRef } from 'react'
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
    ComparisonMethod,
    COMPARISON_METHODS,
    getMethodsForColumnType,
    suggestMethod,
    suggestWeight,
    EntityType,
    getSmartConfigForType
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
    onGlobalSettingsChange?: (settings: any) => void
    initialGlobalSettings?: any
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

function isIdColumn(columnName: string): boolean {
    const lower = columnName.toLowerCase()
    const idPatterns = [
        /^id$/,          // exact "id"
        /^.*_id$/,       //  ends with _id
        /^id_/,          // starts with id_
        /^.*id$/,        // ends with id
        /^pk$/,          // primary key
        /^uuid$/,        // uuid
    ]
    return idPatterns.some(pattern => pattern.test(lower))
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

export function SimpleComparisonBuilder({
    columns,
    onConfigChange,
    initialConfig = [],
    onGlobalSettingsChange,
    initialGlobalSettings
}: SimpleComparisonBuilderProps) {
    const [configs, setConfigs] = useState<AdvancedComparisonConfig[]>([])
    const [advancedMode, setAdvancedMode] = useState(false)
    const [globalSettings, setGlobalSettings] = useState(
        initialGlobalSettings || { probability_two_random_records_match: 0.0001 }
    )

    // Track if we've initialized to prevent feedback loop
    const isInitializedRef = useRef(false)

    // Initialize global settings from props only once
    useEffect(() => {
        if (initialGlobalSettings && !isInitializedRef.current) {
            setGlobalSettings(initialGlobalSettings)
            isInitializedRef.current = true
        }
    }, [initialGlobalSettings])

    // Notify parent of global settings changes (skip initial notification)
    useEffect(() => {
        if (isInitializedRef.current && onGlobalSettingsChange) {
            onGlobalSettingsChange(globalSettings)
        }
    }, [globalSettings])

    useEffect(() => {
        if (columns.length === 0) return
        if (configs.length > 0) return

        if (initialConfig.length > 0) {
            // Restore from initial config
            const restoredConfigs = columns.map(col => {
                const existing = initialConfig.find(c => c.column === col)
                if (existing) {
                    return {
                        ...existing,
                        levels: (existing as AdvancedComparisonConfig).levels || [
                            { method: 'exact', mProbability: 0.9, uProbability: 0.05, label: 'Exact Match' },
                            { method: 'levenshtein', threshold: 2, mProbability: 0.7, uProbability: 0.2, label: 'Similar' },
                            { method: 'else', mProbability: 0.1, uProbability: 0.75, label: 'Else' }
                        ]
                    }
                }
                // Default for new columns
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
            setConfigs(restoredConfigs)
        } else {
            // Initialize new configs
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
        }
    }, [columns.length, initialConfig])

    useEffect(() => {
        const activeConfigs = configs.filter(c => c.enabled)
        onConfigChange(activeConfigs)
    }, [configs])

    const handleToggle = (column: string, enabled: boolean) => {
        setConfigs(prev => prev.map(c =>
            c.column === column ? { ...c, enabled } : c
        ))
    }

    const handleMethodChange = (column: string, method: string) => {
        const methodDef = COMPARISON_METHODS.find(m => m.method === method)
        setConfigs(prev => prev.map(c =>
            c.column === column ? {
                ...c,
                method: method as ComparisonMethod,
                threshold: methodDef?.defaultThreshold
            } : c
        ))
    }

    const handleWeightChange = (column: string, weight: number) => {
        setConfigs(prev => prev.map(c =>
            c.column === column ? { ...c, weight } : c
        ))
    }

    const handleThresholdChange = (column: string, threshold: number) => {
        setConfigs(prev => prev.map(c =>
            c.column === column ? { ...c, threshold } : c
        ))
    }

    const handleEntityTypeChange = (column: string, type: EntityType) => {
        const smartConfig = getSmartConfigForType(type, column)
        setConfigs(prev => prev.map(c => {
            if (c.column === column) {
                return {
                    ...c,
                    ...smartConfig,
                    // Preserve enabled state
                    enabled: c.enabled
                }
            }
            return c
        }))
    }

    const handleAddLevel = (column: string) => {
        setConfigs(prev => prev.map(c => {
            if (c.column === column) {
                const levels = c.levels || []
                return {
                    ...c,
                    levels: [
                        ...levels.slice(0, -1), // Remove 'else'
                        { method: 'exact', mProbability: 0.8, uProbability: 0.1, label: `Level ${levels.length} ` },
                        levels[levels.length - 1] // Keep 'else' at end
                    ]
                }
            }
            return c
        }))
    }

    const handleRemoveLevel = (column: string, index: number) => {
        setConfigs(prev => prev.map(c => {
            if (c.column === column && c.levels) {
                const newLevels = [...c.levels]
                newLevels.splice(index, 1)
                return { ...c, levels: newLevels }
            }
            return c
        }))
    }

    const handleLevelChange = (column: string, index: number, field: keyof ComparisonLevel, value: any) => {
        setConfigs(prev => prev.map(c => {
            if (c.column === column && c.levels) {
                const newLevels = [...c.levels]
                newLevels[index] = { ...newLevels[index], [field]: value }
                return { ...c, levels: newLevels }
            }
            return c
        }))
    }

    const enabledCount = configs.filter(c => c.enabled).length
    const totalWeight = configs.filter(c => c.enabled).reduce((sum, c) => sum + c.weight, 0)

    return (
        <div className="space-y-6">
            {/* Global Settings Panel */}
            <Card className="border-indigo-500/50 bg-indigo-50/50 dark:bg-indigo-950/20">
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Settings className="h-4 w-4" />
                        Global Matching Settings
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="text-sm font-medium">Strictness (Match Probability)</label>
                                <Badge variant="outline">
                                    {globalSettings.probability_two_random_records_match.toExponential(1)}
                                </Badge>
                            </div>
                            <Slider
                                value={[Math.log10(globalSettings.probability_two_random_records_match)]}
                                onValueChange={([val]) => setGlobalSettings((prev: any) => ({
                                    ...prev,
                                    probability_two_random_records_match: Math.pow(10, val)
                                }))}
                                min={-6} // 1e-6
                                max={-2} // 1e-2
                                step={0.5}
                                className="w-full"
                            />
                            <p className="text-xs text-muted-foreground flex justify-between">
                                <span>Strict (1 in 1M)</span>
                                <span>Loose (1 in 100)</span>
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Header with Mode Toggle */}
            <Card className="border-blue-500/50 bg-blue-50/50 dark:bg-blue-950/20">
                <CardContent className="py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                            <Zap className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                            <h3 className="font-medium">Configuration Mode</h3>
                            <p className="text-xs text-muted-foreground">
                                {advancedMode ? 'Advanced: Configure multi-level comparisons' : 'Simple: Choose methods and weights'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className={`text - xs ${!advancedMode ? 'font-bold' : ''} `}>Simple</span>
                        <Switch checked={advancedMode} onCheckedChange={setAdvancedMode} />
                        <span className={`text - xs ${advancedMode ? 'font-bold' : ''} `}>Advanced</span>
                    </div>
                </CardContent>
            </Card>

            {/* Column Cards */}
            <div className="grid grid-cols-1 gap-4">
                {configs.map((config) => {
                    const type = detectColumnType(config.column)
                    const methods = getMethodsForColumnType(type)
                    const selectedMethod = COMPARISON_METHODS.find(m => m.method === config.method)

                    return (
                        <Card
                            key={config.column}
                            className={`transition - all ${config.enabled ? 'border-primary shadow-md' : 'border-muted'} `}
                        >
                            <CardHeader className="pb-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        {getColumnIcon(type)}
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <CardTitle className="text-sm font-mono">{config.column}</CardTitle>
                                                {isIdColumn(config.column) && (
                                                    <Badge variant="outline" className="text-[10px] h-5">ID</Badge>
                                                )}
                                                {config.enabled && (
                                                    <Badge className="text-[10px] h-5 bg-green-600">Active</Badge>
                                                )}
                                            </div>
                                            {/* Entity Type Selector */}
                                            <div className="mt-1 flex items-center gap-2">
                                                <span className="text-xs text-muted-foreground">Is this a:</span>
                                                <Select
                                                    value={detectColumnType(config.column) === 'name' ? 'person' : detectColumnType(config.column) as any} // Simple default mapping
                                                    onValueChange={(val) => handleEntityTypeChange(config.column, val as EntityType)}
                                                >
                                                    <SelectTrigger className="h-6 text-xs w-[120px]">
                                                        <SelectValue placeholder="Select type" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="company">Company</SelectItem>
                                                        <SelectItem value="person">Person</SelectItem>
                                                        <SelectItem value="address">Address</SelectItem>
                                                        <SelectItem value="email">Email</SelectItem>
                                                        <SelectItem value="phone">Phone</SelectItem>
                                                        <SelectItem value="date">Date</SelectItem>
                                                        <SelectItem value="custom">Custom</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
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
                                    // Advanced Mode - Multiple Levels (Waterfall UI)
                                    config.enabled && config.levels && (
                                        <div className="space-y-3 pt-2 border-t border-dashed">
                                            <div className="flex items-center justify-between">
                                                <label className="text-xs font-medium text-muted-foreground">Comparison Levels (Waterfall)</label>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-6 text-xs"
                                                    onClick={() => handleAddLevel(config.column)}
                                                >
                                                    <Plus className="h-3 w-3 mr-1" />
                                                    Add Level
                                                </Button>
                                            </div>

                                            <div className="space-y-2 relative">
                                                {/* Vertical line connecting levels */}
                                                <div className="absolute left-4 top-4 bottom-4 w-0.5 bg-border -z-10" />

                                                {config.levels.map((level, idx) => {
                                                    const isLast = idx === config.levels!.length - 1
                                                    const isFirst = idx === 0

                                                    return (
                                                        <div key={idx} className="relative pl-8">
                                                            {/* Connector dot */}
                                                            <div className={`absolute left-[13px] top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2 border-background ${isFirst ? 'bg-green-500' : isLast ? 'bg-red-500' : 'bg-blue-500'
                                                                }`} />

                                                            <div className={`p-3 rounded-md border text-sm ${isLast ? 'bg-muted/50 border-dashed' : 'bg-card'
                                                                }`}>
                                                                <div className="flex items-center justify-between mb-2">
                                                                    <span className="font-medium text-xs">
                                                                        {isLast ? 'Else (No Match)' : `Level ${idx + 1}`}
                                                                    </span>
                                                                    {!isLast && !isFirst && (
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            className="h-5 w-5 text-muted-foreground hover:text-destructive"
                                                                            onClick={() => handleRemoveLevel(config.column, idx)}
                                                                        >
                                                                            <Trash2 className="h-3 w-3" />
                                                                        </Button>
                                                                    )}
                                                                </div>

                                                                {!isLast ? (
                                                                    <div className="grid grid-cols-2 gap-2">
                                                                        <Select
                                                                            value={level.method}
                                                                            onValueChange={(val) => handleLevelChange(config.column, idx, 'method', val)}
                                                                        >
                                                                            <SelectTrigger className="h-7 text-xs">
                                                                                <SelectValue />
                                                                            </SelectTrigger>
                                                                            <SelectContent>
                                                                                {getMethodsForColumnType(detectColumnType(config.column)).map(m => (
                                                                                    <SelectItem key={m.method} value={m.method} className="text-xs">
                                                                                        {m.label}
                                                                                    </SelectItem>
                                                                                ))}
                                                                            </SelectContent>
                                                                        </Select>

                                                                        {COMPARISON_METHODS.find(m => m.method === level.method)?.requiresThreshold && (
                                                                            <div className="flex items-center gap-2">
                                                                                <span className="text-[10px] text-muted-foreground whitespace-nowrap">Thresh:</span>
                                                                                <Input
                                                                                    type="number"
                                                                                    className="h-7 text-xs"
                                                                                    value={level.threshold || 0}
                                                                                    onChange={(e) => handleLevelChange(config.column, idx, 'threshold', parseFloat(e.target.value))}
                                                                                    step={0.1}
                                                                                    min={0}
                                                                                />
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                ) : (
                                                                    <div className="text-xs text-muted-foreground italic">
                                                                        Records that don't match any above rules fall here.
                                                                    </div>
                                                                )}

                                                                <div className="mt-2 pt-2 border-t flex items-center gap-4">
                                                                    <div className="flex-1 space-y-1">
                                                                        <label className="text-[10px] text-muted-foreground">m-prob (Match)</label>
                                                                        <Input
                                                                            type="number"
                                                                            value={level.mProbability}
                                                                            onChange={(e) => handleLevelChange(config.column, idx, 'mProbability', parseFloat(e.target.value))}
                                                                            min={0} max={1} step={0.05}
                                                                            className="h-6 text-xs"
                                                                        />
                                                                    </div>
                                                                    <div className="flex-1 space-y-1">
                                                                        <label className="text-[10px] text-muted-foreground">u-prob (Non-Match)</label>
                                                                        <Input
                                                                            type="number"
                                                                            value={level.uProbability}
                                                                            onChange={(e) => handleLevelChange(config.column, idx, 'uProbability', parseFloat(e.target.value))}
                                                                            min={0} max={1} step={0.05}
                                                                            className="h-6 text-xs"
                                                                        />
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    )
                                )}
                            </CardContent>
                        </Card>
                    )
                })}
            </div>

            {/* Summary */}
            {
                enabledCount > 0 && (
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
                )
            }
        </div >
    )
}
