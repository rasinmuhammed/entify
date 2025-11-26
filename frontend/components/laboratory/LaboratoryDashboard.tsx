"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
    FlaskConical,
    Settings,
    LineChart,
    Search,
    BarChart3,
    AlertCircle,
    ArrowRight,
    CheckCircle2,
    Loader2
} from 'lucide-react'

import { ParameterEstimation } from './ParameterEstimation'
import { QualityMetrics } from './QualityMetrics'

interface LaboratoryDashboardProps {
    onSkipToResults?: () => void
    onBackToTraining?: () => void
    isProcessing?: boolean
    blockingRules?: string[]
}

export function LaboratoryDashboard({
    onSkipToResults,
    onBackToTraining,
    isProcessing = false,
    blockingRules = []
}: LaboratoryDashboardProps) {
    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                        <FlaskConical className="h-6 w-6" />
                        Laboratory
                    </h2>
                    <p className="text-muted-foreground mt-1">
                        Advanced model configuration and analysis tools
                    </p>
                </div>
                <div className="flex gap-2">
                    {onBackToTraining && (
                        <Button variant="outline" onClick={onBackToTraining} disabled={isProcessing}>
                            ← Back to Training
                        </Button>
                    )}
                    {onSkipToResults && (
                        <Button onClick={onSkipToResults} disabled={isProcessing}>
                            {isProcessing ? (
                                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing...</>
                            ) : (
                                <>Skip to Results <ArrowRight className="w-4 h-4 ml-2" /></>
                            )}
                        </Button>
                    )}
                </div>
            </div>

            {/* Info Card */}
            <Card className="border-dashed border-blue-500/50 bg-blue-50/50 dark:bg-blue-950/20">
                <CardContent className="pt-6">
                    <div className="flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
                        <div className="flex-1">
                            <p className="font-medium text-blue-900 dark:text-blue-100 mb-1">
                                🧪 Optional Advanced Features
                            </p>
                            <p className="text-sm text-blue-700 dark:text-blue-300">
                                This phase provides advanced Splink features for power users. You can skip directly to Results if you're satisfied with the default configuration, or explore these tools to fine-tune your model.
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Features Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Parameter Estimation */}
                <ParameterEstimation blockingRules={blockingRules} />

                {/* Quality Metrics */}
                <QualityMetrics />

                {/* Comparison Viewer */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Search className="h-5 w-5" />
                            Comparison Viewer
                        </CardTitle>
                        <CardDescription>
                            Inspect individual record comparisons in detail
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            <div className="p-4 bg-muted/30 rounded-lg">
                                <p className="text-sm text-muted-foreground mb-2">
                                    Search and view match weights for specific record pairs
                                </p>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <CheckCircle2 className="h-3 w-3 text-green-600" />
                                    <span>Debug matching decisions</span>
                                </div>
                            </div>
                            <Button variant="outline" className="w-full" disabled>
                                Coming Soon
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* Term Frequency Analysis */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <BarChart3 className="h-5 w-5" />
                            Term Frequency Analysis
                        </CardTitle>
                        <CardDescription>
                            Analyze value distributions across columns
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            <div className="p-4 bg-muted/30 rounded-lg">
                                <p className="text-sm text-muted-foreground mb-2">
                                    Understand how common or rare values affect matching scores
                                </p>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <CheckCircle2 className="h-3 w-3 text-green-600" />
                                    <span>Optimize TF-IDF matching</span>
                                </div>
                            </div>
                            <Button variant="outline" className="w-full" disabled>
                                Coming Soon
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Navigation */}
            <Card>
                <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="font-medium mb-1">Ready to view results?</p>
                            <p className="text-sm text-muted-foreground">
                                Your model has been trained with the current configuration. You can proceed to view results or continue exploring advanced features as they become available.
                            </p>
                        </div>
                        <Button onClick={onSkipToResults} size="lg" disabled={isProcessing}>
                            {isProcessing ? (
                                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing...</>
                            ) : (
                                <>View Results <ArrowRight className="w-4 h-4 ml-2" /></>
                            )}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
