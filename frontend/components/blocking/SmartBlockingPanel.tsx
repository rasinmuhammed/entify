"use client"

import { useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Loader2, Sparkles, Check, Database } from "lucide-react"
import { AsyncDuckDB } from "@duckdb/duckdb-wasm"
import { buildApiUrl } from "@/lib/api/client"
import { useBackendCapabilities } from "@/lib/api/useBackendCapabilities"

export interface SemanticSuggestion {
    column: string
    run_id: string
    recommended_rule: string
    cluster_count: number
    unique_value_count: number
    sample_pairs: Array<{
        value_a: string
        value_b: string
        similarity: number
    }>
}

interface SmartBlockingPanelProps {
    columns: string[]
    duckDB?: AsyncDuckDB | null
    tableName?: string
    onApplySuggestion: (suggestion: SemanticSuggestion) => void
}

export function SmartBlockingPanel({
    columns,
    duckDB,
    tableName,
    onApplySuggestion
}: SmartBlockingPanelProps) {
    // Semantic blocking is an optional install. Offering the control when the
    // backend cannot serve it turns an uninstalled extra into what looks like
    // a broken feature.
    const { capabilities, loading: checkingCapabilities } = useBackendCapabilities()
    const [selectedColumns, setSelectedColumns] = useState<string[]>([])
    const [threshold, setThreshold] = useState(0.85)
    const [sampleSize, setSampleSize] = useState(5000)
    const [maxUniqueValues, setMaxUniqueValues] = useState(2000)
    const [loading, setLoading] = useState(false)
    const [suggestions, setSuggestions] = useState<SemanticSuggestion[]>([])
    const [error, setError] = useState<string | null>(null)

    const canGenerate = selectedColumns.length > 0 && !!duckDB && !!tableName

    const sortedColumns = useMemo(() => [...columns].sort(), [columns])

    const toggleColumn = (column: string) => {
        setSelectedColumns((prev) =>
            prev.includes(column) ? prev.filter((c) => c !== column) : [...prev, column]
        )
    }

    const encodeBase64 = (csv: string) => {
        const encoder = new TextEncoder()
        const data = encoder.encode(csv)
        const CHUNK_SIZE = 8192
        let binary = ""
        for (let i = 0; i < data.length; i += CHUNK_SIZE) {
            const chunk = data.slice(i, i + CHUNK_SIZE)
            binary += String.fromCharCode(...Array.from(chunk))
        }
        return btoa(binary)
    }

    const fetchSuggestions = async () => {
        if (!duckDB || !tableName || selectedColumns.length === 0) return
        setLoading(true)
        setError(null)

        try {
            const conn = await duckDB.connect()
            const colList = selectedColumns.map((c) => `"${c}"`).join(", ")
            const limitClause = sampleSize > 0 ? ` LIMIT ${sampleSize}` : ""
            const result = await conn.query(`SELECT ${colList} FROM "${tableName}"${limitClause}`)
            const rows = result.toArray().map((r: any) => {
                const obj = r.toJSON()
                Object.keys(obj).forEach((key) => {
                    if (typeof obj[key] === "bigint") {
                        obj[key] = Number(obj[key])
                    }
                })
                return obj
            })
            await conn.close()

            if (rows.length === 0) {
                setError("No data available for the selected columns.")
                setSuggestions([])
                setLoading(false)
                return
            }

            const headers = Object.keys(rows[0])
            const csvRows = [
                headers.join(","),
                ...rows.map((row) => headers.map((h) => JSON.stringify(row[h] ?? "")).join(","))
            ]
            const csvData = csvRows.join("\n")
            const encoded = encodeBase64(csvData)

            const response = await fetch(buildApiUrl('/api/blocking/suggestions'), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    data: encoded,
                    columns: selectedColumns,
                    sample_size: sampleSize,
                    max_unique_values: maxUniqueValues,
                    similarity_threshold: threshold,
                    model_name: "all-MiniLM-L6-v2"
                })
            })

            if (!response.ok) {
                const err = await response.json()
                throw new Error(err.detail || "Failed to generate suggestions")
            }

            const resultJson = await response.json()
            setSuggestions(resultJson.suggestions || [])
        } catch (err: any) {
            console.error("Semantic blocking error:", err)
            setError(err.message || "Failed to generate suggestions")
            setSuggestions([])
        } finally {
            setLoading(false)
        }
    }

    const unavailable = !checkingCapabilities && !capabilities.semanticBlocking

    if (unavailable) {
        return (
            <Card className="border-dashed">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Sparkles className="h-4 w-4 text-muted-foreground" />
                        Smart Semantic Blocking
                    </CardTitle>
                    <CardDescription>
                        Not installed. This groups values by meaning rather than
                        spelling, so <span className="font-medium">IBM</span> and{" "}
                        <span className="font-medium">International Business Machines</span>{" "}
                        can share a block.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                        It is an optional extra because it pulls in around 600MB
                        of machine learning dependencies. Everything else works
                        without it.
                    </p>
                    <pre className="mt-3 overflow-x-auto rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono text-xs text-muted-foreground">
pip install -r backend/requirements-semantic.txt</pre>
                    <p className="mt-2 text-xs text-muted-foreground/70">
                        Restart the backend afterwards.
                    </p>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card className="border-dashed">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-foreground" />
                    Smart Semantic Blocking
                </CardTitle>
                <CardDescription>
                    Use embeddings to discover similar values and generate high-signal blocking rules.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-sm font-medium">
                            <Database className="h-4 w-4" />
                            Select columns to analyze
                        </div>
                        <ScrollArea className="h-40 rounded border">
                            <div className="p-2 space-y-2">
                                {sortedColumns.length === 0 && (
                                    <div className="text-xs text-muted-foreground">No columns detected</div>
                                )}
                                {sortedColumns.map((col) => (
                                    <label key={col} className="flex items-center gap-2 text-sm">
                                        <input
                                            type="checkbox"
                                            className="h-4 w-4"
                                            checked={selectedColumns.includes(col)}
                                            onChange={() => toggleColumn(col)}
                                        />
                                        <span className="truncate">{col}</span>
                                    </label>
                                ))}
                            </div>
                        </ScrollArea>
                        <div className="flex flex-wrap gap-2">
                            {selectedColumns.map((col) => (
                                <Badge key={col} variant="secondary">
                                    {col}
                                </Badge>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <div className="flex items-center justify-between text-sm">
                                <span>Similarity threshold</span>
                                <span className="font-mono">{threshold.toFixed(2)}</span>
                            </div>
                            <Slider
                                min={0.6}
                                max={0.99}
                                step={0.01}
                                value={[threshold]}
                                onValueChange={(val) => setThreshold(val[0])}
                                className="mt-2"
                            />
                        </div>
                        <div>
                            <label className="text-sm">Sample size</label>
                            <Input
                                type="number"
                                min={100}
                                value={sampleSize}
                                onChange={(e) => setSampleSize(Number(e.target.value))}
                            />
                        </div>
                        <div>
                            <label className="text-sm">Max unique values</label>
                            <Input
                                type="number"
                                min={100}
                                value={maxUniqueValues}
                                onChange={(e) => setMaxUniqueValues(Number(e.target.value))}
                            />
                        </div>
                    </div>

                    <div className="flex flex-col justify-between gap-4">
                        <div className="rounded border p-3 text-xs text-muted-foreground">
                            <p className="font-medium text-foreground mb-1">How it works</p>
                            <p>We embed the selected columns, cluster values above the threshold, and build a blocking key.</p>
                            <p className="mt-2">Only the selected columns are used for analysis.</p>
                        </div>
                        <Button onClick={fetchSuggestions} disabled={!canGenerate || loading} className="w-full">
                            {loading ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Generating...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="h-4 w-4 mr-2" />
                                    Generate Suggestions
                                </>
                            )}
                        </Button>
                    </div>
                </div>

                <Separator />

                {error && (
                    <div className="text-sm text-destructive">{error}</div>
                )}

                {suggestions.length > 0 ? (
                    <div className="space-y-4">
                        {suggestions.map((s) => (
                            <Card key={s.run_id} className="border">
                                <CardContent className="p-4 space-y-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="space-y-1">
                                            <div className="font-medium">{s.column}</div>
                                            <div className="text-xs text-muted-foreground">
                                                {s.unique_value_count} unique values, {s.cluster_count} clusters
                                            </div>
                                        </div>
                                        <Button size="sm" onClick={() => onApplySuggestion(s)}>
                                            <Check className="h-4 w-4 mr-2" />
                                            Apply Rule
                                        </Button>
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        Recommended rule: <span className="font-mono text-foreground">{s.recommended_rule}</span>
                                    </div>
                                    {s.sample_pairs.length > 0 && (
                                        <div className="text-xs">
                                            <div className="font-medium mb-1">Sample pairs</div>
                                            <ul className="space-y-1">
                                                {s.sample_pairs.map((pair, idx) => (
                                                    <li key={idx} className="text-muted-foreground">
                                                        "{pair.value_a}" ↔ "{pair.value_b}" (sim {pair.similarity})
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                ) : (
                    <div className="text-sm text-muted-foreground">
                        No suggestions yet. Select columns and generate.
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
