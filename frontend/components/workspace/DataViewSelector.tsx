"use client"

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Eye, EyeOff, RotateCcw } from 'lucide-react'
import { useWasm } from '@/lib/wasm/WasmContext'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'

/**
 * Quote an identifier for DuckDB.
 *
 * These names come from user-uploaded filenames. Interpolating them raw broke
 * on any name containing a quote, and the backend already hardened the same
 * pattern with quote_ident. Doubling embedded quotes is the SQL-standard
 * escape.
 */
function quoteIdent(name: string): string {
    return `"${name.replace(/"/g, '""')}"`
}

/** Escape a string literal for use in a WHERE clause. */
function quoteLiteral(value: string): string {
    return `'${value.replace(/'/g, "''")}'`
}

interface DataViewSelectorProps {
    datasetName: string
    onViewChange: (view: 'raw' | 'cleaned') => void
    currentView: 'raw' | 'cleaned'
}

export function DataViewSelector({ datasetName, onViewChange, currentView }: DataViewSelectorProps) {
    const { duckDB } = useWasm()
    const [cleanedExists, setCleanedExists] = useState(false)
    const [resetDialogOpen, setResetDialogOpen] = useState(false)
    const [resetting, setResetting] = useState(false)
    const [resetNotice, setResetNotice] = useState<string | null>(null)
    const [stats, setStats] = useState<{
        rawRows: number
        cleanedRows: number
    } | null>(null)

    const checkCleanedTable = useCallback(async () => {
        if (!duckDB) return

        try {
            const conn = await duckDB.connect()

            const tableCheck = await conn.query(`
                SELECT count(*) AS cnt FROM information_schema.tables
                WHERE table_name = ${quoteLiteral(`${datasetName}_cleaned`)}
            `)
            const exists = Number(tableCheck.toArray()[0]['cnt']) > 0
            setCleanedExists(exists)

            if (exists) {
                const rawCount = await conn.query(
                    `SELECT COUNT(*) AS count FROM ${quoteIdent(`${datasetName}_raw`)}`
                )
                const cleanedCount = await conn.query(
                    `SELECT COUNT(*) AS count FROM ${quoteIdent(`${datasetName}_cleaned`)}`
                )

                setStats({
                    rawRows: Number(rawCount.toArray()[0].count),
                    cleanedRows: Number(cleanedCount.toArray()[0].count)
                })
            } else {
                setStats(null)
            }

            await conn.close()
        } catch (error) {
            console.error('Error checking cleaned table:', error)
        }
    }, [datasetName, duckDB])

    useEffect(() => {
        checkCleanedTable()
    }, [checkCleanedTable])

    const handleReset = useCallback(async () => {
        if (!duckDB) return
        setResetting(true)
        try {
            const conn = await duckDB.connect()
            try {
                await conn.query(
                    `DROP TABLE IF EXISTS ${quoteIdent(`${datasetName}_cleaned`)}`
                )
            } finally {
                await conn.close()
            }
            onViewChange('raw')
            setResetDialogOpen(false)
            await checkCleanedTable()
        } catch (error) {
            setResetNotice(
                error instanceof Error
                    ? `Could not discard the cleaned data: ${error.message}`
                    : 'Could not discard the cleaned data.'
            )
        } finally {
            setResetting(false)
        }
    }, [checkCleanedTable, datasetName, duckDB, onViewChange])

    // Render nothing until there is a cleaned table to switch to. This used to
    // be a placeholder card, which held open a third of the row telling the
    // user that a toggle they had not created yet did not exist. The parent
    // grid collapses and the preview takes the full width instead.
    if (!cleanedExists) {
        return null
    }

    return (
        <Card className="lg:w-64 lg:shrink-0">
            <CardHeader>
                <CardTitle className="text-base">Data View</CardTitle>
                <CardDescription>
                    Toggle between original and cleaned data
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {resetNotice && (
                    <Alert>
                        <AlertDescription>{resetNotice}</AlertDescription>
                    </Alert>
                )}

                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Switch
                            checked={currentView === 'cleaned'}
                            onCheckedChange={(checked) => onViewChange(checked ? 'cleaned' : 'raw')}
                        />
                        <div>
                            <Label className="text-sm font-medium">
                                {currentView === 'cleaned' ? 'Viewing Cleaned Data' : 'Viewing Raw Data'}
                            </Label>
                            <p className="text-xs text-muted-foreground">
                                {currentView === 'cleaned' ? (
                                    <span className="flex items-center gap-1">
                                        <Eye className="h-3 w-3" />
                                        Showing processed results
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-1">
                                        <EyeOff className="h-3 w-3" />
                                        Showing original data
                                    </span>
                                )}
                            </p>
                        </div>
                    </div>
                </div>

                {stats && (
                    <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                        <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">Raw Data</p>
                            <p className="text-2xl font-bold">{stats.rawRows.toLocaleString()}</p>
                            <Badge variant="outline" className="text-xs">Original</Badge>
                        </div>
                        <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">Cleaned Data</p>
                            <p className="text-2xl font-bold">{stats.cleanedRows.toLocaleString()}</p>
                            <Badge className="text-xs">
                                {stats.rawRows - stats.cleanedRows > 0
                                    ? `-${(stats.rawRows - stats.cleanedRows).toLocaleString()}`
                                    : 'No change'}
                            </Badge>
                        </div>
                    </div>
                )}

                <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setResetDialogOpen(true)}
                >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Discard cleaned data
                </Button>

                <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Reset cleaned data</DialogTitle>
                            <DialogDescription>
                                Discards the cleaned table and returns to the
                                original data. Your cleaning rules stay, so you
                                can apply them again. The uploaded data is not
                                affected.
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setResetDialogOpen(false)}>
                                Cancel
                            </Button>
                            <Button onClick={handleReset} disabled={resetting}>
                                {resetting ? 'Discarding' : 'Discard cleaned data'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </CardContent>
        </Card>
    )
}
