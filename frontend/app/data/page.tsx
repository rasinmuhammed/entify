"use client"

import { useState, useEffect } from "react"
import { GlassCard } from "@/components/ui/glass-card"
import { Button } from "@/components/ui/button"
import { useDatasetStore } from "@/lib/store/useDatasetStore"
import { ArrowRight, Database, FileType, AlertCircle } from "lucide-react"
import Link from "next/link"

export default function DataExplorer() {
    const { activeDataset } = useDatasetStore()

    if (!activeDataset) {
        return (
            <div className="p-8 space-y-8">
                <h1 className="text-3xl font-bold gradient-text">Data Explorer</h1>
                <GlassCard className="min-h-[400px] flex flex-col items-center justify-center gap-4">
                    <Database className="w-12 h-12 text-muted-foreground opacity-50" />
                    <div className="text-center space-y-2">
                        <h3 className="text-xl font-medium">No Dataset Active</h3>
                        <p className="text-muted-foreground">
                            Please upload a dataset in the Dashboard to explore it here.
                        </p>
                        <Button asChild className="mt-4">
                            <Link href="/">Go to Dashboard</Link>
                        </Button>
                    </div>
                </GlassCard>
            </div>
        )
    }

    return (
        <div className="p-8 space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold gradient-text">Data Inspector</h1>
                    <p className="text-muted-foreground mt-1">
                        Review your data before setting up matching rules.
                    </p>
                </div>
                <Button asChild size="lg" className="gap-2 bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20">
                    <Link href="/config">
                        Next: Define Matching Rules <ArrowRight className="w-4 h-4" />
                    </Link>
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <GlassCard className="p-6 flex items-center gap-4">
                    <div className="p-3 rounded-full bg-blue-500/10 text-blue-400">
                        <Database className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-sm text-muted-foreground">Total Rows</p>
                        <p className="text-2xl font-bold">{activeDataset.rowCount.toLocaleString()}</p>
                    </div>
                </GlassCard>
                <GlassCard className="p-6 flex items-center gap-4">
                    <div className="p-3 rounded-full bg-purple-500/10 text-purple-400">
                        <FileType className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-sm text-muted-foreground">Columns Found</p>
                        <p className="text-2xl font-bold">{activeDataset.columns.length}</p>
                    </div>
                </GlassCard>
            </div>

            <h2 className="text-xl font-semibold mt-8">Column Health</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeDataset.columns.map((col) => (
                    <GlassCard key={col.column} className="p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="font-mono font-medium text-purple-300">{col.column}</span>
                            <span className="text-xs px-2 py-1 rounded bg-white/10 text-muted-foreground uppercase">
                                {col.type}
                            </span>
                        </div>
                        <div className="space-y-1">
                            <div className="flex justify-between text-xs text-muted-foreground">
                                <span>Uniqueness</span>
                                <span>{col.unique_count} unique</span>
                            </div>
                            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-green-500/50"
                                    style={{ width: `${Math.min((col.unique_count / activeDataset.rowCount) * 100, 100)}%` }}
                                />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <div className="flex justify-between text-xs text-muted-foreground">
                                <span>Missing Values</span>
                                <span className={col.null_percentage > 0 ? "text-red-400" : "text-green-400"}>
                                    {col.null_percentage.toFixed(1)}%
                                </span>
                            </div>
                            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-red-500/50"
                                    style={{ width: `${col.null_percentage}%` }}
                                />
                            </div>
                        </div>
                    </GlassCard>
                ))}
            </div>
        </div>
    )
}
