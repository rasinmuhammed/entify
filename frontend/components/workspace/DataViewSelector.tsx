"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Eye, EyeOff, RotateCcw } from 'lucide-react'
import { useWasm } from '@/lib/wasm/WasmContext'

interface DataViewSelectorProps {
    datasetName: string
    onViewChange: (view: 'raw' | 'cleaned') => void
    currentView: 'raw' | 'cleaned'
}

export function DataViewSelector({ datasetName, onViewChange, currentView }: DataViewSelectorProps) {
    const { duckDB } = useWasm()
    const [cleanedExists, setCleanedExists] = useState(false)
    const [stats, setStats] = useState<{
        rawRows: number
        cleanedRows: number
    } | null>(null)

    useEffect(() => {
        checkCleanedTable()
    }, [datasetName, duckDB])

    const checkCleanedTable = async () => {
        if (!duckDB) return

        try {
            const conn = await duckDB.connect()

            // Check if cleaned table exists
            const tableCheck = await conn.query(`
                SELECT count(*) as cnt FROM information_schema.tables 
                WHERE table_name = '${datasetName}_cleaned'
            `)
            const exists = Number(tableCheck.toArray()[0]['cnt']) > 0
            setCleanedExists(exists)

            if (exists) {
                // Get row counts for both tables
                const rawCount = await conn.query(`SELECT COUNT(*) as count FROM "${datasetName}_raw"`)
                const cleanedCount = await conn.query(`SELECT COUNT(*) as count FROM "${datasetName}_cleaned"`)

                setStats({
                    rawRows: Number(rawCount.toArray()[0].count),
                    cleanedRows: Number(cleanedCount.toArray()[0].count)
                })
            }

            await conn.close()
        } catch (error) {
            console.error('Error checking cleaned table:', error)
        }
    }

    if (!cleanedExists) {
        return (
            <Card>
                <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground text-center">
                        Apply cleaning rules to see cleaned data
                    </p>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-lg">Data View</CardTitle>
                <CardDescription>
                    Toggle between original and cleaned data
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
                    onClick={() => {
                        if (confirm('Reset to raw data? This will delete the cleaned version.')) {
                            // TODO: Implement reset functionality
                            alert('Reset functionality coming soon')
                        }
                    }}
                >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reset to Raw Data
                </Button>
            </CardContent>
        </Card>
    )
}
