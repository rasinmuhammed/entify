"use client"

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Info, Lightbulb, TrendingDown, Zap, CheckCircle2, XCircle } from 'lucide-react'

export function BlockingRulesExplainer() {
    const [selectedExample, setSelectedExample] = useState<'small' | 'large'>('small')

    // Example calculations
    const examples = {
        small: {
            records: 1000,
            totalPairs: 499500,
            withBlocking: 5000,
            reduction: 99
        },
        large: {
            records: 1000000,
            totalPairs: 499999500000,
            withBlocking: 5000000,
            reduction: 99.999
        }
    }

    const currentExample = examples[selectedExample]

    return (
        <div className="space-y-6">
            {/* Header */}
            <Card className="border-blue-500/50 bg-blue-50/50 dark:bg-blue-950/20">
                <CardHeader>
                    <div className="flex items-start gap-3">
                        <Info className="h-6 w-6 text-blue-600 mt-1" />
                        <div>
                            <CardTitle>What are Blocking Rules?</CardTitle>
                            <CardDescription className="mt-2">
                                Blocking rules dramatically reduce the number of record comparisons needed for entity resolution,
                                making it computationally feasible to match large datasets.
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
            </Card>

            {/* The Problem */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <XCircle className="h-5 w-5 text-red-500" />
                        The Problem: Comparison Explosion
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                        Without blocking, we must compare <strong>every record with every other record</strong>.
                        This grows quadratically: <code className="bg-muted px-2 py-1 rounded">n × (n-1) / 2</code>
                    </p>

                    {/* Interactive Example */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">Dataset size:</span>
                            <Button
                                variant={selectedExample === 'small' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setSelectedExample('small')}
                            >
                                1,000 records
                            </Button>
                            <Button
                                variant={selectedExample === 'large' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setSelectedExample('large')}
                            >
                                1,000,000 records
                            </Button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Card className="bg-red-50/50 dark:bg-red-950/20 border-red-500/50">
                                <CardHeader className="pb-3">
                                    <CardDescription>Without Blocking</CardDescription>
                                    <CardTitle className="text-2xl text-red-600">
                                        {currentExample.totalPairs.toLocaleString()}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-xs text-muted-foreground">comparisons required</p>
                                </CardContent>
                            </Card>

                            <Card className="bg-green-50/50 dark:bg-green-950/20 border-green-500/50">
                                <CardHeader className="pb-3">
                                    <CardDescription>With Blocking</CardDescription>
                                    <CardTitle className="text-2xl text-green-600">
                                        {currentExample.withBlocking.toLocaleString()}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-xs text-muted-foreground">
                                        <strong>{currentExample.reduction}%</strong> reduction!
                                    </p>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* The Solution */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                        The Solution: Smart Blocking
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                        Blocking rules create <strong>"blocks"</strong> of potentially matching records.
                        We only compare records <em>within the same block</em>.
                    </p>

                    <Alert>
                        <Lightbulb className="h-4 w-4" />
                        <AlertDescription>
                            <strong>Example:</strong> If blocking on "first 3 characters of last name",
                            we only compare "Smith" with "Smyth" and "Smithson" — not with "Johnson" or "Williams".
                        </AlertDescription>
                    </Alert>

                    <div className="space-y-2">
                        <h4 className="font-medium text-sm">How It Works:</h4>
                        <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                            <li>Define a blocking rule (e.g., "exact match on email")</li>
                            <li>Group records into blocks based on the rule</li>
                            <li>Only compare records within each block</li>
                            <li>Combine results from all blocks</li>
                        </ol>
                    </div>
                </CardContent>
            </Card>

            {/* SQL Format */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Zap className="h-5 w-5 text-yellow-500" />
                        SQL Expression Format
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                        Blocking rules are written as SQL expressions comparing <code className="bg-muted px-1 rounded">l.</code> (left record)
                        with <code className="bg-muted px-1 rounded">r.</code> (right record):
                    </p>

                    <div className="space-y-3">
                        <div className="bg-muted p-3 rounded-lg">
                            <code className="text-sm">l.email = r.email</code>
                            <p className="text-xs text-muted-foreground mt-1">
                                ✅ Exact match on email column
                            </p>
                        </div>

                        <div className="bg-muted p-3 rounded-lg">
                            <code className="text-sm">SUBSTRING(l.name, 1, 3) = SUBSTRING(r.name, 1, 3)</code>
                            <p className="text-xs text-muted-foreground mt-1">
                                ✅ Match on first 3 characters of name
                            </p>
                        </div>

                        <div className="bg-muted p-3 rounded-lg">
                            <code className="text-sm">l.first_name = r.first_name AND l.last_name = r.last_name</code>
                            <p className="text-xs text-muted-foreground mt-1">
                                ✅ Compound rule: both names must match
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Best Practices */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <TrendingDown className="h-5 w-5 text-purple-500" />
                        Best Practices
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <Tabs defaultValue="dos" className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="dos">✅ Do</TabsTrigger>
                            <TabsTrigger value="donts">❌ Don't</TabsTrigger>
                        </TabsList>
                        <TabsContent value="dos" className="space-y-2 mt-4">
                            <div className="flex items-start gap-2">
                                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">1</Badge>
                                <p className="text-sm">Use <strong>multiple rules</strong> (OR logic) to increase recall</p>
                            </div>
                            <div className="flex items-start gap-2">
                                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">2</Badge>
                                <p className="text-sm">Start with <strong>high-selectivity</strong> rules (email, ID)</p>
                            </div>
                            <div className="flex items-start gap-2">
                                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">3</Badge>
                                <p className="text-sm">Add <strong>fuzzy rules</strong> to catch variations</p>
                            </div>
                            <div className="flex items-start gap-2">
                                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">4</Badge>
                                <p className="text-sm"><strong>Test with sample data</strong> before full run</p>
                            </div>
                            <div className="flex items-start gap-2">
                                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">5</Badge>
                                <p className="text-sm">Monitor <strong>pair counts</strong> to ensure reasonable blocking</p>
                            </div>
                        </TabsContent>
                        <TabsContent value="donts" className="space-y-2 mt-4">
                            <div className="flex items-start gap-2">
                                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">1</Badge>
                                <p className="text-sm">Use only <strong>one rule</strong> (you'll miss matches)</p>
                            </div>
                            <div className="flex items-start gap-2">
                                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">2</Badge>
                                <p className="text-sm">Block on <strong>low-selectivity</strong> fields alone (gender, state)</p>
                            </div>
                            <div className="flex items-start gap-2">
                                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">3</Badge>
                                <p className="text-sm">Make rules <strong>too strict</strong> (exact match only)</p>
                            </div>
                            <div className="flex items-start gap-2">
                                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">4</Badge>
                                <p className="text-sm">Ignore <strong>data quality</strong> (standardize first!)</p>
                            </div>
                            <div className="flex items-start gap-2">
                                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">5</Badge>
                                <p className="text-sm">Skip <strong>testing</strong> (always validate your rules)</p>
                            </div>
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>

            {/* Key Concepts */}
            <Card>
                <CardHeader>
                    <CardTitle>Key Concepts</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <h4 className="font-medium text-sm">Precision vs Recall</h4>
                            <p className="text-xs text-muted-foreground">
                                <strong>Precision:</strong> % of matched pairs that are true matches<br />
                                <strong>Recall:</strong> % of true matches that were found<br />
                                Blocking affects recall — too strict = missed matches
                            </p>
                        </div>
                        <div className="space-y-2">
                            <h4 className="font-medium text-sm">Selectivity</h4>
                            <p className="text-xs text-muted-foreground">
                                <strong>High:</strong> Few records per block (email, ID)<br />
                                <strong>Medium:</strong> Moderate blocks (name prefix)<br />
                                <strong>Low:</strong> Large blocks (ZIP code, gender)
                            </p>
                        </div>
                        <div className="space-y-2">
                            <h4 className="font-medium text-sm">Deterministic Rules</h4>
                            <p className="text-xs text-muted-foreground">
                                Rules that guarantee a match (e.g., exact ID match).
                                Can be used before probabilistic matching for efficiency.
                            </p>
                        </div>
                        <div className="space-y-2">
                            <h4 className="font-medium text-sm">OR Logic</h4>
                            <p className="text-xs text-muted-foreground">
                                Multiple blocking rules are combined with OR.
                                A pair is compared if it matches ANY rule.
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
