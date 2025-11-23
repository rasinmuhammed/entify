import { supabase } from '@/lib/supabase'

// Project Management Functions

export async function handleRenameProject(projectId: string, newName: string, router: any) {
    const trimmed = newName.trim()
    if (!trimmed) {
        alert('Project name cannot be empty')
        return
    }

    try {
        const { error } = await supabase
            .from('projects')
            .update({ name: trimmed })
            .eq('id', projectId)

        if (error) throw error

        alert('✅ Project renamed successfully!')
        // Refresh page to show new name
        router.refresh()
    } catch (error) {
        console.error('Error renaming project:', error)
        alert('Failed to rename project')
    }
}

export async function handleDeleteProject(projectId: string, router: any) {
    if (!confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
        return
    }

    try {
        // Delete the project
        const { error } = await supabase
            .from('projects')
            .delete()
            .eq('id', projectId)

        if (error) throw error

        alert('✅ Project deleted successfully!')
        router.push('/vault')
    } catch (error) {
        console.error('Error deleting project:', error)
        alert('Failed to delete project')
    }
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
        console.log('✅ Blocking rules saved:', rules.length)
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
                comparison_config: config,
                last_updated: new Date().toISOString()
            })
            .eq('id', projectId)

        if (error) throw error
        console.log('✅ Comparison config saved:', config.length)
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
            .select('blocking_rules, comparison_config')
            .eq('id', projectId)
            .single()

        if (error) throw error

        return {
            success: true,
            blockingRules: data?.blocking_rules || [],
            comparisonConfig: data?.comparison_config || []
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
