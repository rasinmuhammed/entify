
"use client"

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
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
    Edit2
} from "lucide-react"
import { handleRenameProject, handleDeleteProject } from "@/lib/projectManagement"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import dynamic from 'next/dynamic'
import { DataTable } from "@/components/DataTable"
import { ColumnDef } from "@tanstack/react-table"
import { BlockingRuleBuilder } from "@/components/BlockingRuleBuilder"
import { ComparisonBuilder } from "@/components/ComparisonBuilder"
import { TrainingPanel } from "@/components/TrainingPanel"
import DataExplorer from "@/app/data/page"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { DataManager } from "@/components/workspace/DataManager"
import { DataCleaningStudio } from "@/components/workspace/DataCleaningStudio"


const PHASES = [
    { id: 'profile', label: 'Data Profile', icon: LayoutDashboard },
    { id: 'cleaning', label: 'Data Cleaning', icon: Settings2 },
    { id: 'blocking', label: 'Blocking Rules', icon: Database },
    { id: 'comparisons', label: 'Comparisons', icon: GitCompare },
    { id: 'training', label: 'Training', icon: BrainCircuit },
    { id: 'results', label: 'Results', icon: TableProperties },
]

export default function ProjectPage() {
    const params = useParams()
    const router = useRouter()
    const { user } = useUser()
    const { duckDB, isReady } = useWasm()
    const { activeProject, setActiveProject, activeDataset, setActiveDataset } = useDatasetStore()
    const supabase = createClient()
    const [isDeleting, setIsDeleting] = useState(false)

    const [loading, setLoading] = useState(true)
    const [activePhase, setActivePhase] = useState('profile')

    // Project State
    const [blockingRules, setBlockingRules] = useState<string[]>([])
    const [comparisons, setComparisons] = useState<any[]>([])
    const [modelTrained, setModelTrained] = useState(false)
    const [results, setResults] = useState<any[]>([])
    const [isProcessing, setIsProcessing] = useState(false)
    const [dataColumns, setDataColumns] = useState<string[]>([])

    // Auto-save blocking rules to database
    useEffect(() => {
        if (activeProject?.id && blockingRules.length > 0) {
            const saveRules = async () => {
                console.log('Saving blocking rules...', blockingRules)
                const { error } = await supabase
                    .from('projects')
                    .update({
                        blocking_rules: blockingRules,
                        last_updated: new Date().toISOString()
                    })
                    .eq('id', activeProject.id)

                if (error) {
                    console.error('Failed to save blocking rules:', error.message)
                } else {
                    console.log('✅ Blocking rules auto-saved')
                }
            }
            const timeout = setTimeout(saveRules, 1000) // Debounce
            return () => clearTimeout(timeout)
        }
    }, [blockingRules, activeProject?.id])

    // Auto-save comparisons to database
    useEffect(() => {
        if (activeProject?.id && comparisons.length > 0) {
            const saveComparisons = async () => {
                try {
                    const { error } = await supabase
                        .from('projects')
                        .update({
                            comparison_config: comparisons,
                            last_updated: new Date().toISOString()
                        })
                        .eq('id', activeProject.id)

                    if (!error) {
                        console.log('✅ Comparisons auto-saved')
                    }
                } catch (e) {
                    console.error('Failed to auto-save comparisons:', e)
                }
            }
            const timeout = setTimeout(saveComparisons, 1000)
            return () => clearTimeout(timeout)
        }
    }, [comparisons, activeProject?.id])




    // Auto-save active phase
    useEffect(() => {
        if (activeProject?.id && activePhase) {
            const savePhase = async () => {
                const { error } = await supabase
                    .from('projects')
                    .update({
                        active_phase: activePhase,
                        last_updated: new Date().toISOString()
                    })
                    .eq('id', activeProject.id)

                if (error) {
                    console.warn('Failed to save active phase (column might be missing):', error.message)
                }
            }
            savePhase()
        }
    }, [activePhase, activeProject?.id])

    useEffect(() => {
        if (params.id) {
            loadProject(params.id as string)
        }
    }, [params.id])

    // Reload data when DuckDB becomes ready
    useEffect(() => {
        if (duckDB && isReady && activeDataset && activeDataset.file_path) {
            const dataset = {
                name: activeDataset.name,
                file_path: activeDataset.file_path  // Use file_path from activeDataset, not activeProject
            }
            loadDataIntoDuckDB(dataset)
        }
    }, [duckDB, isReady, activeDataset?.file_path])

    const loadProject = async (id: string) => {
        try {
            console.log('Loading project:', id)

            // Get project
            const { data: project, error: projectError } = await supabase
                .from('projects')
                .select('*')
                .eq('id', id)
                .single()

            if (projectError) {
                console.error('Project fetch error:', projectError)
                throw new Error(`Failed to load project: ${projectError.message} `)
            }

            if (!project) {
                throw new Error('Project not found')
            }

            console.log('✅ Project loaded:', project.name)
            setActiveProject(project)

            // Load saved blocking rules and comparisons
            if (project.blocking_rules && Array.isArray(project.blocking_rules)) {
                setBlockingRules(project.blocking_rules)
                console.log('📋 Loaded blocking rules:', project.blocking_rules.length)
            }

            if (project.comparison_config && Array.isArray(project.comparison_config)) {
                setComparisons(project.comparison_config)
                console.log('📊 Loaded comparison config:', project.comparison_config.length)
            }

            // Load active phase
            if (project.active_phase) {
                setActivePhase(project.active_phase)
                console.log('📍 Restored active phase:', project.active_phase)
            }

            // Get dataset
            const { data: dataset, error: datasetError } = await supabase
                .from('datasets')
                .select('*')
                .eq('id', project.dataset_id)
                .single()

            if (datasetError || !dataset) {
                console.error('Dataset fetch error:', datasetError)
                throw new Error('Dataset not found')
            }

            console.log('📂 Loaded dataset:', dataset)
            setActiveDataset(dataset)

            if (!dataset.file_path) {
                console.error('❌ Dataset missing file_path:', dataset)
                alert('This dataset is missing its file path. Please re-upload it.')
            }
            setLoading(false)
        } catch (error: any) {
            console.error("Error loading project:", error)
            alert(`Failed to load project: ${error.message || 'Unknown error'} `)
            // Redirect to vault on error
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

                // Fetch preview data to populate frontend state
                const preview = await conn.query(`SELECT * FROM "${tableName}" LIMIT 5`)
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
                alert(
                    '❌ Failed to Load Dataset\n\n' +
                    `Error: ${downloadError?.message || 'File not found in storage'}\n\n` +
                    'The file may have been deleted from storage.\n' +
                    'Please re-upload your dataset in the Data Vault.'
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

            // Create raw backup
            try {
                await conn.query(`CREATE TABLE "${tableName}_raw" AS SELECT * FROM "${tableName}"`)
                console.log(`✅ Created backup table: ${tableName}_raw`)
            } catch (backupError: any) {
                if (backupError.message?.includes('already exists')) {
                    console.log(`ℹ️ Backup table ${tableName}_raw already exists`)
                } else {
                    console.warn('Could not create backup table:', backupError.message)
                }
            }

            console.log('✅ Data loaded into DuckDB successfully')

            await conn.close()
            setIsDataLoaded(true)
        } catch (error: any) {
            console.error('Failed to load data into DuckDB:', error)
            alert(`Failed to load data: ${error.message} `)
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
                blocking_rules_to_generate_predictions: blockingRules.length > 0
                    ? blockingRules
                    : [], // Empty list implies full comparison (or let Splink handle it)
                comparisons: splinkComparisons
            }

            console.log('🚀 Starting entity resolution with settings:', JSON.stringify(settings, null, 2))

            // Run entity resolution
            const { runEntityResolution } = await import('@/lib/api/splinkClient')
            const response = await runEntityResolution(csvData, settings, 0.5)

            if (response.status === 'success') {
                setResults(response.matches)
                setActivePhase('results')
                console.log(`✅ Found ${response.total_pairs} matches in ${response.execution_time_ms}ms`)
            } else {
                throw new Error(response.error || 'Resolution failed')
            }

        } catch (error) {
            console.error("Match failed", error)
            alert(`Entity resolution failed: ${error instanceof Error ? error.message : 'Unknown error'} `)
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
                <div className="h-14 flex items-center px-4 border-b border-border">
                    <div className="flex items-center gap-2 font-semibold text-lg">
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm">
                            E
                        </div>
                        <span>Entify</span>
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
                        return (
                            <button
                                key={phase.id}
                                onClick={() => setActivePhase(phase.id)}
                                className={`
                                    w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all
                                    ${isActive
                                        ? 'bg-primary text-primary-foreground shadow-sm'
                                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                    }
                                `}
                            >
                                <Icon className="w-4 h-4 flex-shrink-0" />
                                <span>{phase.label}</span>
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
                                    const newName = prompt('Enter new project name:', activeProject?.name)
                                    if (newName && activeProject) {
                                        handleRenameProject(activeProject.id, newName, router)
                                    }
                                }}>
                                    <Edit2 className="w-4 h-4 mr-2" />
                                    Rename Project
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => {
                                        if (activeProject) {
                                            handleDeleteProject(activeProject.id, router)
                                        }
                                    }}
                                >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Delete Project
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
                                        {isDataLoaded ? (
                                            <DataManager
                                                tableName={activeDataset?.name.replace(/[^a-zA-Z0-9_]/g, '_') || ''}
                                                onDataLoaded={(rowCount, cols) => {
                                                    setDataColumns(cols)
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
                                            <Button onClick={() => setActivePhase('cleaning')} disabled={!isDataLoaded}>
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
                                                // Refresh the data
                                                if (activeDataset?.name) {
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
                                            <BlockingRuleBuilder
                                                columns={
                                                    // Try multiple sources for columns
                                                    (activeDataset?.columns && activeDataset.columns.length > 0)
                                                        ? activeDataset.columns.map(c => typeof c === 'string' ? c : c.column)
                                                        : (previewData && previewData.length > 0)
                                                            ? Object.keys(previewData[0])
                                                            : dataColumns.length > 0
                                                                ? dataColumns
                                                                : []
                                                }
                                                onRulesChange={setBlockingRules}
                                                initialRules={blockingRules}
                                                previewData={previewData}
                                            />
                                            {((!activeDataset?.columns || activeDataset.columns.length === 0) &&
                                                (!previewData || previewData.length === 0) &&
                                                dataColumns.length === 0) && (
                                                    <div className="text-sm text-muted-foreground p-4 bg-yellow-50 dark:bg-yellow-950/20 rounded">
                                                        ⚠️ No columns detected. Please ensure your data is loaded in the Profile phase first.
                                                    </div>
                                                )}
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
                                        <TrainingPanel onTrainingComplete={() => setModelTrained(true)} />
                                        <div className="flex justify-end">
                                            <Button onClick={handleRunMatch} disabled={!modelTrained}>
                                                {isProcessing ? (
                                                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Running Predictions...</>
                                                ) : (
                                                    <>Run Predictions & View Results <ArrowRight className="w-4 h-4 ml-2" /></>
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                {activePhase === 'results' && (
                                    <Panel>
                                        <PanelHeader className="flex flex-row items-center justify-between">
                                            <PanelTitle>Match Results</PanelTitle>
                                            <div className="text-xs text-muted-foreground">
                                                {results.length} records found
                                            </div>
                                        </PanelHeader>
                                        <PanelContent>
                                            <DataTable columns={columns} data={results} />
                                        </PanelContent>
                                    </Panel>
                                )}
                            </motion.div>
                        </AnimatePresence>
                    </div>
                </main>
            </div>
        </div>
    )
}
