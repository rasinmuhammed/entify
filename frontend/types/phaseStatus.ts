export interface PhaseStatus {
    profile: PhaseInfo
    cleaning: PhaseInfo
    blocking: PhaseInfo
    comparisons: PhaseInfo
    training: PhaseInfo
    laboratory: PhaseInfo
    results: PhaseInfo
}

export interface PhaseInfo {
    complete: boolean
    canAccess: boolean
    metadata: Record<string, any>
}

export const INITIAL_PHASE_STATUS: PhaseStatus = {
    profile: { complete: false, canAccess: true, metadata: {} },
    cleaning: { complete: false, canAccess: false, metadata: {} },
    blocking: { complete: false, canAccess: false, metadata: {} },
    comparisons: { complete: false, canAccess: false, metadata: {} },
    training: { complete: false, canAccess: false, metadata: {} },
    laboratory: { complete: false, canAccess: false, metadata: {} },
    results: { complete: false, canAccess: false, metadata: {} },
}

export type PhaseId = keyof PhaseStatus
