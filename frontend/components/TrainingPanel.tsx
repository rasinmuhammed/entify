"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { GlassCard } from "@/components/ui/glass-card"
import { Play, Loader2, CheckCircle2, AlertTriangle, XCircle } from "lucide-react"
import { Progress } from "@/components/ui/progress"

interface TrainingPanelProps {
    onTrainingComplete: (model: any) => void
}

interface LogEntry {
    message: string
    level: string
    timestamp: number
    data?: any
}

export function TrainingPanel({ onTrainingComplete }: TrainingPanelProps) {
    const [isConnected, setIsConnected] = useState(false)
    const [logs, setLogs] = useState<LogEntry[]>([])
    const [isComplete, setIsComplete] = useState(false)
    const eventSourceRef = useRef<EventSource | null>(null)

    useEffect(() => {
        // Connect to SSE endpoint
        const eventSource = new EventSource('http://localhost:8000/api/training-logs')
        eventSourceRef.current = eventSource

        eventSource.onopen = () => {
            console.log('SSE connected')
            setIsConnected(true)
            setLogs(prev => [...prev, {
                message: '🔗 Connected to training log stream',
                level: 'info',
                timestamp: Date.now()
            }])
        }

        eventSource.addEventListener('log', (event) => {
            const log = JSON.parse(event.data) as LogEntry
            setLogs(prev => [...prev, log])

            // Check for completion indicators
            if (log.message.includes('Found') && log.message.includes('matches')) {
                setIsComplete(true)
                setTimeout(() => {
                    onTrainingComplete({ trained: true, timestamp: new Date().toISOString() })
                }, 500)
            }
        })

        eventSource.onerror = () => {
            console.error('SSE connection error')
            setIsConnected(false)
        }

        return () => {
            eventSource.close()
        }
    }, [onTrainingComplete])

    const clearLogs = () => {
        setLogs([])
        setIsComplete(false)
    }

    const getLogIcon = (level: string) => {
        switch (level) {
            case 'success':
                return <CheckCircle2 className="w-3 h-3 text-green-400" />
            case 'warning':
                return <AlertTriangle className="w-3 h-3 text-yellow-400" />
            case 'error':
                return <XCircle className="w-3 h-3 text-red-400" />
            default:
                return <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
        }
    }

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 space-y-6">
                    <GlassCard className="p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-semibold">Real-Time Training Logs</h3>
                                <p className="text-sm text-muted-foreground">
                                    Connected to backend Splink engine via Server-Sent Events
                                </p>
                            </div>
                            <div className="flex gap-2">
                                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${isConnected ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                    <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
                                    <span className="text-xs font-medium">{isConnected ? 'Live' : 'Disconnected'}</span>
                                </div>
                                {logs.length > 0 && (
                                    <Button
                                        onClick={clearLogs}
                                        variant="outline"
                                        size="sm"
                                    >
                                        Clear
                                    </Button>
                                )}
                            </div>
                        </div>

                        <div className="bg-black/40 rounded-lg p-4 h-[300px] overflow-y-auto font-mono text-xs space-y-1 border border-white/5">
                            {logs.length === 0 ? (
                                <div className="flex items-center justify-center h-full">
                                    <span className="text-muted-foreground/50">
                                        Waiting for training logs... Run entity resolution to see activity.
                                    </span>
                                </div>
                            ) : (
                                logs.map((log, i) => (
                                    <div key={i} className="flex items-start gap-2 text-green-400/80 hover:bg-white/5 px-2 py-1 rounded">
                                        {getLogIcon(log.level)}
                                        <span className="text-muted-foreground text-[10px] min-w-[60px]">
                                            {new Date(log.timestamp * 1000).toLocaleTimeString()}
                                        </span>
                                        <span className="flex-1">{log.message}</span>
                                        {log.data && Object.keys(log.data).length > 0 && (
                                            <span className="text-[10px] text-muted-foreground">
                                                {JSON.stringify(log.data)}
                                            </span>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </GlassCard>
                </div>

                <div className="space-y-6">
                    <GlassCard className="p-6 h-full flex flex-col">
                        <h3 className="text-sm font-medium mb-4">Connection Status</h3>
                        <div className="space-y-4 flex-1">
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Backend</span>
                                    <span className={isConnected ? "text-green-400" : "text-red-400"}>
                                        {isConnected ? "Connected" : "Disconnected"}
                                    </span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Logs Received</span>
                                    <span className="font-mono">{logs.length}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Status</span>
                                    <span className={isComplete ? "text-green-400" : "text-yellow-400"}>
                                        {isComplete ? "Complete" : "Waiting"}
                                    </span>
                                </div>
                            </div>

                            {!isConnected && (
                                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-200 flex gap-2">
                                    <XCircle className="w-4 h-4 shrink-0" />
                                    <p>
                                        Backend connection lost. Make sure backend is running at localhost:8000
                                    </p>
                                </div>
                            )}
                        </div>
                    </GlassCard>
                </div>
            </div>
        </div>
    )
}
