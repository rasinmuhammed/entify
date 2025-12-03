import { PhaseStatus, PhaseId } from '@/types/phaseStatus'

export interface PhaseValidationResult {
    canAccess: boolean
    reason?: string
}

/**
 * Validates if a user can access a given phase based on current progress
 */
export function validatePhaseAccess(
    phase: PhaseId,
    phaseStatus: PhaseStatus
): PhaseValidationResult {
    switch (phase) {
        case 'profile':
            // Always accessible - starting point
            return { canAccess: true }

        case 'cleaning':
            // Can access if data has been uploaded
            return {
                canAccess: phaseStatus.profile.complete,
                reason: 'Please upload data in the Data Profile phase first'
            }

        case 'blocking':
            // Can access if data has been uploaded (cleaning is optional)
            return {
                canAccess: phaseStatus.profile.complete,
                reason: 'Please upload data in the Data Profile phase first'
            }

        case 'comparisons':
            // Can access if data has been uploaded
            return {
                canAccess: phaseStatus.profile.complete,
                reason: 'Please upload data in the Data Profile phase first'
            }

        case 'training':
            // Requires data, blocking rules, and comparisons
            if (!phaseStatus.profile.complete) {
                return {
                    canAccess: false,
                    reason: 'Please upload data first'
                }
            }
            if (!phaseStatus.blocking.complete) {
                return {
                    canAccess: false,
                    reason: 'Please configure at least one blocking rule'
                }
            }
            if (!phaseStatus.comparisons.complete) {
                return {
                    canAccess: false,
                    reason: 'Please configure at least one comparison'
                }
            }
            return { canAccess: true }

        case 'laboratory':
            // Requires training to be complete
            return {
                canAccess: phaseStatus.training.complete,
                reason: 'Please complete the Training phase first'
            }

        case 'results':
            // Requires training to be complete (laboratory is optional)
            return {
                canAccess: phaseStatus.training.complete,
                reason: 'Please run matching in the Training or Laboratory phase first'
            }

        default:
            return { canAccess: false, reason: 'Unknown phase' }
    }
}

/**
 * Get the next recommended phase based on current progress
 */
export function getNextPhase(phaseStatus: PhaseStatus): PhaseId | null {
    const phases: PhaseId[] = ['profile', 'cleaning', 'blocking', 'comparisons', 'training', 'laboratory', 'results']

    for (const phase of phases) {
        const validation = validatePhaseAccess(phase, phaseStatus)
        if (validation.canAccess && !phaseStatus[phase].complete) {
            return phase
        }
    }

    return null
}

/**
 * Get a user-friendly message for what needs to be done in a phase
 */
export function getPhaseRequirements(phase: PhaseId): string {
    switch (phase) {
        case 'profile':
            return 'Upload your CSV file to begin'
        case 'cleaning':
            return 'Clean and transform your data (optional)'
        case 'blocking':
            return 'Define at least one blocking rule to reduce comparisons'
        case 'comparisons':
            return 'Configure at least one field comparison'
        case 'training':
            return 'Review the EM training algorithm'
        case 'laboratory':
            return 'Fine-tune parameters (optional)'
        case 'results':
            return 'Run matching to view results'
        default:
            return ''
    }
}
