"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Settings, Play, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { useDatasetStore } from '@/lib/store/useDatasetStore'

interface ParameterEstimationProps {
    blockingRules: string[]
}

export function ParameterEstimation({ blockingRules }: ParameterEstimationProps) {
    const [selectedRule, setSelectedRule] = useState<string>("")
    const [isEstimating, setIsEstimating] = useState(false)
    const [lastResult, setLastResult] = useState<{ status: 'success' | 'error', message: string } | null>(null)

    const handleEstimate = async () => {
        if (!selectedRule) return

        setIsEstimating(true)
        setLastResult(null)

        try {
            const response = await fetch('http://localhost:8000/api/estimate-parameters', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ blocking_rule: selectedRule })
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.detail || 'Estimation failed')
            }

            setLastResult({ status: 'success', message: 'Parameters updated successfully' })
        } catch (error) {
            console.error('Estimation error:', error)
            setLastResult({
                status: 'error',
                message: error instanceof Error ? error.message : 'Unknown error occurred'
            })
        } finally {
            setIsEstimating(false)
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    Parameter Estimation
                </CardTitle>
                <CardDescription>
                    Fine-tune match probabilities using EM algorithm
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    <div className="p-4 bg-muted/30 rounded-lg">
                        <p className="text-sm text-muted-foreground mb-4">
                            Select a blocking rule to run Expectation Maximization. This will update the m-probabilities for the model.
                        </p>

                        <div className="space-y-3">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Blocking Rule</label>
                                <Select value={selectedRule} onValueChange={setSelectedRule}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a blocking rule..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {blockingRules.length === 0 ? (
                                            <SelectItem value="none" disabled>No blocking rules defined</SelectItem>
                                        ) : (
                                            blockingRules.map((rule, idx) => (
                                                <SelectItem key={idx} value={rule}>
                                                    {rule}
                                                </SelectItem>
                                            ))
                                        )}
                                    </SelectContent>
                                </Select>
                            </div>

                            <Button
                                onClick={handleEstimate}
                                disabled={!selectedRule || isEstimating}
                                className="w-full"
                            >
                                {isEstimating ? (
                                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Estimating...</>
                                ) : (
                                    <><Play className="w-4 h-4 mr-2" /> Run Estimation</>
                                )}
                            </Button>
                        </div>
                    </div>

                    {lastResult && (
                        <div className={`p-3 rounded-md flex items-start gap-2 text-sm ${lastResult.status === 'success'
                                ? 'bg-green-50 text-green-900 dark:bg-green-900/20 dark:text-green-100'
                                : 'bg-red-50 text-red-900 dark:bg-red-900/20 dark:text-red-100'
                            }`}>
                            {lastResult.status === 'success' ? (
                                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                            ) : (
                                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                            )}
                            <p>{lastResult.message}</p>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}
