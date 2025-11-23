"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { GlassCard } from "@/components/ui/glass-card"
import { Play, Loader2, CheckCircle2, AlertTriangle } from "lucide-react"
import { Progress } from "@/components/ui/progress"

interface TrainingPanelProps {
    onTrainingComplete: (model: any) => void
}

export function TrainingPanel({ onTrainingComplete }: TrainingPanelProps) {
    const [isTraining, setIsTraining] = useState(false)
    const [progress, setProgress] = useState(0)
    const [logs, setLogs] = useState<string[]>([])
    const [isComplete, setIsComplete] = useState(false)

    const startTraining = async () => {
        setIsTraining(true)
        setLogs([])
        setProgress(0)
        setIsComplete(false)

        const steps = [
            "Initializing EM Algorithm...",
            "Estimating u-probabilities...",
            "Blocking on 'first_name'...",
            "Iteration 1: Maximization...",
            "Iteration 1: Expectation...",
            "Iteration 2: Maximization...",
            "Iteration 2: Expectation...",
            "Converged.",
            "Estimating m-probabilities...",
            "Model training complete."
        ]

        for (let i = 0; i < steps.length; i++) {
            await new Promise(resolve => setTimeout(resolve, 800))
            setLogs(prev => [...prev, steps[i]])
            setProgress(((i + 1) / steps.length) * 100)
        }

        setIsTraining(false)
        setIsComplete(true)
        onTrainingComplete({ trained: true, timestamp: new Date().toISOString() })
    }

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 space-y-6">
                    <GlassCard className="p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-semibold">Unsupervised Training</h3>
                                <p className="text-sm text-muted-foreground">
                                    Estimate the Fellegi-Sunter parameters (m and u probabilities) using the Expectation-Maximization algorithm.
                                </p>
                            </div>
                            <Button
                                onClick={startTraining}
                                disabled={isTraining || isComplete}
                                className="min-w-[140px]"
                            >
                                {isTraining ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Training...
                                    </>
                                ) : isComplete ? (
                                    <>
                                        <CheckCircle2 className="w-4 h-4 mr-2" /> Retrain
                                    </>
                                ) : (
                                    <>
                                        <Play className="w-4 h-4 mr-2" /> Start Training
                                    </>
                                )}
                            </Button>
                        </div>

                        {isTraining && (
                            <div className="space-y-2">
                                <div className="flex justify-between text-xs text-muted-foreground">
                                    <span>Progress</span>
                                    <span>{Math.round(progress)}%</span>
                                </div>
                                <Progress value={progress} className="h-2" />
                            </div>
                        )}

                        <div className="bg-black/40 rounded-lg p-4 h-[200px] overflow-y-auto font-mono text-xs space-y-1 border border-white/5">
                            {logs.length === 0 ? (
                                <span className="text-muted-foreground/50">Training logs will appear here...</span>
                            ) : (
                                logs.map((log, i) => (
                                    <div key={i} className="text-green-400/80">
                                        <span className="text-muted-foreground mr-2">[{new Date().toLocaleTimeString()}]</span>
                                        {log}
                                    </div>
                                ))
                            )}
                        </div>
                    </GlassCard>
                </div>

                <div className="space-y-6">
                    <GlassCard className="p-6 h-full flex flex-col">
                        <h3 className="text-sm font-medium mb-4">Model Parameters</h3>
                        {isComplete ? (
                            <div className="space-y-4 flex-1">
                                <div className="space-y-1">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">Probability of Match</span>
                                        <span className="font-mono">0.023</span>
                                    </div>
                                    <Progress value={2.3} className="h-1.5 bg-white/10" />
                                </div>

                                <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded text-xs text-yellow-200 flex gap-2">
                                    <AlertTriangle className="w-4 h-4 shrink-0" />
                                    <p>
                                        Model converged successfully. Parameters look stable.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm text-center">
                                Train the model to view estimated parameters.
                            </div>
                        )}
                    </GlassCard>
                </div>
            </div>
        </div>
    )
}
