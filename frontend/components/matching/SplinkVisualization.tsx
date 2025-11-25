"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, RefreshCw, AlertCircle } from 'lucide-react'

interface SplinkVisualizationProps {
    type: 'match_weights' | 'waterfall'
    recordId1?: string
    recordId2?: string
    title?: string
    description?: string
}

export function SplinkVisualization({
    type,
    recordId1,
    recordId2,
    title = "Splink Visualization",
    description
}: SplinkVisualizationProps) {
    const [html, setHtml] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const fetchVisualization = async () => {
        setLoading(true)
        setError(null)
        try {
            let url = ''
            if (type === 'match_weights') {
                url = 'http://localhost:8000/api/splink/charts/match-weights'
            } else if (type === 'waterfall') {
                if (!recordId1 || !recordId2) {
                    throw new Error("Record IDs required for waterfall chart")
                }
                url = `http://localhost:8000/api/splink/charts/waterfall?record_id_1=${encodeURIComponent(recordId1)}&record_id_2=${encodeURIComponent(recordId2)}`
            }

            const res = await fetch(url)
            if (!res.ok) {
                const err = await res.json()
                throw new Error(err.detail || "Failed to fetch visualization")
            }

            const data = await res.json()
            setHtml(data.html)
        } catch (err: any) {
            console.error("Visualization error:", err)
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchVisualization()
    }, [type, recordId1, recordId2])

    return (
        <Card className="w-full h-full min-h-[500px] flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                    <CardTitle className="text-lg font-medium">{title}</CardTitle>
                    {description && <p className="text-sm text-muted-foreground">{description}</p>}
                </div>
                <Button variant="ghost" size="sm" onClick={fetchVisualization} disabled={loading}>
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
            </CardHeader>
            <CardContent className="flex-1 p-0 relative overflow-hidden">
                {loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                )}

                {error ? (
                    <div className="flex flex-col items-center justify-center h-full p-6 text-center text-muted-foreground">
                        <AlertCircle className="h-10 w-10 mb-4 text-destructive/50" />
                        <p className="font-medium text-foreground">Failed to load chart</p>
                        <p className="text-sm mt-1 max-w-md">{error}</p>
                        <Button variant="outline" size="sm" className="mt-4" onClick={fetchVisualization}>
                            Try Again
                        </Button>
                    </div>
                ) : html ? (
                    <iframe
                        srcDoc={html}
                        className="w-full h-full min-h-[600px] border-0"
                        sandbox="allow-scripts"
                        title="Splink Chart"
                    />
                ) : null}
            </CardContent>
        </Card>
    )
}
