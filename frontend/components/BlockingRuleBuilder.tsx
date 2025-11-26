"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Zap, BookOpen, Library, BarChart3 } from 'lucide-react'
import { SimpleBlockingRuleBuilder } from '@/components/blocking/SimpleBlockingRuleBuilder'
import { BlockingRulesExplainer } from '@/components/blocking/BlockingRulesExplainer'
import { RuleTemplateBrowser } from '@/components/blocking/RuleTemplateBrowser'
import { RuleImpactVisualization } from '@/components/blocking/RuleImpactVisualization'
import { BlockingAnalyzer } from '@/components/blocking/BlockingAnalyzer'
import { BlockingRuleTemplate } from '@/lib/blocking/ruleTemplates'
import { AsyncDuckDB } from '@duckdb/duckdb-wasm'

interface BlockingRuleBuilderProps {
    columns: string[]
    onRulesChange: (rules: string[]) => void
    previewData?: any[]
    initialRules?: string[]
    totalRecords?: number
    duckDB?: AsyncDuckDB | null
    tableName?: string
}

export function BlockingRuleBuilder({
    columns,
    onRulesChange,
    previewData = [],
    initialRules = [],
    totalRecords = 1000,
    duckDB,
    tableName
}: BlockingRuleBuilderProps) {
    const [mode, setMode] = useState<'simple' | 'advanced'>('simple')
    const [rules, setRules] = useState<Array<{ rule: string; template?: BlockingRuleTemplate }>>(
        initialRules.map(r => ({ rule: r }))
    )

    const handleRulesChange = (newRules: string[]) => {
        setRules(newRules.map(r => ({ rule: r })))
        onRulesChange(newRules)
    }

    const handleAddTemplateRule = (template: BlockingRuleTemplate, selectedColumns: string[]) => {
        const ruleString = template.sqlExpression(selectedColumns)
        const newRules = [...rules, { rule: ruleString, template }]
        setRules(newRules)
        onRulesChange(newRules.map(r => r.rule))
    }

    const handleOptimize = (optimizedRules: string[]) => {
        setRules(optimizedRules.map(r => ({ rule: r })))
        onRulesChange(optimizedRules)
    }

    if (mode === 'simple') {
        return (
            <div className="space-y-4">
                {columns.length === 0 ? (
                    <Card>
                        <CardContent className="py-12 text-center">
                            <BookOpen className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                            <p className="text-muted-foreground mb-2 font-medium">
                                No columns available
                            </p>
                            <p className="text-sm text-muted-foreground">
                                Please make sure your data is loaded in the <strong>Profile</strong> phase first.
                            </p>
                        </CardContent>
                    </Card>
                ) : (
                    <>
                        {/* Simple Mode */}
                        <SimpleBlockingRuleBuilder
                            columns={columns}
                            onRulesChange={handleRulesChange}
                            initialRules={initialRules}
                            tableName={tableName}
                        />

                        {/* Blocking Analyzer */}
                        {rules.filter(r => r.rule).length > 0 && duckDB && tableName && (
                            <BlockingAnalyzer
                                blockingRules={rules.map(r => r.rule)}
                                datasetSize={totalRecords}
                                duckDB={duckDB}
                                tableName={tableName}
                                onOptimize={handleOptimize}
                            />
                        )}

                        {/* Switch to Advanced */}
                        <div className="flex justify-center">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setMode('advanced')}
                            >
                                <Library className="h-4 w-4 mr-2" />
                                Switch to Advanced Mode
                            </Button>
                        </div>
                    </>
                )}
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <Card className="border-purple-500/50 bg-purple-50/50 dark:bg-purple-950/20">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <BookOpen className="h-5 w-5" />
                                Advanced Blocking Rules
                            </CardTitle>
                            <CardDescription>
                                Templates, visualizations, and detailed configuration
                            </CardDescription>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setMode('simple')}
                        >
                            <Zap className="h-4 w-4 mr-2" />
                            Switch to Simple Mode
                        </Button>
                    </div>
                </CardHeader>
            </Card>

            {/* Advanced Tabs */}
            <Tabs defaultValue="learn">
                <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="learn" className="gap-2">
                        <BookOpen className="h-4 w-4" />
                        Learn
                    </TabsTrigger>
                    <TabsTrigger value="templates" className="gap-2">
                        <Library className="h-4 w-4" />
                        Templates
                    </TabsTrigger>
                    <TabsTrigger value="rules" className="gap-2">
                        <Zap className="h-4 w-4" />
                        My Rules ({rules.length})
                    </TabsTrigger>
                    <TabsTrigger value="analyzer" className="gap-2">
                        <BarChart3 className="h-4 w-4" />
                        Analyzer
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="learn">
                    <BlockingRulesExplainer />
                </TabsContent>

                <TabsContent value="templates">
                    <RuleTemplateBrowser
                        columns={columns}
                        onSelectTemplate={handleAddTemplateRule}
                    />
                </TabsContent>

                <TabsContent value="rules">
                    <Card>
                        <CardContent className="py-8 text-center">
                            <p className="text-muted-foreground">
                                Use Simple Mode for easier rule configuration
                            </p>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="analyzer">
                    {duckDB && tableName && rules.filter(r => r.rule).length > 0 ? (
                        <BlockingAnalyzer
                            blockingRules={rules.map(r => r.rule)}
                            datasetSize={totalRecords}
                            duckDB={duckDB}
                            tableName={tableName}
                            onOptimize={handleOptimize}
                        />
                    ) : (
                        <Card>
                            <CardContent className="py-12 text-center">
                                <BarChart3 className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                                <p className="text-muted-foreground mb-2">
                                    {!duckDB || !tableName
                                        ? 'Database not ready for analysis'
                                        : 'Add blocking rules to see performance analysis'}
                                </p>
                            </CardContent>
                        </Card>
                    )}
                </TabsContent>
            </Tabs>
        </div>
    )
}
