"use client"

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Info, Lightbulb, ArrowRight } from 'lucide-react'

export function ComparisonExplainer() {
    return (
        <div className="space-y-6">
            {/* What are Comparisons? */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Info className="h-5 w-5" />
                        What are Comparisons?
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                        After <strong>blocking rules</strong> select WHICH record pairs to compare,
                        <strong> comparisons</strong> define HOW to measure similarity between those pairs.
                    </p>

                    <div className="bg-muted/50 p-4 rounded space-y-3">
                        <div className="flex items-center gap-2">
                            <Badge>Step 1</Badge>
                            <span className="text-sm font-medium">Blocking Rules</span>
                        </div>
                        <p className="text-xs text-muted-foreground ml-16">
                            Create candidate pairs: "Compare records where email matches"
                        </p>

                        <div className="flex items-center gap-2 ml-8">
                            <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        </div>

                        <div className="flex items-center gap-2">
                            <Badge>Step 2</Badge>
                            <span className="text-sm font-medium">Comparisons</span>
                        </div>
                        <p className="text-xs text-muted-foreground ml-16">
                            Measure similarity: "How similar are their names? addresses?"
                        </p>

                        <div className="flex items-center gap-2 ml-8">
                            <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        </div>

                        <div className="flex items-center gap-2">
                            <Badge variant="secondary">Result</Badge>
                            <span className="text-sm font-medium">Match Score</span>
                        </div>
                        <p className="text-xs text-muted-foreground ml-16">
                            Overall confidence: 92% → MATCH ✅
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Example */}
            <Card>
                <CardHeader>
                    <CardTitle>Example: Comparing Two Records</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div className="grid grid-cols-3 gap-4 text-sm">
                            <div className="font-medium">Field</div>
                            <div className="font-medium">Method</div>
                            <div className="font-medium">Score</div>
                        </div>

                        <div className="space-y-2">
                            <div className="grid grid-cols-3 gap-4 text-sm p-2 bg-muted/30 rounded">
                                <div className="font-mono">first_name</div>
                                <div className="text-muted-foreground">Jaro-Winkler</div>
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 bg-background rounded-full h-2">
                                        <div className="bg-green-500 h-2 rounded-full" style={{ width: '95%' }} />
                                    </div>
                                    <span className="text-xs">0.95</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-4 text-sm p-2 bg-muted/30 rounded">
                                <div className="font-mono">last_name</div>
                                <div className="text-muted-foreground">Exact Match</div>
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 bg-background rounded-full h-2">
                                        <div className="bg-green-500 h-2 rounded-full" style={{ width: '100%' }} />
                                    </div>
                                    <span className="text-xs">1.00</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-4 text-sm p-2 bg-muted/30 rounded">
                                <div className="font-mono">email</div>
                                <div className="text-muted-foreground">Exact Match</div>
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 bg-background rounded-full h-2">
                                        <div className="bg-green-500 h-2 rounded-full" style={{ width: '100%' }} />
                                    </div>
                                    <span className="text-xs">1.00</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-4 text-sm p-2 bg-muted/30 rounded">
                                <div className="font-mono">address</div>
                                <div className="text-muted-foreground">Jaccard</div>
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 bg-background rounded-full h-2">
                                        <div className="bg-yellow-500 h-2 rounded-full" style={{ width: '82%' }} />
                                    </div>
                                    <span className="text-xs">0.82</span>
                                </div>
                            </div>
                        </div>

                        <div className="mt-4 p-4 bg-green-50 dark:bg-green-950/20 border border-green-500/50 rounded">
                            <div className="flex items-center justify-between">
                                <span className="font-medium">Overall Match Score:</span>
                                <div className="flex items-center gap-2">
                                    <div className="w-32 bg-background rounded-full h-3">
                                        <div className="bg-green-500 h-3 rounded-full" style={{ width: '92%' }} />
                                    </div>
                                    <Badge className="bg-green-500">0.92 (92%)</Badge>
                                </div>
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">
                                ✅ High confidence match - These records likely refer to the same entity
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Best Practices */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Lightbulb className="h-5 w-5" />
                        Best Practices
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <Alert>
                        <AlertDescription className="text-sm">
                            <strong>✅ Do:</strong> Use exact match for unique identifiers (email, ID)
                        </AlertDescription>
                    </Alert>

                    <Alert>
                        <AlertDescription className="text-sm">
                            <strong>✅ Do:</strong> Use fuzzy methods (Levenshtein, Jaro-Winkler) for names
                        </AlertDescription>
                    </Alert>

                    <Alert>
                        <AlertDescription className="text-sm">
                            <strong>✅ Do:</strong> Give higher weights to more reliable fields
                        </AlertDescription>
                    </Alert>

                    <Alert>
                        <AlertDescription className="text-sm">
                            <strong>⚠️ Don't:</strong> Use exact match on fields with typos or variations
                        </AlertDescription>
                    </Alert>

                    <Alert>
                        <AlertDescription className="text-sm">
                            <strong>⚠️ Don't:</strong> Set all weights equally - prioritize important fields
                        </AlertDescription>
                    </Alert>
                </CardContent>
            </Card>
        </div>
    )
}
