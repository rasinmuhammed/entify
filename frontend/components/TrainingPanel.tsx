"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
    BrainCircuit,
    Info,
    Settings2,
    TrendingUp,
    Zap,
    BookOpen,
    Lightbulb,
    AlertCircle,
    Database,
    GitCompare
} from "lucide-react"
import { Separator } from "@/components/ui/separator"

interface TrainingPanelProps {
    onTrainingComplete?: (model: any) => void
    globalSettings?: {
        probability_two_random_records_match?: number
    }
}

export function TrainingPanel({ onTrainingComplete, globalSettings }: TrainingPanelProps) {
    const [activeTab, setActiveTab] = useState("overview")

    return (
        <div className="space-y-6">
            {/* Header */}
            <Card className="border-purple-500/50 bg-purple-50/50 dark:bg-purple-950/20">
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <BrainCircuit className="h-6 w-6 text-purple-600" />
                        <div>
                            <CardTitle>Expectation-Maximization (EM) Training</CardTitle>
                            <CardDescription>
                                Understand how Splink learns optimal matching parameters from your data
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
            </Card>

            {/* Main Content Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="overview">
                        <BookOpen className="h-4 w-4 mr-2" />
                        Overview
                    </TabsTrigger>
                    <TabsTrigger value="parameters">
                        <Settings2 className="h-4 w-4 mr-2" />
                        Parameters
                    </TabsTrigger>
                    <TabsTrigger value="tuning">
                        <TrendingUp className="h-4 w-4 mr-2" />
                        Tuning Guide
                    </TabsTrigger>
                    <TabsTrigger value="tips">
                        <Lightbulb className="h-4 w-4 mr-2" />
                        Best Practices
                    </TabsTrigger>
                </TabsList>

                {/* Overview Tab */}
                <TabsContent value="overview" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">What is EM Training?</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                Expectation-Maximization (EM) is an unsupervised learning algorithm that helps Splink
                                automatically learn the best parameters for matching your data without requiring labeled examples.
                            </p>

                            <div className="bg-muted/50 p-4 rounded-lg space-y-3">
                                <h4 className="font-semibold text-sm flex items-center gap-2">
                                    <Zap className="h-4 w-4 text-yellow-600" />
                                    How It Works
                                </h4>
                                <ol className="text-sm space-y-2 list-decimal list-inside text-muted-foreground">
                                    <li><strong>Expectation Step</strong>: Calculate the probability that each pair of records is a match</li>
                                    <li><strong>Maximization Step</strong>: Update the m (match) and u (non-match) parameters to maximize likelihood</li>
                                    <li><strong>Iterate</strong>: Repeat until parameters converge (change less than tolerance threshold)</li>
                                </ol>
                            </div>

                            <Alert>
                                <Info className="h-4 w-4" />
                                <AlertDescription>
                                    <strong>In Entify:</strong> EM training happens automatically when you click "Run Pipeline".
                                    The algorithm converges in 10-20 iterations for most datasets.
                                </AlertDescription>
                            </Alert>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">The EM Process</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {[
                                    {
                                        step: "1. Initial Estimates",
                                        description: "Start with rough guesses for m and u probabilities for each comparison level"
                                    },
                                    {
                                        step: "2. Calculate Match Probabilities",
                                        description: "For each record pair, calculate probability it's a match using Bayes theorem"
                                    },
                                    {
                                        step: "3. Update Parameters",
                                        description: "Re-estimate m and u values by looking at which pairs are likely matches/non-matches"
                                    },
                                    {
                                        step: "4. Check Convergence",
                                        description: "If parameters changed less than tolerance (default: 0.0001), stop. Otherwise, go to step 2"
                                    },
                                    {
                                        step: "5. Final Scoring",
                                        description: "Use learned parameters to calculate final match probabilities for all pairs"
                                    }
                                ].map((item, idx) => (
                                    <div key={idx} className="flex gap-3">
                                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
                                            {idx + 1}
                                        </div>
                                        <div className="flex-1">
                                            <h5 className="font-semibold text-sm">{item.step}</h5>
                                            <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Parameters Tab */}
                <TabsContent value="parameters" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Key Parameters Explained</CardTitle>
                            <CardDescription>Understanding what the algorithm learns</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {/* M Parameters */}
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <Badge className="bg-green-600">m</Badge>
                                    <h4 className="font-semibold">Match Probability (m parameters)</h4>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    Probability that a comparison level agrees <strong>given records are a match</strong>.
                                </p>
                                <div className="bg-muted/50 p-3 rounded text-xs space-y-1">
                                    <p><strong>Example:</strong> For "exact match on email" comparison level:</p>
                                    <p className="text-muted-foreground">
                                        • High m (0.95): If two records are truly the same person, their emails will match 95% of the time
                                    </p>
                                    <p className="text-muted-foreground">
                                        • Low m (0.60): Emails might differ even for same person (typos, multiple addresses)
                                    </p>
                                </div>
                            </div>

                            <Separator />

                            {/* U Parameters */}
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <Badge variant="destructive">u</Badge>
                                    <h4 className="font-semibold">Non-Match Probability (u parameters)</h4>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    Probability that a comparison level agrees <strong>given records are NOT a match</strong>.
                                </p>
                                <div className="bg-muted/50 p-3 rounded text-xs space-y-1">
                                    <p><strong>Example:</strong> For "exact match on email" comparison level:</p>
                                    <p className="text-muted-foreground">
                                        • Low u (0.001): Very unlikely two different people share the same email
                                    </p>
                                    <p className="text-muted-foreground">
                                        • High u (0.20): Common values like "unknown@example.com" match frequently by chance
                                    </p>
                                </div>
                            </div>

                            <Separator />

                            {/* Lambda */}
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <Badge variant="outline">λ</Badge>
                                    <h4 className="font-semibold">Prior Match Probability (lambda)</h4>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    Probability that any two random records in your dataset are a match.
                                </p>
                                <div className="bg-muted/50 p-3 rounded text-xs space-y-1">
                                    <p><strong>Current Setting:</strong> {globalSettings?.probability_two_random_records_match || 0.0001}</p>
                                    <p className="text-muted-foreground">
                                        • Lower value (0.0001): Dataset has few duplicates - typical for clean data
                                    </p>
                                    <p className="text-muted-foreground">
                                        • Higher value (0.01): Dataset has many duplicates - typical for messy data
                                    </p>
                                    <p className="text-yellow-600 dark:text-yellow-400 mt-2">
                                        💡 Adjust this in the "Comparisons" phase under Global Settings
                                    </p>
                                </div>
                            </div>

                            <Alert>
                                <AlertCircle className="h-4 w-4" />
                                <AlertDescription className="text-xs">
                                    <strong>Note:</strong> EM training automatically adjusts m and u parameters. You only need to set
                                    the prior probability (lambda) based on your domain knowledge of how duplicated your data is.
                                </AlertDescription>
                            </Alert>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Tuning Guide Tab */}
                <TabsContent value="tuning" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">When to Adjust Parameters</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-4">
                                {[
                                    {
                                        condition: "Too Many False Positives",
                                        symptom: "Seeing many incorrect matches in results",
                                        solution: "Decrease probability_two_random_records_match (e.g., from 0.0001 to 0.00001)",
                                        reasoning: "Lower prior makes the model more conservative about calling records a match"
                                    },
                                    {
                                        condition: "Too Many False Negatives",
                                        symptom: "Missing obvious matches (separate clusters for same entity)",
                                        solution: "Increase probability_two_random_records_match (e.g., from 0.0001 to 0.001)",
                                        reasoning: "Higher prior makes the model more willing to match records"
                                    },
                                    {
                                        condition: "EM Not Converging",
                                        symptom: "Training takes very long or parameters keep changing",
                                        solution: "Review blocking rules (may be generating too many comparisons) or check data quality",
                                        reasoning: "Poor blocking or very messy data can prevent convergence"
                                    }
                                ].map((item, idx) => (
                                    <Card key={idx} className="border-l-4 border-l-blue-500">
                                        <CardContent className="p-4 space-y-2">
                                            <h5 className="font-semibold text-sm flex items-center gap-2">
                                                <TrendingUp className="h-4 w-4 text-blue-600" />
                                                {item.condition}
                                            </h5>
                                            <div className="text-xs space-y-1">
                                                <p><strong>Symptom:</strong> <span className="text-muted-foreground">{item.symptom}</span></p>
                                                <p><strong>Solution:</strong> <span className="text-foreground">{item.solution}</span></p>
                                                <p><strong>Why:</strong> <span className="text-muted-foreground italic">{item.reasoning}</span></p>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Iteration & Convergence</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm">
                            <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                                <p className="font-semibold">Typical Behavior:</p>
                                <ul className="text-xs space-y-1 list-disc list-inside text-muted-foreground">
                                    <li>Clean data: Converges in 5-10 iterations</li>
                                    <li>Messy data: Converges in 15-25 iterations</li>
                                    <li>Very messy data: May take 30+ iterations or fail to converge</li>
                                </ul>
                            </div>

                            <p className="text-xs text-muted-foreground">
                                <strong>Convergence Tolerance:</strong> EM stops when all parameters change by less than 0.0001 between iterations.
                                This ensures stable, reliable parameter estimates.
                            </p>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Best Practices Tab */}
                <TabsContent value="tips" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Best Practices for EM Training</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {[
                                    {
                                        title: "Start with Good Blocking Rules",
                                        tip: "EM works best when blocking rules reduce comparisons to a manageable number. Use the Blocking Analyzer to verify rules are efficient.",
                                        icon: <Database className="h-4 w-4" />
                                    },
                                    {
                                        title: "Use Entity-Type Appropriate Comparisons",
                                        tip: "Select the right comparison methods for your data type. Exact match for IDs, Levenshtein for names, etc.",
                                        icon: <GitCompare className="h-4 w-4" />
                                    },
                                    {
                                        title: "Clean Your Data First",
                                        tip: "Apply data cleaning before training. Consistent formatting helps EM learn better parameters.",
                                        icon: <Settings2 className="h-4 w-4" />
                                    },
                                    {
                                        title: "Set Realistic Priors",
                                        tip: "If you know ~1 in 1000 record pairs are duplicates, set probability_two_random_records_match to 0.001.",
                                        icon: <TrendingUp className="h-4 w-4" />
                                    },
                                    {
                                        title: "Review Results Iteratively",
                                        tip: "After first run, review clusters. Adjust blocking rules or comparisons, then re-run. EM improves with better configuration.",
                                        icon: <BrainCircuit className="h-4 w-4" />
                                    }
                                ].map((item, idx) => (
                                    <div key={idx} className="flex gap-3 p-3 bg-muted/30 rounded-lg">
                                        <div className="flex-shrink-0 text-primary">
                                            {item.icon}
                                        </div>
                                        <div className="space-y-1">
                                            <h5 className="font-semibold text-sm">{item.title}</h5>
                                            <p className="text-xs text-muted-foreground">{item.tip}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    <Alert>
                        <Lightbulb className="h-4 w-4" />
                        <AlertDescription className="text-sm">
                            <strong>Pro Tip:</strong> Run EM training on a sample of your data first (10-50K records) to quickly test
                            different configurations. Once you find a good setup, run on the full dataset.
                        </AlertDescription>
                    </Alert>
                </TabsContent>
            </Tabs>

            {/* Run Info */}
            <Card className="bg-blue-50/50 dark:bg-blue-950/20 border-blue-500/50">
                <CardContent className="p-4 flex items-start gap-3">
                    <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm space-y-1">
                        <p className="font-semibold">EM Training Runs Automatically</p>
                        <p className="text-muted-foreground text-xs">
                            When you click <strong>"Run Pipeline"</strong>, Splink will:
                        </p>
                        <ol className="text-xs list-decimal list-inside text-muted-foreground space-y-0.5 ml-2">
                            <li>Apply your blocking rules to reduce comparisons</li>
                            <li>Run EM training to learn optimal m/u parameters</li>
                            <li>Calculate match probabilities for all pairs</li>
                            <li>Form clusters of matching records</li>
                            <li>Show results in the Results phase</li>
                        </ol>
                        <p className="text-xs text-muted-foreground pt-2">
                            💡 View training progress in real-time through backend logs when running the pipeline.
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
