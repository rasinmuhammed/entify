"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Key, Check, AlertCircle } from 'lucide-react'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"

interface PrimaryKeySelectorProps {
    columns: Array<{ column: string; type: string; null_percentage: number; unique_count: number }>
    currentPrimaryKey?: string
    onPrimaryKeySelected: (columnName: string) => void
}

export function PrimaryKeySelector({
    columns,
    currentPrimaryKey,
    onPrimaryKeySelected
}: PrimaryKeySelectorProps) {
    const [selectedKey, setSelectedKey] = useState<string>(currentPrimaryKey || '')

    // Auto-suggest the best candidate for primary key
    useEffect(() => {
        if (!currentPrimaryKey && columns.length > 0) {
            // Look for columns with "id" in the name
            const idColumns = columns.filter(col =>
                col.column.toLowerCase().includes('id') ||
                col.column.toLowerCase() === 'unique_id'
            )

            // Prefer columns with 100% uniqueness and no nulls
            const perfectCandidates = idColumns.filter(col =>
                col.null_percentage === 0 &&
                col.unique_count > 0
            )

            if (perfectCandidates.length > 0) {
                // Prefer 'id' or 'unique_id'
                const best = perfectCandidates.find(c =>
                    c.column === 'id' || c.column === 'unique_id' || c.column === 'id1'
                ) || perfectCandidates[0]
                setSelectedKey(best.column)
            }
        }
    }, [columns, currentPrimaryKey])

    const handleConfirm = () => {
        if (selectedKey) {
            onPrimaryKeySelected(selectedKey)
        }
    }

    const selectedColumn = columns.find(c => c.column === selectedKey)
    const isValid = selectedColumn && selectedColumn.null_percentage === 0

    return (
        <Card className="border-blue-200 dark:border-blue-800">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Key className="h-5 w-5 text-blue-600" />
                    Select Primary Key
                </CardTitle>
                <CardDescription>
                    Choose the column that uniquely identifies each record. This will be used for entity resolution.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="primary-key">Primary Key Column</Label>
                    <Select value={selectedKey} onValueChange={setSelectedKey}>
                        <SelectTrigger id="primary-key">
                            <SelectValue placeholder="Select a column..." />
                        </SelectTrigger>
                        <SelectContent>
                            {columns.map((col) => {
                                const isGoodCandidate = col.null_percentage === 0 && col.unique_count > 0
                                return (
                                    <SelectItem key={col.column} value={col.column}>
                                        <div className="flex items-center justify-between w-full gap-2">
                                            <span className="font-mono text-sm">{col.column}</span>
                                            <div className="flex items-center gap-1">
                                                <Badge variant="outline" className="text-xs">
                                                    {col.type}
                                                </Badge>
                                                {isGoodCandidate && (
                                                    <Check className="h-3 w-3 text-green-600" />
                                                )}
                                            </div>
                                        </div>
                                    </SelectItem>
                                )
                            })}
                        </SelectContent>
                    </Select>
                </div>

                {selectedColumn && (
                    <Card className={isValid ? "bg-green-50/50 dark:bg-green-950/20" : "bg-orange-50/50 dark:bg-orange-950/20"}>
                        <CardContent className="pt-4 space-y-2">
                            <div className="grid grid-cols-3 gap-4 text-sm">
                                <div>
                                    <div className="text-muted-foreground">Type</div>
                                    <div className="font-medium">{selectedColumn.type}</div>
                                </div>
                                <div>
                                    <div className="text-muted-foreground">Unique Values</div>
                                    <div className="font-medium">{selectedColumn.unique_count.toLocaleString()}</div>
                                </div>
                                <div>
                                    <div className="text-muted-foreground">Null %</div>
                                    <div className={`font-medium ${selectedColumn.null_percentage > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                        {selectedColumn.null_percentage.toFixed(1)}%
                                    </div>
                                </div>
                            </div>
                            {!isValid && (
                                <div className="flex items-start gap-2 text-sm text-orange-600 dark:text-orange-400 mt-3">
                                    <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                    <p>
                                        Warning: This column contains null values. A good primary key should have no nulls and unique values for each record.
                                    </p>
                                </div>
                            )}
                            {isValid && (
                                <div className="flex items-start gap-2 text-sm text-green-600 dark:text-green-400 mt-3">
                                    <Check className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                    <p>
                                        This column is a good candidate for a primary key (no nulls, unique values).
                                    </p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}

                <div className="flex justify-end">
                    <Button
                        onClick={handleConfirm}
                        disabled={!selectedKey}
                        className="bg-blue-600 hover:bg-blue-700"
                    >
                        <Check className="h-4 w-4 mr-2" />
                        Confirm Primary Key
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}
