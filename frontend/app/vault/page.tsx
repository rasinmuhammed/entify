"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/utils/supabase/client"
import { Upload } from "@/components/Upload"
import { useDatasetStore } from "@/lib/store/useDatasetStore"
import { useWasm } from "@/lib/wasm/WasmContext"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Database, Plus, FolderOpen, Calendar, Loader2, MoreVertical, Edit2, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"

export default function DataVault() {
    const [datasets, setDatasets] = useState<any[]>([])
    const [projects, setProjects] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [setupRequired, setSetupRequired] = useState(false)
    const { setActiveDataset } = useDatasetStore()
    const { duckDB, isReady } = useWasm()
    const router = useRouter()
    const supabase = createClient()

    useEffect(() => {
        fetchData()
    }, [])

    const fetchData = async () => {
        setLoading(true)
        try {
            // Fetch datasets
            const { data: datasetsData, error: datasetsError } = await supabase
                .from('datasets')
                .select('*')
                .order('created_at', { ascending: false })

            if (datasetsError) {
                if (datasetsError.message.includes('relation "public.datasets" does not exist') ||
                    datasetsError.message.includes('Could not find the table')) {
                    setSetupRequired(true)
                    setLoading(false)
                    return
                }
                throw datasetsError
            }

            // Fetch projects
            const { data: projectsData, error: projectsError } = await supabase
                .from('projects')
                .select('*')
                .order('created_at', { ascending: false })

            if (projectsError) throw projectsError

            setDatasets(datasetsData || [])
            setProjects(projectsData || [])
        } catch (error) {
            console.error("Error fetching data:", error)
        } finally {
            setLoading(false)
        }
    }

    const handleDatasetUploaded = async (dataset: any) => {
        await fetchData()
    }

    const handleCreateProject = async (datasetId: string) => {
        try {
            const dataset = datasets.find(d => d.id === datasetId)
            if (!dataset) return

            const { data: project, error } = await supabase
                .from('projects')
                .insert({
                    name: `${dataset.name} - Deduplication`,
                    dataset_id: datasetId,
                    status: 'draft'
                })
                .select()
                .single()

            if (error) throw error

            router.push(`/projects/${project.id}`)
        } catch (error) {
            console.error("Error creating project:", error)
        }
    }

    const handleDeleteProject = async (projectId: string) => {
        if (!confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
            return
        }

        try {
            const { error } = await supabase
                .from('projects')
                .delete()
                .eq('id', projectId)

            if (error) throw error

            await fetchData()
        } catch (error) {
            console.error("Error deleting project:", error)
            alert('Failed to delete project')
        }
    }

    const handleRenameProject = async (projectId: string, currentName: string) => {
        const newName = prompt('Enter new project name:', currentName)
        if (!newName || newName === currentName) return

        try {
            const { error } = await supabase
                .from('projects')
                .update({ name: newName })
                .eq('id', projectId)

            if (error) throw error

            await fetchData()
        } catch (error) {
            console.error("Error renaming project:", error)
            alert('Failed to rename project')
        }
    }

    const handleDeleteDataset = async (datasetId: string) => {
        if (!confirm('Are you sure you want to delete this dataset? This will also delete any associated projects.')) {
            return
        }

        try {
            const dataset = datasets.find(d => d.id === datasetId)

            // Delete file from storage if it exists
            if (dataset?.file_path) {
                const { error: storageError } = await supabase.storage
                    .from('datasets')
                    .remove([dataset.file_path])

                if (storageError) {
                    console.warn('Failed to delete file from storage:', storageError)
                }
            }

            // Delete projects associated with this dataset
            await supabase
                .from('projects')
                .delete()
                .eq('dataset_id', datasetId)

            // Delete dataset
            const { error } = await supabase
                .from('datasets')
                .delete()
                .eq('id', datasetId)

            if (error) throw error

            await fetchData()
        } catch (error) {
            console.error("Error deleting dataset:", error)
            alert('Failed to delete dataset')
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="w-8 h-8 animate-spin" />
            </div>
        )
    }

    if (setupRequired) {
        return (
            <div className="container max-w-4xl mx-auto py-10">
                <Card>
                    <CardHeader>
                        <CardTitle>Setup Required</CardTitle>
                        <CardDescription>
                            The database tables need to be created. Please run the schema setup.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground mb-4">
                            Run the following SQL in your Supabase SQL Editor:
                        </p>
                        <pre className="p-4 bg-muted rounded-lg text-xs overflow-auto">
                            {`-- See frontend/supabase_schema.sql for the complete schema`}
                        </pre>
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <div className="container max-w-7xl mx-auto py-8 px-6">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight mb-2">Data Vault</h1>
                <p className="text-muted-foreground">
                    Manage your datasets and entity resolution projects
                </p>
            </div>

            {/* Upload Section */}
            <Card className="mb-8">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Database className="h-5 w-5" />
                        Upload New Dataset
                    </CardTitle>
                    <CardDescription>
                        Upload CSV or Parquet files to get started with entity resolution
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Upload onDatasetUploaded={handleDatasetUploaded} />
                </CardContent>
            </Card>

            {/* Projects Section */}
            {projects.length > 0 && (
                <div className="mb-8">
                    <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                        <FolderOpen className="h-5 w-5" />
                        Your Projects
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {projects.map((project) => (
                            <Card key={project.id} className="hover:bg-accent/50 transition-colors">
                                <CardHeader>
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1 cursor-pointer" onClick={() => router.push(`/projects/${project.id}`)}>
                                            <CardTitle className="text-lg">{project.name}</CardTitle>
                                            <CardDescription className="flex items-center gap-2 mt-2">
                                                <Calendar className="h-3 w-3" />
                                                {new Date(project.created_at).toLocaleDateString()}
                                            </CardDescription>
                                        </div>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                                    <MoreVertical className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={() => handleRenameProject(project.id, project.name)}>
                                                    <Edit2 className="h-4 w-4 mr-2" />
                                                    Rename
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem
                                                    onClick={() => handleDeleteProject(project.id)}
                                                    className="text-red-600"
                                                >
                                                    <Trash2 className="h-4 w-4 mr-2" />
                                                    Delete
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <Badge variant={project.status === 'completed' ? 'default' : 'secondary'}>
                                        {project.status}
                                    </Badge>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>
            )}

            {/* Datasets Section */}
            {datasets.length > 0 && (
                <div>
                    <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                        <Database className="h-5 w-5" />
                        Available Datasets
                    </h2>
                    <div className="grid grid-cols-1 gap-4">
                        {datasets.map((dataset) => (
                            <Card key={dataset.id} className="hover:bg-accent/50 transition-colors">
                                <CardHeader>
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <CardTitle className="text-lg flex items-center gap-2">
                                                {dataset.name}
                                                {!dataset.file_path && (
                                                    <Badge variant="destructive" className="text-xs">
                                                        File Missing
                                                    </Badge>
                                                )}
                                            </CardTitle>
                                            <CardDescription className="mt-2">
                                                <div className="flex items-center gap-2">
                                                    <Calendar className="h-3 w-3" />
                                                    {new Date(dataset.created_at).toLocaleDateString()}
                                                </div>
                                                <div className="mt-1 text-xs">
                                                    {dataset.row_count?.toLocaleString() || 0} rows
                                                </div>
                                                {!dataset.file_path && (
                                                    <div className="mt-2 text-xs text-destructive">
                                                        ⚠️ Re-upload required
                                                    </div>
                                                )}
                                            </CardDescription>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Button
                                                onClick={() => handleCreateProject(dataset.id)}
                                                disabled={!dataset.file_path}
                                            >
                                                <Plus className="h-4 w-4 mr-2" />
                                                {dataset.file_path ? 'Create Project' : 'Re-upload Required'}
                                            </Button>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon">
                                                        <MoreVertical className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem
                                                        onClick={() => handleDeleteDataset(dataset.id)}
                                                        className="text-red-600"
                                                    >
                                                        <Trash2 className="h-4 w-4 mr-2" />
                                                        Delete Dataset
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </div>
                                </CardHeader>
                            </Card>
                        ))}
                    </div>
                </div>
            )}

            {datasets.length === 0 && projects.length === 0 && (
                <div className="text-center py-12">
                    <Database className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">No datasets yet</h3>
                    <p className="text-muted-foreground">
                        Upload your first dataset to get started
                    </p>
                </div>
            )}
        </div>
    )
}
