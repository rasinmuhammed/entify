"use client"

import { useState } from 'react'
import { DndContext, closestCenter, DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { GripVertical, Trash2, Play, Plus, Sparkles } from 'lucide-react'
import { CLEANING_RULES, CleaningRule, CleaningRuleType, applyCleaningRules, CleaningResult } from '@/lib/cleaning/cleaningRules'
import { useWasm } from '@/lib/wasm/WasmContext'
import { useDatasetStore } from '@/lib/store/useDatasetStore'
import { CleaningResults } from './CleaningResults'
import { DataQualityDashboard } from './DataQualityDashboard'
import { DataViewSelector } from './DataViewSelector'
import { DataManager } from './DataManager'

interface DataCleaningStudioProps {
    columns: string[]
    onRulesApplied?: () => void
}

function DraggableRuleCard({ rule, onUpdate, onDelete }: {
    rule: CleaningRule
    onUpdate: (rule: CleaningRule) => void
    onDelete: (id: string) => void
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: rule.id
    })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1
    }

    const ruleDefinition = CLEANING_RULES.find(r => r.type === rule.type)

    return (
        <div ref={setNodeRef} style={style} className="mb-2">
            <Card className={`${!rule.enabled ? 'opacity-50' : ''}`}>
                <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
                            <GripVertical className="h-5 w-5 text-muted-foreground" />
                        </div>

                        <div className="text-2xl">{ruleDefinition?.icon}</div>

                        <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-medium">{ruleDefinition?.label}</h4>
                                <Badge variant="outline">{rule.column || 'All columns'}</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">{ruleDefinition?.description}</p>

                            {/* Rule parameters */}
                            {ruleDefinition?.params && (
                                <div className="mt-2 space-y-2">
                                    {ruleDefinition.params.map(param => (
                                        <div key={param.name} className="flex items-center gap-2">
                                            <Label className="text-xs">{param.label}:</Label>
                                            <Input
                                                className="h-8 text-xs"
                                                value={rule.params?.[param.name] || param.default}
                                                onChange={(e) => onUpdate({
                                                    ...rule,
                                                    params: { ...rule.params, [param.name]: e.target.value }
                                                })}
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="flex items-center gap-2">
                            <Switch
                                checked={rule.enabled}
                                onCheckedChange={(enabled: boolean) => onUpdate({ ...rule, enabled })}
                            />
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => onDelete(rule.id)}
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

export function DataCleaningStudio({ columns, onRulesApplied }: DataCleaningStudioProps) {
    const [rules, setRules] = useState<CleaningRule[]>([])
    const [selectedRuleType, setSelectedRuleType] = useState<CleaningRuleType>('remove_nulls')
    const [selectedColumn, setSelectedColumn] = useState<string>(columns[0] || '')
    const [isApplying, setIsApplying] = useState(false)
    const [showResults, setShowResults] = useState(false)
    const [cleaningResult, setCleaningResult] = useState<CleaningResult | null>(null)
    const [initialRowCount, setInitialRowCount] = useState<number>(0)
    const { duckDB } = useWasm()
    const { activeDataset } = useDatasetStore()
    const [viewMode, setViewMode] = useState<'raw' | 'cleaned'>('raw')

    const handleAddRule = () => {
        const ruleType = CLEANING_RULES.find(r => r.type === selectedRuleType)
        if (!ruleType) return

        const newRule: CleaningRule = {
            id: `rule_${Date.now()}`,
            type: selectedRuleType,
            column: ruleType.requiresColumn ? selectedColumn : '',
            enabled: true,
            params: {}
        }

        // Set default params
        ruleType.params?.forEach(param => {
            newRule.params![param.name] = param.default
        })

        setRules([...rules, newRule])
    }

    const handleUpdateRule = (updatedRule: CleaningRule) => {
        setRules(rules.map(r => r.id === updatedRule.id ? updatedRule : r))
    }

    const handleDeleteRule = (id: string) => {
        setRules(rules.filter(r => r.id !== id))
    }

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event
        if (!over || active.id === over.id) return

        const oldIndex = rules.findIndex(r => r.id === active.id)
        const newIndex = rules.findIndex(r => r.id === over.id)

        const newRules = [...rules]
        const [movedRule] = newRules.splice(oldIndex, 1)
        newRules.splice(newIndex, 0, movedRule)

        setRules(newRules)
    }

    const handleApplyRules = async () => {
        if (!duckDB || !activeDataset) return

        // Get initial row count before cleaning
        try {
            const conn = await duckDB.connect()
            const countResult = await conn.query(`SELECT COUNT(*) as count FROM "${activeDataset.name}"`)
            setInitialRowCount(Number(countResult.toArray()[0].count))
            await conn.close()
        } catch (error) {
            console.error('Failed to get initial row count:', error)
        }

        setIsApplying(true)
        try {
            // Get user ID from Clerk (if available)
            const userId = (window as any).Clerk?.user?.id

            const result = await applyCleaningRules(
                rules,
                activeDataset.name,
                duckDB,
                {
                    userId,
                    datasetId: (activeDataset as any).id,
                    persistToStorage: true
                }
            )

            if (result.success) {
                // Show results in modal instead of alert
                setCleaningResult(result)
                setShowResults(true)
            } else {
                alert(`❌ Cleaning failed: ${result.error}`)
            }
        } catch (error) {
            console.error('Failed to apply rules:', error)
            alert('Failed to apply cleaning rules')
        } finally {
            setIsApplying(false)
        }
    }

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5" />
                        Data Cleaning Studio
                    </CardTitle>
                    <CardDescription>
                        Drag and drop to reorder rules. They will be applied in sequence.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Add Rule Form */}
                    <div className="flex gap-2">
                        <Select value={selectedRuleType} onValueChange={(v) => setSelectedRuleType(v as CleaningRuleType)}>
                            <SelectTrigger className="w-[200px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {CLEANING_RULES.map(rule => (
                                    <SelectItem key={rule.type} value={rule.type}>
                                        {rule.icon} {rule.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        {CLEANING_RULES.find(r => r.type === selectedRuleType)?.requiresColumn && (
                            <Select value={selectedColumn} onValueChange={setSelectedColumn}>
                                <SelectTrigger className="w-[200px]">
                                    <SelectValue placeholder="Select column" />
                                </SelectTrigger>
                                <SelectContent>
                                    {columns.map(col => (
                                        <SelectItem key={col} value={col}>{col}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}

                        <Button onClick={handleAddRule}>
                            <Plus className="h-4 w-4 mr-2" />
                            Add Rule
                        </Button>
                    </div>

                    {/* Rules Pipeline */}
                    {rules.length > 0 ? (
                        <>
                            <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                                <SortableContext items={rules.map(r => r.id)} strategy={verticalListSortingStrategy}>
                                    {rules.map(rule => (
                                        <DraggableRuleCard
                                            key={rule.id}
                                            rule={rule}
                                            onUpdate={handleUpdateRule}
                                            onDelete={handleDeleteRule}
                                        />
                                    ))}
                                </SortableContext>
                            </DndContext>

                            <Button
                                onClick={handleApplyRules}
                                disabled={isApplying || rules.filter(r => r.enabled).length === 0}
                                className="w-full"
                                size="lg"
                            >
                                <Play className="h-4 w-4 mr-2" />
                                {isApplying ? 'Applying...' : `Apply ${rules.filter(r => r.enabled).length} Rules`}
                            </Button>
                        </>
                    ) : (
                        <div className="text-center py-8 text-muted-foreground">
                            <p>No cleaning rules yet. Add your first rule above!</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Data Preview Section */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="md:col-span-1">
                    {activeDataset && (
                        <DataViewSelector
                            datasetName={activeDataset.name}
                            currentView={viewMode}
                            onViewChange={setViewMode}
                        />
                    )}
                </div>
                <div className="md:col-span-3">
                    <Card>
                        <CardHeader>
                            <CardTitle>Data Preview</CardTitle>
                            <CardDescription>
                                Viewing {viewMode === 'raw' ? 'original raw' : 'cleaned'} data
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {activeDataset && (
                                <DataManager
                                    tableName={activeDataset.name}
                                    dataView={viewMode}
                                />
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Results Modal */}
            <Dialog open={showResults} onOpenChange={setShowResults}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Cleaning Results</DialogTitle>
                    </DialogHeader>
                    {cleaningResult && (
                        <div className="space-y-6">
                            <CleaningResults
                                initialRows={initialRowCount}
                                finalRows={cleaningResult.rowCount}
                                rowsRemoved={cleaningResult.rowsRemoved}
                                columnsModified={cleaningResult.columnsModified}
                                qualityMetrics={cleaningResult.qualityMetrics}
                                cleanedFilePath={cleaningResult.cleanedFilePath}
                                onContinue={() => {
                                    setShowResults(false)
                                    onRulesApplied?.()
                                }}
                            />
                            {cleaningResult.qualityMetrics && (
                                <DataQualityDashboard metrics={cleaningResult.qualityMetrics} />
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    )
}
