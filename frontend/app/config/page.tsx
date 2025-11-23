"use client"

import { useState } from "react"
import { GlassCard } from "@/components/ui/glass-card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Trash2, Save } from "lucide-react"

interface BlockingRule {
    id: string
    column: string
    method: "exact" | "jaro_winkler" | "soundex"
}

export default function MatchBuilder() {
    const [rules, setRules] = useState<BlockingRule[]>([
        { id: "1", column: "first_name", method: "exact" }
    ])

    const addRule = () => {
        setRules([...rules, { id: Math.random().toString(), column: "", method: "exact" }])
    }

    const removeRule = (id: string) => {
        setRules(rules.filter(r => r.id !== id))
    }

    const updateRule = (id: string, field: keyof BlockingRule, value: string) => {
        setRules(rules.map(r => r.id === id ? { ...r, [field]: value } : r))
    }

    return (
        <div className="p-8 space-y-8">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold gradient-text">Match Builder</h1>
                <Button className="gap-2 bg-primary hover:bg-primary/90">
                    <Save className="w-4 h-4" /> Save Configuration
                </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                    <GlassCard>
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-semibold">Blocking Rules</h2>
                            <Button variant="outline" size="sm" onClick={addRule} className="gap-2">
                                <Plus className="w-4 h-4" /> Add Rule
                            </Button>
                        </div>

                        <div className="space-y-4">
                            {rules.map((rule) => (
                                <div key={rule.id} className="flex items-center gap-4 p-4 rounded-lg bg-white/5 border border-white/10">
                                    <div className="flex-1 grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-xs text-muted-foreground">Column</label>
                                            <Select
                                                value={rule.column}
                                                onValueChange={(v) => updateRule(rule.id, "column", v)}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select column" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="first_name">first_name</SelectItem>
                                                    <SelectItem value="last_name">last_name</SelectItem>
                                                    <SelectItem value="email">email</SelectItem>
                                                    <SelectItem value="city">city</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs text-muted-foreground">Match Method</label>
                                            <Select
                                                value={rule.method}
                                                onValueChange={(v) => updateRule(rule.id, "method", v as any)}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="exact">Exact Match</SelectItem>
                                                    <SelectItem value="jaro_winkler">Jaro-Winkler Similarity</SelectItem>
                                                    <SelectItem value="soundex">Soundex (Phonetic)</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="text-destructive hover:text-destructive/90 hover:bg-destructive/10 mt-6"
                                        onClick={() => removeRule(rule.id)}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </GlassCard>
                </div>

                <div className="space-y-6">
                    <GlassCard className="h-full bg-black/40">
                        <h2 className="text-xl font-semibold mb-4">Generated SQL</h2>
                        <div className="p-4 rounded bg-black/50 font-mono text-sm text-green-400 overflow-x-auto">
                            <pre>
                                {rules.map((r, i) => {
                                    let sql = ""
                                    if (r.method === "exact") sql = `l.${r.column} = r.${r.column}`
                                    if (r.method === "soundex") sql = `soundex(l.${r.column}) = soundex(r.${r.column})`
                                    if (r.method === "jaro_winkler") sql = `jaro_winkler_similarity(l.${r.column}, r.${r.column}) > 0.9`
                                    return (i > 0 ? " OR\n" : "") + sql
                                })}
                            </pre>
                        </div>
                        <p className="mt-4 text-sm text-muted-foreground">
                            These rules define how Splink will "block" records to find potential matches efficiently.
                        </p>
                    </GlassCard>
                </div>
            </div>
        </div>
    )
}
