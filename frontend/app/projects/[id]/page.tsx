"use client"

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useWasm } from '@/lib/wasm/WasmContext'
import { useDatasetStore } from '@/lib/store/useDatasetStore'
import { createClient } from '@/utils/supabase/client'
import { Panel, PanelContent, PanelHeader, PanelTitle } from "@/components/ui/panel"
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { motion, AnimatePresence } from "framer-motion"
import {
    LayoutDashboard,
    Settings2,
    GitCompare,
    BrainCircuit,
    TableProperties,
    ArrowRight,
    Loader2,
    CheckCircle2,
    Database,
    ChevronRight,
    Play,
    Save,
    MoreVertical,
    Trash2,
    Edit2,
    FlaskConical,
    Lock,
    AlertCircle
} from "lucide-react"
import { PhaseStatus, INITIAL_PHASE_STATUS, PhaseId, PhaseInfo } from '@/types/phaseStatus'
import { validatePhaseAccess } from '@/lib/phaseValidation'
import { handleRenameProject, handleDeleteProject } from "@/lib/projectManagement"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { DataTable } from "@/components/DataTable"
import { ColumnDef } from "@tanstack/react-table"
import { BlockingRuleBuilder } from "@/components/BlockingRuleBuilder"
import { ComparisonBuilder } from "@/components/ComparisonBuilder"
import { TrainingPanel } from "@/components/TrainingPanel"
import { ClusterVisualization } from '@/components/matching/ClusterVisualization'
import { MatchingInsightsPanel } from '@/components/matching/MatchingInsightsPanel'
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { DataManager } from "@/components/workspace/DataManager"
import { DataCleaningStudio } from "@/components/workspace/DataCleaningStudio"
import { PrimaryKeySelector } from "@/components/workspace/PrimaryKeySelector"
import { ModelEvaluationDashboard } from "@/components/charts/ModelEvaluationDashboard"
import { LaboratoryDashboard } from "@/components/laboratory/LaboratoryDashboard"
import { PhaseGuidanceCard } from "@/components/PhaseGuidanceCard"
import { SmartBlockingPanel, SemanticSuggestion } from "@/components/blocking/SmartBlockingPanel"
import { Input } from "@/components/ui/input"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { buildApiUrl, fetchApiText } from "@/lib/api/client"
import { loadProjectBundle, saveDatasetPrimaryKey } from "@/lib/projects/persistence"
import { useProjectAutosave } from "@/lib/projects/useProjectAutosave"


const PHASES = [
    { id: 'profile', label: 'Data Profile', icon: LayoutDashboard },
    { id: 'cleaning', label: 'Data Cleaning', icon: Settings2 },
    { id: 'blocking', label: 'Blocking Rules', icon: Database },
    { id: 'comparisons', label: 'Comparisons', icon: GitCompare },
    { id: 'training', label: 'Training', icon: BrainCircuit },
    { id: 'laboratory', label: 'Laboratory', icon: FlaskConical },
    { id: 'results', label: 'Results', icon: TableProperties },
]

export default function ProjectPage() {
    const params = useParams()
    const router = useRouter()
    const { duckDB, isReady } = useWasm()
    const { activeProject, setActiveProject, activeDataset, setActiveDataset } = useDatasetStore()
    const supabase = createClient()
    const [isDeleting, setIsDeleting] = useState(false)

    const [loading, setLoading] = useState(true)
    const [activePhase, setActivePhase] = useState('profile')
    const [clusterSizeFilter, setClusterSizeFilter] = useState<{ min: number, max: number } | null>(null)

    // Phase progress tracking
    const [phaseStatus, setPhaseStatus] = useState<PhaseStatus>(INITIAL_PHASE_STATUS)

    // Project State (persisted to database)
    const [blockingRules, setBlockingRules] = useState<string[]>([])
    const [comparisons, setComparisons] = useState<any[]>([])
    const [threshold, setThreshold] = useState(0.5)
    const [modelTrained, setModelTrained] = useState(false)
    const [results, setResults] = useState<any[]>([])
    const [isProcessing, setIsProcessing] = useState(false)
    const [dataColumns, setDataColumns] = useState<string[]>([])
    const [primaryKey, setPrimaryKey] = useState<string | null>(activeDataset?.primary_key_column || null)
    const [isPrimaryKeyConfirmed, setIsPrimaryKeyConfirmed] = useState(false)
    const [semanticBlocking, setSemanticBlocking] = useState<Array<{ column: string, run_id: string, rule: string }>>([])
    const [globalSettings, setGlobalSettings] = useState({
        probability_two_random_records_match: 0.0001
    })
    const [pageError, setPageError] = useState<string | null>(null)
    const [renameDialogOpen, setRenameDialogOpen] = useState(false)
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
    const [renameValue, setRenameValue] = useState("")

    // Helper to update phase status
    const updatePhaseStatus = (phase: PhaseId, updates: Partial<PhaseInfo>) => {
        setPhaseStatus(prev => ({
            ...prev,
            [phase]: { ...prev[phase], ...updates }
        }))
    }

    const baseProjectConfiguration = useMemo(
        () => (activeProject?.configuration && typeof activeProject.configuration === "object"
            ? activeProject.configuration
            : {}),
        [activeProject?.configuration]
    )

    useProjectAutosave({
        supabase,
        projectId: activeProject?.id,
        blockingRules,
        comparisons,
        globalSettings,
        threshold,
        semanticBlocking,
        activePhase,
        baseConfiguration: baseProjectConfiguration,
        onWarning: (message) => {
            console.warn(message)
            setPageError(message)
        }
    })

    // Track phase completion: Profile phase
    useEffect(() => {
        if (activeDataset) {
            updatePhaseStatus('profile', {
                complete: true,
                metadata: { datasetId: activeDataset.id, tableName: activeDataset.table_name }
            })
            // Enable next phases
            updatePhaseStatus('cleaning', { canAccess: true })
            updatePhaseStatus('blocking', { canAccess: true })
            updatePhaseStatus('comparisons', { canAccess: true })
        }
    }, [activeDataset])

    // Track phase completion: Blocking phase
    useEffect(() => {
        const isComplete = blockingRules.length > 0
        updatePhaseStatus('blocking', {
            complete: isComplete,
            metadata: { rulesCount: blockingRules.length }
        })
        // Update training access if prerequisites met
        if (isComplete && comparisons.length > 0) {
            updatePhaseStatus('training', { canAccess: true })
        }
    }, [blockingRules, comparisons])

    // Track phase completion: Comparisons phase
    useEffect(() => {
        const isComplete = comparisons.length > 0
        updatePhaseStatus('comparisons', {
            complete: isComplete,
            metadata: { comparisonsCount: comparisons.length }
        })
        // Update training access if prerequisites met
        if (isComplete && blockingRules.length > 0) {
            updatePhaseStatus('training', { canAccess: true })
        }
    }, [comparisons, blockingRules])

    // Track phase completion: Training phase
    useEffect(() => {
        if (modelTrained) {
            updatePhaseStatus('training', {
                complete: true,
                metadata: { timestamp: new Date().toISOString() }
            })
            // Enable laboratory and results
            updatePhaseStatus('laboratory', { canAccess: true })
            updatePhaseStatus('results', { canAccess: true })
        }
    }, [modelTrained])

    // Track phase completion: Results phase
    useEffect(() => {
        if (results.length > 0) {
            updatePhaseStatus('results', {
                complete: true,
                metadata: { resultsCount: results.length }
            })
        }
    }, [results])

    // Save primary key to database
    const savePrimaryKey = async (columnName: string) => {
        if (!activeDataset?.id) return

        try {
            const { error } = await saveDatasetPrimaryKey(supabase, activeDataset.id, columnName)

            if (error) {
                console.warn('Database save failed:', error)
                setPageError(`Primary key could not be persisted to Supabase yet: ${error.message}`)

                const storageKey = `primary_key_${activeDataset.id}`
                localStorage.setItem(storageKey, columnName)
            } else {
                console.log('✅ Primary key saved to database:', columnName)
                setPageError(null)
            }

            // Update local state regardless of database save
            setPrimaryKey(columnName)
            setIsPrimaryKeyConfirmed(true)
            setActiveDataset({
                ...activeDataset,
                primary_key_column: columnName
            })

        } catch (error) {
            console.error('Error saving primary key:', error)

            // Even if error, store locally and continue
            if (activeDataset?.id) {
                const storageKey = `primary_key_${activeDataset.id}`
                localStorage.setItem(storageKey, columnName)

                setPrimaryKey(columnName)
                setIsPrimaryKeyConfirmed(true)
                setActiveDataset({
                    ...activeDataset,
                    primary_key_column: columnName
                })

                console.log('✅ Primary key stored locally:', columnName)
            }
        }
    }

    useEffect(() => {
        if (params.id) {
            loadProject(params.id as string)
        }
    }, [params.id])

    // Load primary key from database or localStorage
    useEffect(() => {
        if (activeDataset?.id) {
            // Try database first
            if (activeDataset.primary_key_column) {
                setPrimaryKey(activeDataset.primary_key_column)
                setIsPrimaryKeyConfirmed(true)
                console.log('✅ Loaded primary key from database:', activeDataset.primary_key_column)
            } else {
                // Fallback to localStorage
                const storageKey = `primary_key_${activeDataset.id}`
                const storedKey = localStorage.getItem(storageKey)
                if (storedKey) {
                    setPrimaryKey(storedKey)
                    setIsPrimaryKeyConfirmed(true)
                    console.log('✅ Loaded primary key from localStorage:', storedKey)
                }
            }
        }
    }, [activeDataset?.id, activeDataset?.primary_key_column])

    // Reload data when DuckDB becomes ready
    useEffect(() => {
        if (duckDB && isReady && activeDataset) {
            // Prefer cleaned file if available, otherwise use original
            const filePath = activeDataset.cleaned_file_path || activeDataset.file_path

            if (filePath) {
                const dataset = {
                    name: activeDataset.name,
                    file_path: filePath
                }
                loadDataIntoDuckDB(dataset)
            }
        }
    }, [duckDB, isReady, activeDataset?.file_path, activeDataset?.cleaned_file_path])

    const loadProject = async (id: string) => {
        try {
            console.log('Loading project:', id)
            setPageError(null)

            const bundle = await loadProjectBundle(supabase, id)
            const { project, dataset } = bundle

            console.log('✅ Project loaded:', project.name)
            setActiveProject(project)
            setRenameValue(project.name)
            setBlockingRules(bundle.blockingRules)
            setComparisons(bundle.comparisons)
            setGlobalSettings(bundle.globalSettings)
            setSemanticBlocking(bundle.semanticBlocking)
            setThreshold(bundle.threshold)
            setActivePhase(bundle.activePhase)

            setActiveDataset(dataset)

            if (!dataset.file_path) {
                console.error('❌ Dataset missing file_path:', dataset)
                setPageError('This dataset is missing its file path. Please re-upload it from the Data Vault.')
            }
            setLoading(false)
        } catch (error: any) {
            console.error("Error loading project:", error)
            setPageError(`Failed to load project: ${error.message || 'Unknown error'}`)
            router.push('/vault')
            setLoading(false)
        }
    }

    const [isDataLoaded, setIsDataLoaded] = useState(false)

    const loadDataIntoDuckDB = async (dataset: any) => {
        try {
            console.log('Loading dataset into DuckDB:', dataset.name)

            // Check if data is already loaded
            const conn = await duckDB!.connect()
            const tableCheck = await conn.query(`
                SELECT count(*) as cnt FROM information_schema.tables 
                WHERE table_name = '${dataset.name}'
    `)

            const tableExists = Number(tableCheck.toArray()[0]['cnt']) > 0

            if (tableExists) {
                console.log('✅ Data already loaded in DuckDB')

                // Normalize table name
                const tableName = dataset.name.replace(/[^a-zA-Z0-9_]/g, '_')

                // Check if cleaned table exists
                const cleanedCheck = await conn.query(`
                    SELECT count(*) as cnt FROM information_schema.tables 
                    WHERE table_name = '${tableName}_cleaned'
                `)
                const cleanedExists = Number(cleanedCheck.toArray()[0]['cnt']) > 0
                const tableToQuery = cleanedExists ? `${tableName}_cleaned` : tableName
                console.log(`Using ${tableToQuery} for preview data`)

                // Fetch preview data to populate frontend state
                const preview = await conn.query(`SELECT * FROM "${tableToQuery}" LIMIT 5`)
                const previewRows = preview.toArray().map((r: any) => {
                    const obj = r.toJSON()
                    // Convert BigInt to Number
                    Object.keys(obj).forEach(key => {
                        if (typeof obj[key] === 'bigint') {
                            obj[key] = Number(obj[key])
                        }
                    })
                    return obj
                })

                setPreviewData(previewRows)
                if (previewRows.length > 0) {
                    setDataColumns(Object.keys(previewRows[0]))
                }

                await conn.close()
                setIsDataLoaded(true)
                return
            }

            // Data needs to be loaded
            console.log('Loading dataset into DuckDB:', dataset.name)

            // Check if file_path exists
            if (!dataset.file_path) {
                console.warn('Dataset has no file_path - this is a legacy dataset')
                setLoading(false)
                return
            }

            // Download file from Supabase Storage
            const { data: fileData, error: downloadError } = await supabase.storage
                .from('datasets')
                .download(dataset.file_path)

            if (downloadError || !fileData) {
                console.error('Failed to download file:', downloadError)
                setPageError(
                    `Failed to load dataset: ${downloadError?.message || 'File not found in storage'}. ` +
                    'Please re-upload it from the Data Vault.'
                )
                router.push('/vault')
                return
            }

            console.log('File downloaded, size:', fileData.size)

            // Register file with DuckDB
            const fileName = `${dataset.name}.csv`
            if (duckDB) {
                await duckDB.registerFileHandle(fileName, fileData, 2, true)
            }

            // Normalize table name (replace special chars with underscores)
            const tableName = dataset.name.replace(/[^a-zA-Z0-9_]/g, '_')

            console.log(`📊 Loading data into table: ${tableName}`)

            // Drop existing tables to avoid conflicts - use both original and normalized names
            const tableVariants = [
                dataset.name,
                tableName,
                `${dataset.name}_raw`,
                `${tableName}_raw`,
                `${dataset.name}_cleaned`,
                `${tableName}_cleaned`
            ]

            for (const variant of tableVariants) {
                try {
                    await conn.query(`DROP TABLE IF EXISTS "${variant}"`)
                } catch (e) {
                    // Ignore errors - table might not exist
                }
            }

            // Create main table
            try {
                await conn.query(`CREATE TABLE "${tableName}" AS SELECT * FROM read_csv_auto('${fileName}')`)
                console.log(`✅ Created table: ${tableName}`)
            } catch (createError: any) {
                // If table still exists, just use it
                if (createError.message?.includes('already exists')) {
                    console.log(`ℹ️ Table ${tableName} already exists, using existing table`)
                } else {
                    throw createError
                }
            }

            // Create original data backup (immutable)
            try {
                await conn.query(`CREATE TABLE "${tableName}_original" AS SELECT * FROM "${tableName}"`)
                console.log(`✅ Created original data table: ${tableName}_original`)
            } catch (backupError: any) {
                if (backupError.message?.includes('already exists')) {
                    console.log(`ℹ️ Original table ${tableName}_original already exists`)
                } else {
                    console.warn('Could not create original table:', backupError.message)
                }
            }

            // Save original file path to database
            if (activeProject?.id) {
                const { error } = await supabase
                    .from('projects')
                    .update({
                        original_file_path: fileName,
                        last_updated: new Date().toISOString()
                    })
                    .eq('id', activeProject.id)

                if (error) {
                    console.error('Failed to save original file path:', error)
                }
            }

            console.log('✅ Data loaded into DuckDB successfully')

            await conn.close()
            setIsDataLoaded(true)
        } catch (error: any) {
            console.error('Failed to load data into DuckDB:', error)
            setPageError(`Failed to load data: ${error.message}`)
            setIsDataLoaded(false)
        } finally {
            setLoading(false)
        }
    }

    const [previewData, setPreviewData] = useState<any[]>([])

    const handleRunMatch = async () => {
        if (!activeDataset || !duckDB) {
            console.error("No active dataset or DuckDB not ready")
            return
        }

        setIsProcessing(true)
        try {
            // Export data from DuckDB to CSV
            const conn = await duckDB.connect()

            // Normalize table name
            const tableName = activeDataset.name.replace(/[^a-zA-Z0-9_]/g, '_')

            // Check if cleaned table exists, use it if available
            let tableToUse = tableName
            try {
                const cleanedTableCheck = await conn.query(`
                    SELECT count(*) as cnt FROM information_schema.tables 
                    WHERE table_name = '${tableName}_cleaned'
                `)
                const cleanedExists = Number(cleanedTableCheck.toArray()[0]['cnt']) > 0
                if (cleanedExists) {
                    tableToUse = `${tableName}_cleaned`
                    console.log(`✓ Using cleaned data from ${tableToUse}`)
                }
            } catch (e) {
                // Cleaned table doesn't exist, use raw data
                console.log(`Using raw data from ${tableName}`)
            }

            const result = await conn.query(`SELECT * FROM "${tableToUse}"`)

            // Convert BigInt to Number for JSON serialization
            const rows = result.toArray().map((r: any) => {
                const obj = r.toJSON()
                // Convert all BigInt values to Numbers
                Object.keys(obj).forEach(key => {
                    if (typeof obj[key] === 'bigint') {
                        obj[key] = Number(obj[key])
                    }
                })
                return obj
            })
            await conn.close()

            // Convert to CSV
            if (rows.length === 0) {
                throw new Error("No data to process")
            }

            const headers = Object.keys(rows[0])
            const csvRows = [
                headers.join(','),
                ...rows.map(row => headers.map(h => JSON.stringify(row[h] ?? '')).join(','))
            ]
            const csvData = csvRows.join('\n')

            // Transform comparisons to Splink format
            const { generateSplinkComparison } = await import('@/lib/comparison/comparisonMethods')
            const splinkComparisons = comparisons.length > 0
                ? comparisons.map(comp => generateSplinkComparison(comp))
                : []

            // Detect unique ID column
            const possibleIdColumns = ['id', '_id', 'unique_id', 'pk', 'key']
            let uniqueIdCol = headers.find(h => possibleIdColumns.includes(h.toLowerCase()))

            if (!uniqueIdCol) {
                // Try finding column ending with id
                uniqueIdCol = headers.find(h => h.toLowerCase().endsWith('id'))
            }

            if (!uniqueIdCol) {
                // Default to first column
                uniqueIdCol = headers[0]
            }

            console.log(`🔑 Detected unique ID column: ${uniqueIdCol}`)

            // Build Splink settings
            const settings = {
                link_type: "dedupe_only",
                unique_id_column_name: uniqueIdCol,
                probability_two_random_records_match: globalSettings.probability_two_random_records_match,
                blocking_rules_to_generate_predictions: blockingRules.length > 0
                    ? blockingRules
                    : [], // Empty list implies full comparison (or let Splink handle it)
                comparisons: splinkComparisons
            }

            console.log('\n════════════════════════════════════════════════════════════')
            console.log('🚀 FRONTEND: Sending to Backend API')
            console.log('════════════════════════════════════════════════════════════')
            console.log(`📊 Dataset: ${tableToUse}`)
            console.log(`📏 Rows: ${rows.length}`)
            console.log(`🔑 Unique ID: ${uniqueIdCol}`)

            console.log(`\n🔒 Blocking Rules (${blockingRules.length}):`)
            if (blockingRules.length > 0) {
                blockingRules.forEach((rule, i) => {
                    console.log(`  ${i + 1}. ${rule}`)
                })
            } else {
                console.log('  (None - Full N×N comparison)')
            }

            console.log(`\n📊 Comparisons (${comparisons.length}):`)
            comparisons.forEach((comp, i) => {
                console.log(`  ${i + 1}. Column: ${comp.column}`)
                console.log(`     Method: ${comp.method}`)
                console.log(`     Weight: ${comp.weight}`)
                if (comp.threshold !== undefined) {
                    console.log(`     Threshold: ${comp.threshold}`)
                }
            })

            console.log(`\n✨ Generated Splink Comparisons (${splinkComparisons.length}):`)
            splinkComparisons.forEach((comp, i) => {
                const levels = comp.comparison_levels?.length || 0
                console.log(`  ${i + 1}. ${comp.output_column_name} (${levels} levels)`)
            })

            console.log('\n📦 Full Settings Object:')
            console.log(JSON.stringify(settings, null, 2))
            console.log('════════════════════════════════════════════════════════════\n')

            // Run entity resolution with primary key
            const { runEntityResolution } = await import('@/lib/api/splinkClient')
            const response = await runEntityResolution(
                csvData,
                settings,
                0.5,
                primaryKey || undefined,  // Pass the user-selected primary key
                semanticBlocking
            )

            if (response.status === 'success') {
                setResults(response.matches)
                setActivePhase('results')
                console.log(`✅ Found ${response.total_pairs} matches in ${response.execution_time_ms}ms`)
            } else {
                throw new Error(response.error || 'Resolution failed')
            }

        } catch (error) {
            console.error("Match failed", error)
            setPageError(`Entity resolution failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
        } finally {
            setIsProcessing(false)
        }
    }

    const columns: ColumnDef<any>[] = results.length > 0
        ? Object.keys(results[0]).map(key => ({
            accessorKey: key,
            header: key,
        }))
        : []

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-background">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        )
    }

    if (!activeProject) return <div>Project not found</div>

    return (
        <div className="flex h-screen overflow-hidden bg-background text-foreground">
            {/* Sidebar */}
            <div className="w-64 border-r border-border bg-card flex flex-col shadow-sm">
                {/* Sidebar Header */}
                <div className="h-14 flex items-center justify-center border-b border-border">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 via-purple-500 to-purple-600 p-1.5 shadow-md">
                        <svg viewBox="0 0 24 24" fill="none" className="w-full h-full text-white">
                            <circle cx="7" cy="17" r="3" stroke="currentColor" strokeWidth="2" />
                            <circle cx="17" cy="7" r="3" stroke="currentColor" strokeWidth="2" />
                            <path d="M9.5 14.5L14.5 9.5" stroke="currentColor" strokeWidth="2" />
                        </svg>
                    </div>
                </div>

                {/* Phase Navigation */}
                <div className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
                    <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Project Phases
                    </div>
                    {PHASES.map((phase) => {
                        const Icon = phase.icon
                        const isActive = activePhase === phase.id
                        const status = phaseStatus[phase.id as PhaseId]
                        const validation = validatePhaseAccess(phase.id as PhaseId, phaseStatus)
                        const isLocked = !validation.canAccess

                        return (
                            <button
                                key={phase.id}
                                onClick={() => {
                                    if (isLocked) {
                                        // Could show toast notification here
                                        console.log('Phase locked:', validation.reason)
                                        return
                                    }
                                    setActivePhase(phase.id)
                                }}
                                disabled={isLocked}
                                className={`
                                    w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all
                                    ${isActive
                                        ? 'bg-primary text-primary-foreground shadow-sm'
                                        : isLocked
                                            ? 'text-muted-foreground/50 cursor-not-allowed opacity-60'
                                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                    }
                                `}
                                title={isLocked ? validation.reason : undefined}
                            >
                                <Icon className="w-4 h-4 flex-shrink-0" />
                                <span className="flex-1 text-left">{phase.label}</span>

                                {/* Completion checkmark */}
                                {status?.complete && !isActive && (
                                    <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                                )}

                                {/* In progress indicator */}
                                {isActive && !status?.complete && (
                                    <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 animate-pulse" />
                                )}

                                {/* Locked indicator */}
                                {isLocked && (
                                    <Lock className="w-3 h-3 flex-shrink-0" />
                                )}
                            </button>
                        )
                    })}
                </div>

                {/* User Profile */}
                <div className="p-4 border-t border-border bg-muted/30">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white">
                            MR
                        </div>
                        <div className="flex-1 overflow-hidden">
                            <p className="text-sm font-medium truncate">Muhammed Rasin</p>
                            <p className="text-xs text-muted-foreground truncate">Admin</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-w-0 bg-muted/10">
                {/* Top Navigation Bar */}
                <header className="h-14 border-b border-border bg-card flex items-center justify-between px-6 shadow-sm">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="hover:text-foreground cursor-pointer" onClick={() => router.push('/vault')}>Vault</span>
                        <ChevronRight className="w-4 h-4" />
                        <span className="font-medium text-foreground flex items-center gap-2">
                            <Database className="w-4 h-4" />
                            {activeProject.name}
                        </span>
                        <Badge variant="outline" className="ml-2 text-xs font-normal">{activeProject.status}</Badge>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <Save className="w-4 h-4" />
                        </Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                    <MoreVertical className="w-4 h-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => {
                                    setRenameValue(activeProject?.name || "")
                                    setRenameDialogOpen(true)
                                }}>
                                    <Edit2 className="w-4 h-4 mr-2" />
                                    Rename Project
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => setDeleteDialogOpen(true)}
                                    disabled={isDeleting}
                                >
                                    {isDeleting ? (
                                        <>
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            Deleting...
                                        </>
                                    ) : (
                                        <>
                                            <Trash2 className="w-4 h-4 mr-2" />
                                            Delete Project
                                        </>
                                    )}
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Separator orientation="vertical" className="h-6 mx-2" />
                        <Button size="sm" className="gap-2" onClick={handleRunMatch} disabled={isProcessing || activePhase === 'results'}>
                            {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                            Run Pipeline
                        </Button>
                    </div>
                </header>

                {/* Workspace Content */}
                <main className="flex-1 overflow-y-auto p-6">
                    <div className="max-w-7xl mx-auto space-y-6">
                        {pageError && (
                            <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                <div className="flex-1">
                                    <p>{pageError}</p>
                                </div>
                                <Button variant="ghost" size="sm" onClick={() => setPageError(null)}>
                                    Dismiss
                                </Button>
                            </div>
                        )}

                        <div className="flex items-end justify-between mb-6">
                            <div>
                                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                                    {PHASES.find(p => p.id === activePhase)?.label}
                                </h1>
                                <p className="text-sm text-muted-foreground mt-1">
                                    {activePhase === 'profile' && "Analyze column statistics and data quality."}
                                    {activePhase === 'cleaning' && "Apply drag-and-drop transformations to clean your data."}
                                    {activePhase === 'blocking' && "Define rules to reduce the comparison search space."}
                                    {activePhase === 'comparisons' && "Configure how fields are compared (e.g. fuzzy matching)."}
                                    {activePhase === 'training' && "Estimate model parameters using EM algorithm."}
                                    {activePhase === 'results' && "Review and export linked entities."}
                                </p>
                            </div>
                        </div>

                        <AnimatePresence mode="wait">
                            <motion.div
                                key={activePhase}
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -5 }}
                                transition={{ duration: 0.15 }}
                            >
                                {activePhase === 'profile' && (
                                    <div className="space-y-6">
                                        {/* Primary Key Selection - Must be done first */}
                                        {!isPrimaryKeyConfirmed && dataColumns.length > 0 && (
                                            <PrimaryKeySelector
                                                columns={activeDataset?.columns || []}
                                                currentPrimaryKey={primaryKey || undefined}
                                                onPrimaryKeySelected={savePrimaryKey}
                                            />
                                        )}

                                        {isDataLoaded ? (
                                            <DataManager
                                                tableName={activeDataset?.name.replace(/[^a-zA-Z0-9_]/g, '_') || ''}
                                                onDataLoaded={(rowCount, cols) => {
                                                    setDataColumns(cols)
                                                    // Auto-confirm if primary key was already set
                                                    if (activeDataset?.primary_key_column) {
                                                        setIsPrimaryKeyConfirmed(true)
                                                    }
                                                }}
                                            />
                                        ) : (
                                            <div className="flex items-center justify-center py-12">
                                                <div className="flex flex-col items-center gap-4">
                                                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                                    <p className="text-muted-foreground">Loading data into DuckDB...</p>
                                                </div>
                                            </div>
                                        )}
                                        <div className="flex justify-end">
                                            <Button
                                                onClick={() => setActivePhase('cleaning')}
                                                disabled={!isDataLoaded || !isPrimaryKeyConfirmed}
                                            >
                                                Next: Data Cleaning <ArrowRight className="w-4 h-4 ml-2" />
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                {activePhase === 'cleaning' && (
                                    <div className="space-y-6">
                                        <DataCleaningStudio
                                            columns={dataColumns}
                                            onRulesApplied={() => {
                                                // Refresh the data to pick up new cleaned columns
                                                if (activeDataset) {
                                                    loadDataIntoDuckDB(activeDataset)
                                                    setActivePhase('blocking')
                                                }
                                            }}
                                        />
                                        <div className="flex justify-between">
                                            <Button variant="outline" onClick={() => setActivePhase('profile')}>
                                                Back: Data Profile
                                            </Button>
                                            <Button onClick={() => setActivePhase('blocking')}>
                                                Next: Blocking Rules <ArrowRight className="w-4 h-4 ml-2" />
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                {activePhase === 'blocking' && (
                                    <Panel>
                                        <PanelHeader>
                                            <PanelTitle>Blocking Configuration</PanelTitle>
                                        </PanelHeader>
                                        <PanelContent className="space-y-6">
                                            <SmartBlockingPanel
                                                columns={
                                                    dataColumns.length > 0
                                                        ? dataColumns
                                                        : (activeDataset?.columns && activeDataset.columns.length > 0)
                                                            ? activeDataset.columns.map(c => typeof c === 'string' ? c : c.column)
                                                            : (previewData && previewData.length > 0)
                                                                ? Object.keys(previewData[0])
                                                                : []
                                                }
                                                duckDB={duckDB}
                                                tableName={activeDataset?.table_name || activeDataset?.name?.replace(/[^a-zA-Z0-9_]/g, '_')}
                                                onApplySuggestion={(suggestion: SemanticSuggestion) => {
                                                    if (!blockingRules.includes(suggestion.recommended_rule)) {
                                                        setBlockingRules([...blockingRules, suggestion.recommended_rule])
                                                    }

                                                    setSemanticBlocking((prev) => {
                                                        const filtered = prev.filter(p => p.column !== suggestion.column)
                                                        return [
                                                            ...filtered,
                                                            {
                                                                column: suggestion.column,
                                                                run_id: suggestion.run_id,
                                                                rule: suggestion.recommended_rule
                                                            }
                                                        ]
                                                    })
                                                }}
                                            />
                                            <BlockingRuleBuilder
                                                columns={
                                                    // Try multiple sources for columns, prioritizing live data
                                                    dataColumns.length > 0
                                                        ? dataColumns
                                                        : (activeDataset?.columns && activeDataset.columns.length > 0)
                                                            ? activeDataset.columns.map(c => typeof c === 'string' ? c : c.column)
                                                            : (previewData && previewData.length > 0)
                                                                ? Object.keys(previewData[0])
                                                                : []
                                                }
                                                onRulesChange={setBlockingRules}
                                                initialRules={blockingRules}
                                                previewData={previewData}
                                                totalRecords={activeDataset?.row_count || previewData?.length || 1000}
                                                duckDB={duckDB}
                                                tableName={activeDataset?.table_name || activeDataset?.name?.replace(/[^a-zA-Z0-9_]/g, '_')}
                                            />
                                            {((!activeDataset?.columns || activeDataset.columns.length === 0) &&
                                                (!previewData || previewData.length === 0) &&
                                                dataColumns.length === 0) && (
                                                    <div className="text-sm text-muted-foreground p-4 bg-yellow-50 dark:bg-yellow-950/20 rounded">
                                                        ⚠️ No columns detected. Please ensure your data is loaded in the Profile phase first.
                                                    </div>
                                                )}

                                            {/* Phase Guidance */}
                                            <PhaseGuidanceCard
                                                currentPhase="blocking"
                                                phaseStatus={phaseStatus}
                                                onNavigate={(phase) => setActivePhase(phase)}
                                            />

                                            <div className="flex justify-end border-t border-border pt-4">
                                                <Button onClick={() => setActivePhase('comparisons')} disabled={blockingRules.length === 0}>
                                                    Next: Comparisons <ArrowRight className="w-4 h-4 ml-2" />
                                                </Button>
                                            </div>
                                        </PanelContent>
                                    </Panel>
                                )}

                                {activePhase === 'comparisons' && (
                                    <Panel>
                                        <PanelHeader>
                                            <PanelTitle>Comparison Logic</PanelTitle>
                                        </PanelHeader>
                                        <PanelContent className="space-y-6">
                                            <ComparisonBuilder
                                                columns={
                                                    // Use dataColumns which is populated from preview data
                                                    dataColumns.length > 0
                                                        ? dataColumns
                                                        : (activeDataset?.columns && activeDataset.columns.length > 0)
                                                            ? activeDataset.columns.map(c => typeof c === 'string' ? c : c.column)
                                                            : (previewData && previewData.length > 0)
                                                                ? Object.keys(previewData[0])
                                                                : []
                                                }
                                                onComparisonsChange={setComparisons}
                                                initialComparisons={comparisons}
                                                previewData={previewData}
                                                onGlobalSettingsChange={setGlobalSettings}
                                                initialGlobalSettings={globalSettings}
                                            />
                                            {dataColumns.length === 0 && (
                                                <div className="text-sm text-muted-foreground p-4 bg-yellow-50 dark:bg-yellow-950/20 rounded border border-yellow-500/50">
                                                    <p className="font-medium mb-2">⚠️ No columns detected</p>
                                                    <p className="text-xs">
                                                        Please ensure your data is loaded in the Profile phase first.
                                                        The columns will automatically appear here once data is loaded.
                                                    </p>
                                                </div>
                                            )}

                                            {/* Phase Guidance */}
                                            <PhaseGuidanceCard
                                                currentPhase="comparisons"
                                                phaseStatus={phaseStatus}
                                                onNavigate={(phase) => setActivePhase(phase)}
                                            />

                                            <div className="flex justify-end border-t border-border pt-4">
                                                <Button onClick={() => setActivePhase('training')} disabled={comparisons.length === 0}>
                                                    Next: Training <ArrowRight className="w-4 h-4 ml-2" />
                                                </Button>
                                            </div>
                                        </PanelContent>
                                    </Panel>
                                )}

                                {activePhase === 'training' && (
                                    <div className="space-y-6">
                                        <TrainingPanel
                                            onTrainingComplete={() => setModelTrained(true)}
                                            globalSettings={globalSettings}
                                        />

                                        {/* Phase Guidance */}
                                        <PhaseGuidanceCard
                                            currentPhase="training"
                                            phaseStatus={phaseStatus}
                                            onNavigate={(phase) => setActivePhase(phase)}
                                        />

                                        <div className="flex justify-end gap-3">
                                            <Button
                                                onClick={handleRunMatch}
                                                disabled={isProcessing}
                                                variant="default"
                                            >
                                                {isProcessing ? (
                                                    <>🔄 Processing...</>
                                                ) : (
                                                    <>▶️ Run Pipeline</>
                                                )}
                                            </Button>
                                            <Button onClick={() => setActivePhase('laboratory')} disabled={!modelTrained} variant="outline">
                                                Next: Laboratory <ArrowRight className="w-4 h-4 ml-2" />
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                {activePhase === 'laboratory' && (
                                    <div className="space-y-6">
                                        <LaboratoryDashboard
                                            onBackToTraining={() => setActivePhase('training')}
                                            onSkipToResults={handleRunMatch}
                                            isProcessing={isProcessing}
                                            blockingRules={blockingRules}
                                        />
                                    </div>
                                )}

                                {activePhase === 'results' && (
                                    <div className="space-y-6">
                                        <Tabs defaultValue="clusters" className="w-full">
                                            <TabsList className="grid w-full max-w-md grid-cols-2">
                                                <TabsTrigger value="clusters">Clusters & Insights</TabsTrigger>
                                                <TabsTrigger value="evaluation">Model Evaluation</TabsTrigger>
                                            </TabsList>

                                            <TabsContent value="clusters" className="mt-6 space-y-6">
                                                {/* Statistics & Insights Panel */}
                                                <MatchingInsightsPanel
                                                    tableName="input_data"
                                                    threshold={0.9}
                                                    onClusterSizeClick={setClusterSizeFilter}
                                                />

                                                {/* Cluster Visualization */}
                                                <ClusterVisualization
                                                    matches={results}
                                                    threshold={0.5}
                                                    duckDB={duckDB}
                                                    originalTableName={activeDataset ? `${activeDataset.name.replace(/[^a-zA-Z0-9_]/g, '_')}_original` : undefined}
                                                    filterSize={clusterSizeFilter}
                                                    primaryKeyColumn={primaryKey || undefined}
                                                    onExport={async () => {
                                                        if (!activeDataset) return

                                                        try {
                                                            const tableName = `${activeDataset.name.replace(/[^a-zA-Z0-9_]/g, '_')}_original`
                                                            const idColumn = primaryKey || 'unique_id'

                                                            console.log('📥 Exporting enriched clusters...')

                                                            const csvData = await fetchApiText('/api/export-clusters', undefined, {
                                                                table_name: tableName,
                                                                threshold,
                                                                id_column: idColumn,
                                                            })
                                                            const blob = new Blob([csvData], { type: 'text/csv' })
                                                            const url = URL.createObjectURL(blob)
                                                            const a = document.createElement('a')
                                                            a.href = url
                                                            a.download = `${activeProject?.name || 'entify'}_clusters_with_data.csv`
                                                            document.body.appendChild(a)
                                                            a.click()
                                                            document.body.removeChild(a)
                                                            URL.revokeObjectURL(url)

                                                            console.log('✅ Enriched clusters exported successfully')
                                                        } catch (error) {
                                                            console.error('Export failed:', error)
                                                            setPageError(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
                                                        }
                                                    }}
                                                />
                                            </TabsContent>

                                            <TabsContent value="evaluation" className="mt-6">
                                                <ModelEvaluationDashboard
                                                    currentThreshold={0.5}
                                                    onThresholdChange={(newThreshold) => {
                                                        console.log('Threshold changed to:', newThreshold)
                                                        // TODO: Re-run matching with new threshold
                                                    }}
                                                />
                                            </TabsContent>
                                        </Tabs>
                                    </div>
                                )}
                            </motion.div>
                        </AnimatePresence>
                    </div>
                </main>
            </div>

            <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Rename Project</DialogTitle>
                        <DialogDescription>
                            Update the project name shown in the vault and workspace.
                        </DialogDescription>
                    </DialogHeader>
                    <Input
                        value={renameValue}
                        onChange={(event) => setRenameValue(event.target.value)}
                        placeholder="Project name"
                    />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={async () => {
                                if (!activeProject) return
                                try {
                                    await handleRenameProject(activeProject.id, renameValue, router)
                                    setActiveProject({
                                        ...activeProject,
                                        name: renameValue.trim(),
                                    })
                                    setRenameDialogOpen(false)
                                    setPageError(null)
                                } catch (error) {
                                    console.error('Failed to rename project:', error)
                                    setPageError(`Failed to rename project: ${error instanceof Error ? error.message : 'Unknown error'}`)
                                }
                            }}
                        >
                            Save Name
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete Project</DialogTitle>
                        <DialogDescription>
                            This permanently removes the project, its saved configuration, and its results.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-muted-foreground">
                        {activeProject?.name ? `Project: ${activeProject.name}` : 'This action cannot be undone.'}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={isDeleting}>
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            disabled={isDeleting || !activeProject}
                            onClick={async () => {
                                if (!activeProject) return
                                setIsDeleting(true)
                                try {
                                    await handleDeleteProject(activeProject.id, router)
                                } catch (error) {
                                    console.error('Failed to delete project:', error)
                                    setPageError(`Failed to delete project: ${error instanceof Error ? error.message : 'Unknown error'}`)
                                    setIsDeleting(false)
                                }
                            }}
                        >
                            {isDeleting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Deleting...
                                </>
                            ) : (
                                'Delete Project'
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
