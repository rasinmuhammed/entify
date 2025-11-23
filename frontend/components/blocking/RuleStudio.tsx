"use client"

import { useBlockingStore } from "@/lib/store/useBlockingStore"
import { BlockingRuleCard } from "./BlockingRuleCard"
import { Button } from "@/components/ui/button"
import { Plus, Wand2, Save, Play } from "lucide-react"
import { AnimatePresence, motion } from "framer-motion"
import { compileAllRules } from "@/lib/transpiler/splinkSql"
import { useState } from "react"
import axios from "axios"
import { useQuery } from "@tanstack/react-query"

import { useDatasetStore } from "@/lib/store/useDatasetStore"
import Link from "next/link"
import { GlassCard } from "@/components/ui/glass-card"

export default function RuleStudio() {
    const { rules, addRule } = useBlockingStore()
    const { activeDataset } = useDatasetStore()
    const [isRunning, setIsRunning] = useState(false)

    // Use columns from active dataset, or fallback to empty
    const columns = activeDataset?.columns.map(c => c.column) || []

    if (!activeDataset) {
        return (
            <div className="p-12 text-center">
                <GlassCard className="max-w-md mx-auto p-8 space-y-4">
                    <h2 className="text-xl font-semibold">No Dataset Selected</h2>
                    <p className="text-muted-foreground">Please upload a dataset first to configure matching rules.</p>
                    <Button asChild>
                        <Link href="/">Go to Dashboard</Link>
                    </Button>
                </GlassCard>
            </div>
        )
    }

    const { data: previewData } = useQuery({
        queryKey: ['preview', activeDataset?.name],
        queryFn: async () => {
            if (!activeDataset?.name) return []
            const res = await axios.get(`http://127.0.0.1:8000/preview/${activeDataset.name}`)
            return res.data.data
        },
        enabled: !!activeDataset?.name
    })

    const handleRunMatch = async () => {
        setIsRunning(true)
        const sqlRules = compileAllRules(rules)

        try {
            // Default settings for now
            const settings = {
                link_type: "dedupe_only",
                unique_id_column_name: "unique_id", // Assuming 'unique_id' exists or user maps it. TODO: Add mapping
                threshold: 0.5
            }

            await axios.post('http://127.0.0.1:8000/run-match', {
                table_name: activeDataset?.name,
                settings: settings,
                blocking_rules: rules
            })

            // Show success or redirect? For now just stop loading
            alert("Match job started!")
        } catch (e) {
            console.error(e)
            alert("Failed to start match job")
        } finally {
            setIsRunning(false)
        }
    }

    return (
        <div className="max-w-5xl mx-auto p-8 space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold gradient-text">Rule Studio</h1>
                    <p className="text-muted-foreground mt-1">
                        Design your entity resolution strategy using natural language.
                    </p>
                </div>
                <div className="flex gap-3">
                    <Button variant="outline" className="gap-2">
                        <Wand2 className="w-4 h-4" />
                        Auto-Suggest
                    </Button>
                    <Button onClick={handleRunMatch} disabled={isRunning} className="gap-2 bg-primary hover:bg-primary/90">
                        {isRunning ? "Running..." : (
                            <>
                                <Play className="w-4 h-4" /> Run Match
                            </>
                        )}
                    </Button>
                </div>
            </div>

            {/* Data Preview */}
            {previewData && previewData.length > 0 && (
                <GlassCard className="p-4 overflow-x-auto">
                    <h3 className="text-sm font-medium text-muted-foreground mb-3">Data Preview (First 5 rows)</h3>
                    <table className="w-full text-xs text-left">
                        <thead>
                            <tr className="border-b border-white/10">
                                {Object.keys(previewData[0]).map(key => (
                                    <th key={key} className="py-2 px-3 font-medium text-purple-300">{key}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {previewData.map((row: any, i: number) => (
                                <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                                    {Object.values(row).map((val: any, j) => (
                                        <td key={j} className="py-2 px-3 text-muted-foreground">{String(val)}</td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </GlassCard>
            )}

            {/* Help Guide */}
            <GlassCard className="bg-blue-500/5 border-blue-500/20 p-4">
                <div className="flex gap-3">
                    <div className="p-2 bg-blue-500/10 rounded-lg h-fit">
                        <Wand2 className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                        <h3 className="font-medium text-blue-100">How to create a Blocking Rule</h3>
                        <p className="text-sm text-blue-200/70 mt-1">
                            Blocking rules tell the system how to find potential matches efficiently.
                            Think of it as a "Search Strategy". For example:
                        </p>
                        <ul className="list-disc list-inside text-sm text-blue-200/70 mt-2 space-y-1">
                            <li>"Find records where <strong>First Name</strong> sounds similar AND <strong>City</strong> is exactly the same."</li>
                            <li>"Find records where <strong>Email</strong> is exactly the same."</li>
                        </ul>
                        <p className="text-sm text-blue-200/70 mt-2">
                            Create multiple rules to catch different types of matches (e.g., one rule for names, another for emails).
                        </p>
                    </div>
                </div>
            </GlassCard>

            <div className="space-y-6 relative">
                <AnimatePresence mode="popLayout">
                    {rules.map((rule, index) => (
                        <motion.div key={rule.id} layout>
                            {index > 0 && (
                                <div className="flex items-center justify-center py-4">
                                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                                    <span className="px-3 text-xs font-bold text-muted-foreground bg-black/20 rounded-full border border-white/5">
                                        OR
                                    </span>
                                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                                </div>
                            )}
                            <BlockingRuleCard rule={rule} index={index} columns={columns} />
                        </motion.div>
                    ))}
                </AnimatePresence>

                <motion.div layout className="flex justify-center pt-4">
                    <Button
                        variant="outline"
                        size="lg"
                        onClick={addRule}
                        className="gap-2 border-dashed border-white/20 hover:border-purple-500 hover:text-purple-400 hover:bg-purple-500/5"
                    >
                        <Plus className="w-4 h-4" />
                        Add Search Strategy
                    </Button>
                </motion.div>
            </div>

            {/* Live SQL Preview */}
            <div className="mt-12 p-6 rounded-xl bg-black/40 border border-white/5">
                <h3 className="text-sm font-medium text-muted-foreground mb-4">Generated SQL Preview</h3>
                <div className="font-mono text-xs text-green-400 space-y-2">
                    {compileAllRules(rules).map((sql, i) => (
                        <div key={i} className="flex gap-4">
                            <span className="text-white/20 select-none">{i + 1}</span>
                            <span>{sql}</span>
                        </div>
                    ))}
                    {rules.length === 0 && <span className="text-white/20">// No rules defined</span>}
                </div>
            </div>
        </div>
    )
}
