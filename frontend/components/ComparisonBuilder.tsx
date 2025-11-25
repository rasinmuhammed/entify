"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BookOpen, Zap } from 'lucide-react'
import { SimpleComparisonBuilder } from '@/components/comparison/SimpleComparisonBuilder'
import { ComparisonExplainer } from '@/components/comparison/ComparisonExplainer'
import { ComparisonConfig } from '@/lib/comparison/comparisonMethods'

interface ComparisonBuilderProps {
    columns: string[]
    onComparisonsChange: (comparisons: any[]) => void
    previewData?: any[]
    initialComparisons?: any[]
    onGlobalSettingsChange?: (settings: any) => void
    initialGlobalSettings?: any
}

export function ComparisonBuilder({
    columns,
    onComparisonsChange,
    previewData = [],
    initialComparisons = [],
    onGlobalSettingsChange,
    initialGlobalSettings
}: ComparisonBuilderProps) {
    const [activeTab, setActiveTab] = useState('learn')

    const handleConfigChange = (configs: ComparisonConfig[]) => {
        // Convert to format expected by parent
        onComparisonsChange(configs)
    }

    if (columns.length === 0) {
        return (
            <Card>
                <CardContent className="py-12 text-center">
                    <BookOpen className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                    <p className="text-muted-foreground mb-2 font-medium">
                        No columns available
                    </p>
                    <p className="text-sm text-muted-foreground">
                        Please ensure your data is loaded and blocking rules are configured first.
                    </p>
                </CardContent>
            </Card>
        )
    }

    return (
        <div className="space-y-6">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="learn" className="gap-2">
                        <BookOpen className="h-4 w-4" />
                        Learn
                    </TabsTrigger>
                    <TabsTrigger value="configure" className="gap-2">
                        <Zap className="h-4 w-4" />
                        Configure
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="learn">
                    <ComparisonExplainer />
                    <div className="flex justify-end mt-4">
                        <Button onClick={() => setActiveTab('configure')}>
                            Start Configuring →
                        </Button>
                    </div>
                </TabsContent>

                <TabsContent value="configure">
                    <SimpleComparisonBuilder
                        columns={columns}
                        onConfigChange={handleConfigChange}
                        initialConfig={initialComparisons}
                        onGlobalSettingsChange={onGlobalSettingsChange}
                        initialGlobalSettings={initialGlobalSettings}
                    />
                </TabsContent>
            </Tabs>
        </div>
    )
}
