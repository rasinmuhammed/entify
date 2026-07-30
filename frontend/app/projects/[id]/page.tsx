"use client"

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useWasm } from '@/lib/wasm/WasmContext'
import { useDatasetStore } from '@/lib/store/useDatasetStore'
import { createClient } from '@/utils/supabase/client'
import { Panel, PanelContent, PanelHeader, PanelTitle } from "@/components/ui/panel"
import { Button } from '@/components/ui/button'
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
import { BlockingRuleBuilder } from "@/components/BlockingRuleBuilder"
import { ComparisonBuilder } from "@/components/ComparisonBuilder"
import { TrainingPanel } from "@/components/TrainingPanel"
import { ClusterVisualization } from '@/components/matching/ClusterVisualization'
import { MatchingInsightsPanel } from '@/components/matching/MatchingInsightsPanel'
import { Logo } from "@/components/brand/Logo"
import { useAppUser } from "@/lib/auth"
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
import { fetchApiText } from "@/lib/api/client"
import type { ComparisonConfig } from "@/lib/comparison/comparisonMethods"
import { loadProjectBundle, saveDatasetPrimaryKey } from "@/lib/projects/persistence"
import { useProjectAutosave } from "@/lib/projects/useProjectAutosave"
import {
    getWorkspaceColumns,
    loadDatasetIntoDuckDb,
    runProjectResolution,
} from "@/lib/projects/workspaceExecution"


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
    const user = useAppUser()
    const [isDeleting, setIsDeleting] = useState(false)

    const [loading, setLoading] = useState(true)
    const [activePhase, setActivePhase] = useState('profile')
    const [clusterSizeFilter, setClusterSizeFilter] = useState<{ min: number, max: number } | null>(null)

    // Phase progress tracking
    const [phaseStatus, setPhaseStatus] = useState<PhaseStatus>(INITIAL_PHASE_STATUS)

    // Project State (persisted to database)
    const [blockingRules, setBlockingRules] = useState<string[]>([])
    const [comparisons, setComparisons] = useState<ComparisonConfig[]>([])
    const [threshold, setThreshold] = useState(0.5)
    const [modelTrained, setModelTrained] = useState(false)
    const [results, setResults] = useState<Array<Record<string, unknown>>>([])
    const [isProcessing, setIsProcessing] = useState(false)
    const [dataColumns, setDataColumns] = useState<string[]>([])
    const [primaryKey, setPrimaryKey] = useState<string | null>(activeDataset?.primary_key_column || null)
    const [isPrimaryKeyConfirmed, setIsPrimaryKeyConfirmed] = useState(false)
    const [semanticBlocking, setSemanticBlocking] = useState<Array<{ column: string, run_id: string, rule: string }>>([])
    const [globalSettings, setGlobalSettings] = useState({
        probability_two_random_records_match: 0.0001
    })
    const [pageError, setPageError] = useState<string | null>(null)
    const [lockedNotice, setLockedNotice] = useState<string | null>(null)
    const [renameDialogOpen, setRenameDialogOpen] = useState(false)
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
    const [renameValue, setRenameValue] = useState("")

    const getErrorMessage = useCallback((error: unknown) => {
        return error instanceof Error ? error.message : 'Unknown error'
    }, [])

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
                console.log('Primary key saved to database:', columnName)
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

                console.log('Primary key stored locally:', columnName)
            }
        }
    }

    const loadProject = useCallback(async (id: string) => {
        try {
            console.log('Loading project:', id)
            setPageError(null)

            const bundle = await loadProjectBundle(supabase, id)
            const { project, dataset } = bundle

            console.log('Project loaded:', project.name)
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
                console.error('Dataset missing file_path:', dataset)
                setPageError('This dataset is missing its file path. Please re-upload it from the Data Vault.')
            }
            setLoading(false)
        } catch (error) {
            console.error("Error loading project:", error)
            setPageError(`Failed to load project: ${getErrorMessage(error)}`)
            router.push('/vault')
            setLoading(false)
        }
    }, [getErrorMessage, router, setActiveDataset, setActiveProject, supabase])

    const [isDataLoaded, setIsDataLoaded] = useState(false)

    const loadDataIntoDuckDB = useCallback(async (dataset: { name: string; file_path?: string }) => {
        if (!duckDB) {
            return
        }

        try {
            console.log('Loading dataset into DuckDB:', dataset.name)
            const loadResult = await loadDatasetIntoDuckDb({
                activeProjectId: activeProject?.id,
                dataset,
                duckDB,
                getErrorMessage,
                supabase,
            })

            setPreviewData(loadResult.previewData)
            setDataColumns(loadResult.dataColumns)
            setIsDataLoaded(loadResult.isDataLoaded)
        } catch (error) {
            console.error('Failed to load data into DuckDB:', error)
            const message = getErrorMessage(error)
            setPageError(
                message.includes('File not found')
                    ? `Failed to load dataset: ${message}. Please re-upload it from the Data Vault.`
                    : `Failed to load data: ${message}`
            )
            setIsDataLoaded(false)
            if (message.includes('File not found')) {
                router.push('/vault')
            }
        } finally {
            setLoading(false)
        }
    }, [activeProject?.id, duckDB, getErrorMessage, router, supabase])

    const [previewData, setPreviewData] = useState<Array<Record<string, unknown>>>([])

    useEffect(() => {
        if (params.id) {
            loadProject(params.id as string)
        }
    }, [loadProject, params.id])

    useEffect(() => {
        if (activeDataset?.id) {
            if (activeDataset.primary_key_column) {
                setPrimaryKey(activeDataset.primary_key_column)
                setIsPrimaryKeyConfirmed(true)
                console.log('Loaded primary key from database:', activeDataset.primary_key_column)
            } else {
                const storageKey = `primary_key_${activeDataset.id}`
                const storedKey = localStorage.getItem(storageKey)
                if (storedKey) {
                    setPrimaryKey(storedKey)
                    setIsPrimaryKeyConfirmed(true)
                    console.log('Loaded primary key from localStorage:', storedKey)
                }
            }
        }
    }, [activeDataset?.id, activeDataset?.primary_key_column])

    useEffect(() => {
        if (duckDB && isReady && activeDataset) {
            const filePath = activeDataset.cleaned_file_path || activeDataset.file_path

            if (filePath) {
                loadDataIntoDuckDB({
                    name: activeDataset.name,
                    file_path: filePath
                })
            }
        }
    }, [activeDataset, duckDB, isReady, loadDataIntoDuckDB])

    const workspaceColumns = useMemo(
        () => getWorkspaceColumns(dataColumns, activeDataset?.columns, previewData),
        [activeDataset?.columns, dataColumns, previewData]
    )

    const handleRunMatch = async () => {
        if (!activeDataset || !duckDB) {
            console.error("No active dataset or DuckDB not ready")
            return
        }

        setIsProcessing(true)
        try {
            const response = await runProjectResolution({
                activeDataset,
                blockingRules,
                comparisons,
                duckDB,
                globalSettings,
                primaryKey: primaryKey || undefined,
                semanticBlocking
            })

            if (response.status === 'success') {
                setResults(response.matches)
                setActivePhase('results')
                console.log(` Found ${response.total_pairs} matches in ${response.execution_time_ms}ms`)
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

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-background">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        )
    }

    if (!activeProject) return <div>Project not found</div>

    return (
        <div className="flex min-h-0 flex-1 overflow-hidden bg-background text-foreground">
            {/* Sidebar */}
            <div className="hidden shrink-0 flex-col border-r border-border bg-card sm:flex sm:w-14 xl:w-60">
                {/* Sidebar Header */}
                <div className="flex h-14 items-center gap-2.5 border-b border-border px-4 xl:px-4">
                    <Logo className="h-[18px] w-[18px] shrink-0" />
                    <span className="hidden truncate text-sm font-medium tracking-[-0.01em] xl:inline">
                        {activeProject.name}
                    </span>
                </div>

                {/* Phase Navigation */}
                <div className="flex-1 space-y-0.5 overflow-y-auto p-2">
                    <div className="hidden px-3 pb-2 pt-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground xl:block">
                        Workflow
                    </div>
                    {lockedNotice && (
                        <p className="mx-1 mb-2 hidden rounded-lg border border-border bg-muted/50 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground xl:block">
                            {lockedNotice}
                        </p>
                    )}
                    {PHASES.map((phase, phaseIndex) => {
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
                                        // Silently logging this left the user
                                        // clicking a dead control with no reason.
                                        setLockedNotice(
                                            validation.reason ??
                                            "Finish the earlier steps first."
                                        )
                                        return
                                    }
                                    setLockedNotice(null)
                                    setActivePhase(phase.id)
                                }}
                                disabled={isLocked}
                                className={[
                                    "group flex w-full items-center gap-2.5 rounded-lg py-2 text-[13px] transition-colors",
                                    "justify-center px-0 xl:justify-start xl:px-2.5",
                                    isActive
                                        ? "bg-secondary font-medium text-secondary-foreground"
                                        : isLocked
                                            ? "cursor-not-allowed text-muted-foreground/45"
                                            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                                ].join(" ")}
                                // On the collapsed rail the visible content is
                                // a bare step number, so the label has to come
                                // from somewhere: a tooltip for pointer users
                                // and an accessible name for everyone else.
                                title={
                                    isLocked
                                        ? `${phase.label}: ${validation.reason}`
                                        : phase.label
                                }
                                aria-label={phase.label}
                                aria-current={isActive ? "step" : undefined}
                            >
                                {/* The step number carries the sequence; the
                                    icon alone never said which came first. */}
                                <span
                                    className={[
                                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[10px] tabular-nums",
                                        status?.complete
                                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                                            : isActive
                                                ? "border-foreground/20 bg-background"
                                                : "border-border",
                                    ].join(" ")}
                                >
                                    {status?.complete ? (
                                        <CheckCircle2 className="h-3 w-3" />
                                    ) : (
                                        phaseIndex + 1
                                    )}
                                </span>

                                <Icon className="hidden h-3.5 w-3.5 shrink-0 opacity-70 xl:block" />
                                <span className="hidden flex-1 truncate text-left xl:block">
                                    {phase.label}
                                </span>

                                {isActive && !status?.complete && (
                                    <span className="hidden h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/60 xl:block" />
                                )}
                                {isLocked && <Lock className="hidden h-3 w-3 shrink-0 xl:block" />}
                            </button>
                        )
                    })}
                </div>

                {/* User Profile */}
                <div className="hidden border-t border-border p-3 xl:block">
                    <div className="flex items-center gap-2.5">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-secondary text-[11px] font-medium">
                            {user.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium">{user.name}</p>
                            <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-w-0 bg-muted/10">
                {/* Top Navigation Bar */}
                {/* The breadcrumb shrinks and truncates; the actions never do.
                    Previously both sides sized to content, so a long project
                    name pushed Run Pipeline off the right edge. */}
                <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4 sm:px-6">
                    <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
                        <button
                            onClick={() => router.push('/vault')}
                            className="hidden shrink-0 transition-colors hover:text-foreground sm:inline"
                        >
                            Vault
                        </button>
                        <ChevronRight className="hidden h-4 w-4 shrink-0 sm:block" />
                        <span className="flex min-w-0 items-center gap-2 font-medium text-foreground">
                            <Database className="h-4 w-4 shrink-0" />
                            <span className="truncate">{activeProject.name}</span>
                        </span>
                        <Badge
                            variant="outline"
                            className="ml-1 hidden shrink-0 text-xs font-normal md:inline-flex"
                        >
                            {activeProject.status}
                        </Badge>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
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
                                                columns={workspaceColumns}
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
                                                columns={workspaceColumns}
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
                                                         No columns detected. Please ensure your data is loaded in the Profile phase first.
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
                                                columns={workspaceColumns}
                                                onComparisonsChange={setComparisons}
                                                initialComparisons={comparisons}
                                                previewData={previewData}
                                                onGlobalSettingsChange={setGlobalSettings}
                                                initialGlobalSettings={globalSettings}
                                            />
                                            {dataColumns.length === 0 && (
                                                <div className="text-sm text-muted-foreground p-4 bg-yellow-50 dark:bg-yellow-950/20 rounded border border-yellow-500/50">
                                                    <p className="font-medium mb-2">No columns detected</p>
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
                                                    <>Processing...</>
                                                ) : (
                                                    <>▶ Run Pipeline</>
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

                                                            console.log('Exporting enriched clusters...')

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

                                                            console.log('Enriched clusters exported successfully')
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
