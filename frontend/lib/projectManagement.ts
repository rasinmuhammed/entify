import { supabase } from '@/lib/supabase'

// Project Management Functions

export async function renameProject(projectId: string, newName: string) {
    const trimmed = newName.trim()
    if (!trimmed) {
        return { success: false, error: new Error('Project name cannot be empty') }
    }

    const { error } = await supabase
        .from('projects')
        .update({ name: trimmed })
        .eq('id', projectId)

    if (error) {
        return { success: false, error }
    }

    return { success: true }
}

export async function deleteProject(projectId: string) {
    const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', projectId)

    if (error) {
        return { success: false, error }
    }

    return { success: true }
}

export async function handleRenameProject(projectId: string, newName: string, router: any) {
    const result = await renameProject(projectId, newName)
    if (!result.success) {
        throw result.error
    }

    router.refresh()
}

export async function handleDeleteProject(projectId: string, router: any) {
    const result = await deleteProject(projectId)
    if (!result.success) {
        throw result.error
    }

    router.push('/vault')
}

// Configuration Persistence Functions

/**
 * Save blocking rules to database
 */
export async function saveBlockingRules(projectId: string, rules: string[]) {
    try {
        const { error } = await supabase
            .from('projects')
            .update({
                blocking_rules: rules,
                last_updated: new Date().toISOString()
            })
            .eq('id', projectId)

        if (error) throw error
        console.log('Blocking rules saved:', rules.length)
        return { success: true }
    } catch (error) {
        console.error('Error saving blocking rules:', error)
        return { success: false, error }
    }
}

/**
 * Save comparison configuration to database
 */
export async function saveComparisonConfig(projectId: string, config: any[]) {
    try {
        const { error } = await supabase
            .from('projects')
            .update({
                comparisons: config,
                comparison_config: config,
                last_updated: new Date().toISOString()
            })
            .eq('id', projectId)

        if (error) throw error
        console.log('Comparison config saved:', config.length)
        return { success: true }
    } catch (error) {
        console.error('Error saving comparison config:', error)
        return { success: false, error }
    }
}

/**
 * Load project configuration (blocking rules + comparisons)
 */
export async function loadProjectConfig(projectId: string) {
    try {
        const { data, error } = await supabase
            .from('projects')
            .select('blocking_rules, comparisons, comparison_config')
            .eq('id', projectId)
            .single()

        if (error) throw error

        return {
            success: true,
            blockingRules: data?.blocking_rules || [],
            comparisonConfig: data?.comparisons || data?.comparison_config || []
        }
    } catch (error) {
        console.error('Error loading project config:', error)
        return {
            success: false,
            blockingRules: [],
            comparisonConfig: [],
            error
        }
    }
}

/**
 * Auto-save with debouncing to prevent too many saves
 */
let saveTimeout: NodeJS.Timeout | null = null

export function autoSaveBlockingRules(projectId: string, rules: string[], delayMs: number = 1000) {
    if (saveTimeout) clearTimeout(saveTimeout)

    saveTimeout = setTimeout(() => {
        saveBlockingRules(projectId, rules)
    }, delayMs)
}

export function autoSaveComparisonConfig(projectId: string, config: any[], delayMs: number = 1000) {
    if (saveTimeout) clearTimeout(saveTimeout)

    saveTimeout = setTimeout(() => {
        saveComparisonConfig(projectId, config)
    }, delayMs)
}
