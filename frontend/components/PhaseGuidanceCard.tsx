"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowRight, CheckCircle2, Lightbulb, AlertCircle } from 'lucide-react'
import { PhaseStatus, PhaseId } from '@/types/phaseStatus'
import { getPhaseRequirements } from '@/lib/phaseValidation'

interface PhaseGuidanceCardProps {
    currentPhase: PhaseId
    phaseStatus: PhaseStatus
    onNavigate?: (phase: PhaseId) => void
}

export function PhaseGuidanceCard({
    currentPhase,
    phaseStatus,
    onNavigate
}: PhaseGuidanceCardProps) {
    const status = phaseStatus[currentPhase]
    const requirement = getPhaseRequirements(currentPhase)

    // Determine next phase
    const getNextPhase = (): PhaseId | null => {
        const phases: PhaseId[] = ['profile', 'cleaning', 'blocking', 'comparisons', 'training', 'laboratory', 'results']
        const currentIndex = phases.indexOf(currentPhase)

        // Skip cleaning if going to blocking (it's optional)
        if (currentPhase === 'profile') {
            return 'blocking'
        }

        if (currentIndex < phases.length - 1) {
            return phases[currentIndex + 1]
        }
        return null
    }

    const nextPhase = getNextPhase()
    const isComplete = status?.complete || false

    // Get completion status message
    const getStatusMessage = () => {
        if (isComplete) {
            return {
                title: "Phase Complete!",
                description: nextPhase
                    ? `Great work! You can now proceed to ${getPhaseLabel(nextPhase)}.`
                    : "Congratulations! You've completed the entire pipeline.",
                icon: CheckCircle2,
                variant: "success" as const
            }
        }

        return {
            title: "What's Next?",
            description: requirement,
            icon: Lightbulb,
            variant: "default" as const
        }
    }

    const statusInfo = getStatusMessage()
    const Icon = statusInfo.icon

    return (
        <Card className={`
      ${isComplete ? 'border-green-500/50 bg-green-50/50 dark:bg-green-950/20' : 'border-blue-500/50 bg-blue-50/50 dark:bg-blue-950/20'}
    `}>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <Icon className={`w-5 h-5 ${isComplete ? 'text-green-600' : 'text-blue-600'}`} />
                    {statusInfo.title}
                </CardTitle>
                <CardDescription className="text-sm">
                    {statusInfo.description}
                </CardDescription>
            </CardHeader>

            {!isComplete && (
                <CardContent>
                    <div className="space-y-3">
                        {/* Phase-specific requirements */}
                        {getPhaseSpecificGuidance(currentPhase, phaseStatus)}

                        {/* Next phase preview */}
                        {nextPhase && (
                            <div className="flex items-center justify-between pt-3 border-t">
                                <div className="text-sm text-muted-foreground">
                                    Next: <span className="font-medium text-foreground">{getPhaseLabel(nextPhase)}</span>
                                </div>
                                {onNavigate && phaseStatus[nextPhase]?.canAccess && (
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => onNavigate(nextPhase)}
                                    >
                                        Go <ArrowRight className="w-3 h-3 ml-1" />
                                    </Button>
                                )}
                            </div>
                        )}
                    </div>
                </CardContent>
            )}

            {isComplete && nextPhase && onNavigate && (
                <CardContent>
                    <Button
                        className="w-full"
                        onClick={() => onNavigate(nextPhase)}
                        disabled={!phaseStatus[nextPhase]?.canAccess}
                    >
                        Continue to {getPhaseLabel(nextPhase)} <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                </CardContent>
            )}
        </Card>
    )
}

function getPhaseLabel(phase: PhaseId): string {
    const labels: Record<PhaseId, string> = {
        profile: 'Data Profile',
        cleaning: 'Data Cleaning',
        blocking: 'Blocking Rules',
        comparisons: 'Comparisons',
        training: 'Training',
        laboratory: 'Laboratory',
        results: 'Results'
    }
    return labels[phase]
}

function getPhaseSpecificGuidance(phase: PhaseId, phaseStatus: PhaseStatus) {
    switch (phase) {
        case 'profile':
            return (
                <div className="space-y-2">
                    <div className="flex items-start gap-2 text-sm">
                        <AlertCircle className="w-4 h-4 mt-0.5 text-blue-600 flex-shrink-0" />
                        <div>
                            <p className="font-medium">Upload your CSV file to begin</p>
                            <p className="text-muted-foreground text-xs">Your data will be processed in the browser</p>
                        </div>
                    </div>
                </div>
            )

        case 'cleaning':
            return (
                <div className="space-y-2">
                    <Badge variant="secondary" className="text-xs">Optional</Badge>
                    <p className="text-sm text-muted-foreground">
                        Clean and transform your data, or skip to blocking rules if your data is ready.
                    </p>
                </div>
            )

        case 'blocking':
            return (
                <div className="space-y-2">
                    <div className="flex items-start gap-2 text-sm">
                        <AlertCircle className="w-4 h-4 mt-0.5 text-blue-600 flex-shrink-0" />
                        <div>
                            <p className="font-medium">Add at least one blocking rule</p>
                            <p className="text-muted-foreground text-xs">
                                Current rules: {phaseStatus.blocking.metadata?.rulesCount || 0}
                            </p>
                        </div>
                    </div>
                </div>
            )

        case 'comparisons':
            return (
                <div className="space-y-2">
                    <div className="flex items-start gap-2 text-sm">
                        <CheckCircle2 className="w-4 h-4 mt-0.5 text-blue-600 flex-shrink-0" />
                        <div>
                            <p className="font-medium">Configure at least one field comparison</p>
                            <p className="text-muted-foreground text-xs">
                                Current comparisons: {phaseStatus.comparisons.metadata?.comparisonsCount || 0}
                            </p>
                        </div>
                    </div>
                </div>
            )

        case 'training':
            return (
                <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                        Review how the EM algorithm learns from your data, then proceed to the Laboratory or run matching.
                    </p>
                </div>
            )

        case 'laboratory':
            return (
                <div className="space-y-2">
                    <Badge variant="secondary" className="text-xs">Advanced</Badge>
                    <p className="text-sm text-muted-foreground">
                        Fine-tune parameters or skip directly to results.
                    </p>
                </div>
            )

        case 'results':
            return (
                <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                        View and analyze your matching results, explore clusters, and download exports.
                    </p>
                </div>
            )

        default:
            return null
    }
}
