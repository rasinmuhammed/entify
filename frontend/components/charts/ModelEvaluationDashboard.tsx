"use client"

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScoreDistribution } from './ScoreDistribution'
import { ThresholdAnalysis } from './ThresholdAnalysis'
import { TrendingUp, Settings2 } from 'lucide-react'

interface ModelEvaluationDashboardProps {
    currentThreshold?: number
    onThresholdChange?: (threshold: number) => void
}

export function ModelEvaluationDashboard({
    currentThreshold = 0.5,
    onThresholdChange
}: ModelEvaluationDashboardProps) {
    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h2 className="text-2xl font-bold tracking-tight">Model Evaluation</h2>
                <p className="text-muted-foreground mt-1">
                    Analyze match quality and choose optimal thresholds for your entity resolution model
                </p>
            </div>

            {/* Tabs for different views */}
            <Tabs defaultValue="distribution" className="w-full">
                <TabsList className="grid w-full max-w-md grid-cols-2">
                    <TabsTrigger value="distribution" className="gap-2">
                        <TrendingUp className="h-4 w-4" />
                        Score Distribution
                    </TabsTrigger>
                    <TabsTrigger value="threshold" className="gap-2">
                        <Settings2 className="h-4 w-4" />
                        Threshold Analysis
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="distribution" className="mt-6">
                    <ScoreDistribution currentThreshold={currentThreshold} />
                </TabsContent>

                <TabsContent value="threshold" className="mt-6">
                    <ThresholdAnalysis
                        currentThreshold={currentThreshold}
                        onThresholdChange={onThresholdChange}
                    />
                </TabsContent>
            </Tabs>

            {/* Guidance Card */}
            <Card className="border-dashed">
                <CardHeader>
                    <CardTitle className="text-base">📚 How to Use These Charts</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                    <div>
                        <strong className="text-foreground">Score Distribution:</strong>
                        <p className="text-muted-foreground mt-1">
                            Shows how match probabilities are spread across all comparisons. Look for natural clustering of scores to identify good threshold candidates.
                        </p>
                    </div>
                    <div>
                        <strong className="text-foreground">Threshold Analysis:</strong>
                        <p className="text-muted-foreground mt-1">
                            Demonstrates how metrics change at different thresholds. Higher thresholds = fewer matches but higher precision. Lower thresholds = more matches but may include false positives.
                        </p>
                    </div>
                    <div className="pt-2 border-t">
                        <p className="text-xs text-muted-foreground italic">
                            💡 Tip: Start with the recommended threshold, then adjust based on your specific precision/recall requirements.
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
