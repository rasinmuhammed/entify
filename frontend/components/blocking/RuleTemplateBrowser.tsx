"use client"

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Search, Plus, CheckCircle2, XCircle, TrendingUp, TrendingDown } from 'lucide-react'
import { BlockingRuleTemplate, BLOCKING_RULE_TEMPLATES, RuleCategory, getTemplatesByCategory, suggestTemplates } from '@/lib/blocking/ruleTemplates'

interface RuleTemplateBrowserProps {
    columns: string[]
    onSelectTemplate: (template: BlockingRuleTemplate, selectedColumns: string[]) => void
}

export function RuleTemplateBrowser({ columns, onSelectTemplate }: RuleTemplateBrowserProps) {
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedCategory, setSelectedCategory] = useState<RuleCategory | 'all' | 'suggested'>('suggested')
    const [selectedTemplate, setSelectedTemplate] = useState<BlockingRuleTemplate | null>(null)
    const [selectedColumns, setSelectedColumns] = useState<string[]>([])

    // Get templates based on category
    const getTemplates = () => {
        if (selectedCategory === 'all') {
            return BLOCKING_RULE_TEMPLATES
        } else if (selectedCategory === 'suggested') {
            return suggestTemplates(columns)
        } else {
            return getTemplatesByCategory(selectedCategory)
        }
    }

    // Filter by search
    const filteredTemplates = getTemplates().filter(template =>
        template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        template.description.toLowerCase().includes(searchQuery.toLowerCase())
    )

    const handleApplyTemplate = () => {
        if (selectedTemplate && selectedColumns.length >= selectedTemplate.requiredColumns) {
            onSelectTemplate(selectedTemplate, selectedColumns)
            setSelectedTemplate(null)
            setSelectedColumns([])
        }
    }

    const selectivityColor = (selectivity: string) => {
        switch (selectivity) {
            case 'high': return 'bg-green-500'
            case 'medium': return 'bg-yellow-500'
            case 'low': return 'bg-red-500'
            default: return 'bg-gray-500'
        }
    }

    const categoryIcon = (category: RuleCategory) => {
        switch (category) {
            case 'exact': return '🎯'
            case 'fuzzy': return '🔍'
            case 'compound': return '🔗'
            case 'geographic': return '🌍'
            case 'temporal': return '📅'
            case 'custom': return '⚙️'
        }
    }

    return (
        <div className="space-y-4">
            {/* Search and Filter */}
            <div className="flex items-center gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search templates..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9"
                    />
                </div>
            </div>

            {/* Category Tabs */}
            <Tabs value={selectedCategory} onValueChange={(v) => setSelectedCategory(v as any)}>
                <TabsList className="grid w-full grid-cols-7">
                    <TabsTrigger value="suggested">✨ Suggested</TabsTrigger>
                    <TabsTrigger value="all">All</TabsTrigger>
                    <TabsTrigger value="exact">🎯 Exact</TabsTrigger>
                    <TabsTrigger value="fuzzy">🔍 Fuzzy</TabsTrigger>
                    <TabsTrigger value="compound">🔗 Compound</TabsTrigger>
                    <TabsTrigger value="geographic">🌍 Geo</TabsTrigger>
                    <TabsTrigger value="temporal">📅 Time</TabsTrigger>
                </TabsList>

                <TabsContent value={selectedCategory} className="mt-4">
                    <ScrollArea className="h-[400px] pr-4">
                        <div className="space-y-3">
                            {filteredTemplates.length === 0 ? (
                                <Card>
                                    <CardContent className="py-8 text-center text-muted-foreground">
                                        No templates found matching your criteria
                                    </CardContent>
                                </Card>
                            ) : (
                                filteredTemplates.map((template) => (
                                    <Card
                                        key={template.id}
                                        className={`cursor-pointer transition-all ${selectedTemplate?.id === template.id
                                            ? 'border-primary shadow-md'
                                            : 'hover:border-primary/50'
                                            }`}
                                        onClick={() => {
                                            setSelectedTemplate(template)
                                            // Auto-select columns if hints match
                                            if (template.columnHints) {
                                                const matches = columns.filter(col =>
                                                    template.columnHints!.some(hint =>
                                                        col.toLowerCase().includes(hint.toLowerCase())
                                                    )
                                                ).slice(0, template.requiredColumns)
                                                setSelectedColumns(matches)
                                            }
                                        }}
                                    >
                                        <CardHeader className="pb-3">
                                            <div className="flex items-start justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-2xl">{categoryIcon(template.category)}</span>
                                                    <div>
                                                        <CardTitle className="text-base">{template.name}</CardTitle>
                                                        <CardDescription className="text-xs mt-1">
                                                            {template.description}
                                                        </CardDescription>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Badge variant="outline" className="text-xs">
                                                        {template.requiredColumns} col{template.requiredColumns > 1 ? 's' : ''}
                                                    </Badge>
                                                    <div className={`w-2 h-2 rounded-full ${selectivityColor(template.estimatedSelectivity)}`} />
                                                </div>
                                            </div>
                                        </CardHeader>
                                        <CardContent className="space-y-3">
                                            {/* Example */}
                                            <div className="bg-muted p-2 rounded text-xs font-mono">
                                                {template.example}
                                            </div>

                                            {/* Pros/Cons */}
                                            <div className="grid grid-cols-2 gap-2 text-xs">
                                                <div className="space-y-1">
                                                    {template.pros.slice(0, 2).map((pro, idx) => (
                                                        <div key={idx} className="flex items-start gap-1 text-green-600">
                                                            <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0" />
                                                            <span>{pro}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                                <div className="space-y-1">
                                                    {template.cons.slice(0, 2).map((con, idx) => (
                                                        <div key={idx} className="flex items-start gap-1 text-red-600">
                                                            <XCircle className="h-3 w-3 mt-0.5 shrink-0" />
                                                            <span>{con}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Splink Function */}
                                            {template.splinkFunction && (
                                                <div className="bg-blue-50 dark:bg-blue-950/20 p-2 rounded">
                                                    <p className="text-xs text-muted-foreground mb-1">Splink:</p>
                                                    <code className="text-xs">{template.splinkFunction}</code>
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                ))
                            )}
                        </div>
                    </ScrollArea>
                </TabsContent>
            </Tabs>

            {/* Selected Template Details */}
            {selectedTemplate && (
                <Card className="border-primary">
                    <CardHeader>
                        <CardTitle className="text-sm">Apply Template: {selectedTemplate.name}</CardTitle>
                        <CardDescription>Select {selectedTemplate.requiredColumns} column(s) to use</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {/* Column Selection */}
                        <div className="flex flex-wrap gap-2">
                            {columns.map((col) => (
                                <Button
                                    key={col}
                                    variant={selectedColumns.includes(col) ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={() => {
                                        if (selectedColumns.includes(col)) {
                                            setSelectedColumns(selectedColumns.filter(c => c !== col))
                                        } else if (selectedColumns.length < selectedTemplate.requiredColumns) {
                                            setSelectedColumns([...selectedColumns, col])
                                        }
                                    }}
                                    disabled={!selectedColumns.includes(col) && selectedColumns.length >= selectedTemplate.requiredColumns}
                                >
                                    {col}
                                </Button>
                            ))}
                        </div>

                        {/* SQL Preview */}
                        {selectedColumns.length === selectedTemplate.requiredColumns && (
                            <div className="space-y-2">
                                <p className="text-xs font-medium">SQL Preview:</p>
                                <div className="bg-muted p-3 rounded font-mono text-xs">
                                    {selectedTemplate.sqlExpression(selectedColumns)}
                                </div>
                            </div>
                        )}

                        {/* Apply Button */}
                        <Button
                            onClick={handleApplyTemplate}
                            disabled={selectedColumns.length !== selectedTemplate.requiredColumns}
                            className="w-full"
                        >
                            <Plus className="h-4 w-4 mr-2" />
                            Add Rule
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* Legend */}
            <Card className="bg-muted/50">
                <CardContent className="py-3">
                    <div className="flex items-center gap-4 text-xs">
                        <span className="font-medium">Selectivity:</span>
                        <div className="flex items-center gap-1">
                            <div className="w-2 h-2 rounded-full bg-green-500" />
                            <span>High</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="w-2 h-2 rounded-full bg-yellow-500" />
                            <span>Medium</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="w-2 h-2 rounded-full bg-red-500" />
                            <span>Low</span>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
