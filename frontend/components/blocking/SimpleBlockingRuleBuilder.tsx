"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Mail, User, Calendar, MapPin, Hash, Type, Zap, Info } from 'lucide-react'

interface ColumnRule {
    column: string
    enabled: boolean
    matchType: string
    threshold?: number
    sqlPreview: string
}

interface SimpleBlockingRuleBuilderProps {
    columns: string[]
    onRulesChange: (rules: string[]) => void
    initialRules?: string[]
}

function detectColumnType(columnName: string): 'email' | 'name' | 'date' | 'location' | 'number' | 'text' {
    const lower = columnName.toLowerCase()
    if (lower.includes('email') || lower.includes('mail')) return 'email'
    if (lower.includes('name') || lower.includes('first') || lower.includes('last')) return 'name'
    if (lower.includes('date') || lower.includes('dob') || lower.includes('birth')) return 'date'
    if (lower.includes('zip') || lower.includes('city') || lower.includes('state') || lower.includes('address')) return 'location'
    if (lower.includes('id') || lower.includes('number') || lower.includes('phone')) return 'number'
    return 'text'
}

/**
 * Check if a column is likely an ID column (should NOT be used for blocking)
 */
function isIdColumn(columnName: string): boolean {
    const lower = columnName.toLowerCase()
    // Match common ID patterns
    const idPatterns = [
        /^id$/,           // exact "id"
        /^.*_id$/,        // ends with _id (user_id, customer_id)
        /^id_/,           // starts with id_ (id_num, id_code)
        /^.*id$/,         // ends with id (userid, customerid)
        /^pk$/,           // primary key
        /^key$/,          // key
        /^unique_id$/,    // unique_id
        /^guid$/,         // guid
        /^uuid$/,         // uuid
    ]
    return idPatterns.some(pattern => pattern.test(lower))
}

function getColumnIcon(type: string) {
    switch (type) {
        case 'email': return <Mail className="h-4 w-4" />
        case 'name': return <User className="h-4 w-4" />
        case 'date': return <Calendar className="h-4 w-4" />
        case 'location': return <MapPin className="h-4 w-4" />
        case 'number': return <Hash className="h-4 w-4" />
        default: return <Type className="h-4 w-4" />
    }
}

function getMatchTypes(columnType: string): Array<{ value: string; label: string; description: string; hasThreshold?: boolean }> {
    const common = [
        { value: 'exact', label: 'Exact Match', description: 'Values must be identical' },
        { value: 'levenshtein', label: 'Similar (Levenshtein)', description: 'Fuzzy match with edit distance', hasThreshold: true }
    ]

    switch (columnType) {
        case 'email':
            return [...common, { value: 'domain', label: 'Same Domain', description: 'Match @example.com part' }]
        case 'name':
            return [
                ...common,
                { value: 'first2', label: 'First 2 Characters', description: 'Match first 2 chars' },
                { value: 'first3', label: 'First 3 Characters', description: 'Match first 3 chars' },
                { value: 'first4', label: 'First 4 Characters', description: 'Match first 4 chars' },
                { value: 'soundex', label: 'Sounds Like (Soundex)', description: 'Phonetic matching' },
                { value: 'substring', label: 'Contains Substring', description: 'One contains the other' }
            ]
        case 'date':
            return [
                ...common,
                { value: 'year', label: 'Same Year', description: 'Match year only' },
                { value: 'month', label: 'Same Month & Year', description: 'Match month and year' }
            ]
        case 'location':
            return [
                ...common,
                { value: 'prefix2', label: 'First 2 Digits/Chars', description: 'Match prefix (ZIP: 90xxx)' },
                { value: 'prefix3', label: 'First 3 Digits/Chars', description: 'Match prefix (ZIP: 902xx)' },
                { value: 'prefix4', label: 'First 4 Digits/Chars', description: 'Match prefix (ZIP: 9021x)' }
            ]
        case 'number':
            return [...common, { value: 'substring', label: 'Contains Substring', description: 'One contains the other' }]
        default:
            return [
                ...common,
                { value: 'first3', label: 'First 3 Characters', description: 'Match prefix' },
                { value: 'substring', label: 'Contains Substring', description: 'One contains the other' }
            ]
    }
}

function generateSQL(column: string, matchType: string, columnType: string, threshold: number = 2): string {
    switch (matchType) {
        case 'exact': return `l.${column} = r.${column}`
        case 'levenshtein': return `levenshtein(l.${column}, r.${column}) <= ${threshold}`
        case 'domain': return `SUBSTRING(l.${column}, POSITION('@' IN l.${column})) = SUBSTRING(r.${column}, POSITION('@' IN r.${column}))`
        case 'first2': return `SUBSTRING(l.${column}, 1, 2) = SUBSTRING(r.${column}, 1, 2)`
        case 'first3': return `SUBSTRING(l.${column}, 1, 3) = SUBSTRING(r.${column}, 1, 3)`
        case 'first4': return `SUBSTRING(l.${column}, 1, 4) = SUBSTRING(r.${column}, 1, 4)`
        case 'prefix2': return `SUBSTRING(l.${column}, 1, 2) = SUBSTRING(r.${column}, 1, 2)`
        case 'prefix3': return `SUBSTRING(l.${column}, 1, 3) = SUBSTRING(r.${column}, 1, 3)`
        case 'prefix4': return `SUBSTRING(l.${column}, 1, 4) = SUBSTRING(r.${column}, 1, 4)`
        case 'soundex': return `SOUNDEX(l.${column}) = SOUNDEX(r.${column})`
        case 'substring': return `(l.${column} LIKE '%' || r.${column} || '%' OR r.${column} LIKE '%' || l.${column} || '%')`
        case 'year': return `EXTRACT(YEAR FROM l.${column}) = EXTRACT(YEAR FROM r.${column})`
        case 'month': return `EXTRACT(YEAR FROM l.${column}) = EXTRACT(YEAR FROM r.${column}) AND EXTRACT(MONTH FROM l.${column}) = EXTRACT(MONTH FROM r.${column})`
        default: return `l.${column} = r.${column}`
    }
}

export function SimpleBlockingRuleBuilder({ columns, onRulesChange, initialRules = [] }: SimpleBlockingRuleBuilderProps) {
    const [columnRules, setColumnRules] = useState<ColumnRule[]>([])

    useEffect(() => {
        if (columns.length === 0) return
        if (columnRules.length > 0) return

        const rules = columns.map(col => {
            const type = detectColumnType(col)
            const matchTypes = getMatchTypes(type)
            const defaultMatch = type === 'email' || type === 'number' ? 'exact' : matchTypes[0].value
            return {
                column: col,
                enabled: false,
                matchType: defaultMatch,
                threshold: 2,
                sqlPreview: generateSQL(col, defaultMatch, type, 2)
            }
        })
        setColumnRules(rules)
    }, [columns.length])

    useEffect(() => {
        const activeRules = columnRules.filter(r => r.enabled).map(r => r.sqlPreview)
        onRulesChange(activeRules)
    }, [columnRules])

    const handleToggle = (column: string, enabled: boolean) => {
        setColumnRules(prev => prev.map(r => r.column === column ? { ...r, enabled } : r))
    }

    const handleMatchTypeChange = (column: string, matchType: string) => {
        setColumnRules(prev => prev.map(r => {
            if (r.column === column) {
                const type = detectColumnType(column)
                return { ...r, matchType, sqlPreview: generateSQL(column, matchType, type, r.threshold || 2) }
            }
            return r
        }))
    }

    const handleThresholdChange = (column: string, threshold: number) => {
        setColumnRules(prev => prev.map(r => {
            if (r.column === column) {
                const type = detectColumnType(column)
                return { ...r, threshold, sqlPreview: generateSQL(column, r.matchType, type, threshold) }
            }
            return r
        }))
    }

    const enabledCount = columnRules.filter(r => r.enabled).length

    return (
        <div className="space-y-6">
            <Card className="border-purple-500/50 bg-purple-50/50 dark:bg-purple-950/20">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <Zap className="h-5 w-5" />
                                Quick Blocking Setup
                            </CardTitle>
                            <CardDescription>
                                Select columns and match types - enable multiple rules for better matching
                            </CardDescription>
                        </div>
                        <Badge variant={enabledCount > 0 ? 'default' : 'secondary'}>
                            {enabledCount} {enabledCount === 1 ? 'rule' : 'rules'} active
                        </Badge>
                    </div>
                </CardHeader>
            </Card>

            {enabledCount === 0 && (
                <Card className="border-blue-500/50 bg-blue-50/50 dark:bg-blue-950/20">
                    <CardContent className="py-4">
                        <div className="flex items-start gap-3">
                            <Info className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                            <div className="space-y-1">
                                <p className="text-sm font-medium">Enable multiple blocking rules</p>
                                <p className="text-xs text-muted-foreground">
                                    Toggle ON any columns you want to use for blocking. You can enable multiple columns -
                                    pairs will be compared if they match ANY of your rules.
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {columnRules.map((rule) => {
                    const type = detectColumnType(rule.column)
                    const matchTypes = getMatchTypes(type)
                    const selectedMatch = matchTypes.find(m => m.value === rule.matchType)
                    const isId = isIdColumn(rule.column)

                    return (
                        <Card key={rule.column} className={`transition-all ${rule.enabled ? 'border-primary shadow-md' : 'border-muted'} ${isId ? 'border-yellow-500/50 bg-yellow-50/10' : ''}`}>
                            <CardHeader className="pb-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        {getColumnIcon(type)}
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <CardTitle className="text-sm font-mono">{rule.column}</CardTitle>
                                                {isId && (
                                                    <Badge variant="outline" className="text-xs bg-yellow-500/10 border-yellow-500/50 text-yellow-700 dark:text-yellow-400">
                                                        ⚠️ ID Column
                                                    </Badge>
                                                )}
                                            </div>
                                            <CardDescription className="text-xs">
                                                {type.charAt(0).toUpperCase() + type.slice(1)} column
                                                {isId && <span className="text-yellow-600 ml-1">(Not recommended for blocking)</span>}
                                            </CardDescription>
                                        </div>
                                    </div>
                                    <Switch checked={rule.enabled} onCheckedChange={(checked) => handleToggle(rule.column, checked)} />
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-muted-foreground">Match Type</label>
                                    <Select value={rule.matchType} onValueChange={(value) => handleMatchTypeChange(rule.column, value)} disabled={!rule.enabled}>
                                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {matchTypes.map(method => (
                                                <SelectItem key={method.value} value={method.value}>
                                                    <div className="flex flex-col">
                                                        <span className="font-medium">{method.label}</span>
                                                        <span className="text-xs text-muted-foreground">{method.description}</span>
                                                    </div>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {rule.enabled && selectedMatch?.hasThreshold && (
                                    <div className="space-y-2">
                                        <label className="text-xs font-medium text-muted-foreground">Max Edit Distance</label>
                                        <Input type="number" min={1} max={10} value={rule.threshold || 2}
                                            onChange={(e) => handleThresholdChange(rule.column, parseInt(e.target.value) || 2)} className="h-9" />
                                        <p className="text-xs text-muted-foreground">Lower = stricter (1-2 recommended), Higher = more lenient</p>
                                    </div>
                                )}

                                {rule.enabled && (
                                    <div className="space-y-1">
                                        <label className="text-xs font-medium text-muted-foreground">Generated SQL</label>
                                        <div className="bg-muted/50 p-2 rounded font-mono text-xs break-all">{rule.sqlPreview}</div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )
                })}
            </div>

            {enabledCount > 0 && (
                <Card className="bg-green-50/50 dark:bg-green-950/20 border-green-500/50">
                    <CardContent className="py-4">
                        <div className="space-y-2">
                            <p className="text-sm font-medium">✅ {enabledCount} blocking {enabledCount === 1 ? 'rule' : 'rules'} configured</p>
                            <p className="text-xs text-muted-foreground">
                                Record pairs will be compared if they match ANY of these rules (OR logic).
                                This creates {enabledCount === 1 ? 'one candidate set' : `${enabledCount} candidate sets`} for comparison.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
