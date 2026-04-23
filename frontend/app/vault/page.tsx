"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
    AlertCircle,
    Calendar,
    Database,
    Edit2,
    FolderOpen,
    Loader2,
    MoreVertical,
    Plus,
    Trash2,
} from "lucide-react"

import { Upload } from "@/components/Upload"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { createClient } from "@/utils/supabase/client"

type DeleteTarget =
    | { id: string; name: string; kind: "project" | "dataset" }
    | null

type DatasetRecord = {
    id: string
    name: string
    created_at: string
    row_count?: number | null
    file_path?: string | null
}

type ProjectRecord = {
    id: string
    name: string
    created_at: string
    status: string
}

export default function DataVault() {
    const [datasets, setDatasets] = useState<DatasetRecord[]>([])
    const [projects, setProjects] = useState<ProjectRecord[]>([])
    const [loading, setLoading] = useState(true)
    const [setupRequired, setSetupRequired] = useState(false)
    const [pageError, setPageError] = useState<string | null>(null)
    const [renameDialogOpen, setRenameDialogOpen] = useState(false)
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
    const [renameProjectId, setRenameProjectId] = useState<string | null>(null)
    const [renameValue, setRenameValue] = useState("")
    const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null)

    const router = useRouter()
    const supabase = createClient()

    const fetchData = useCallback(async () => {
        setLoading(true)
        try {
            const { data: datasetsData, error: datasetsError } = await supabase
                .from("datasets")
                .select("*")
                .order("created_at", { ascending: false })

            if (datasetsError) {
                if (
                    datasetsError.message.includes('relation "public.datasets" does not exist') ||
                    datasetsError.message.includes("Could not find the table")
                ) {
                    setSetupRequired(true)
                    setLoading(false)
                    return
                }
                throw datasetsError
            }

            const { data: projectsData, error: projectsError } = await supabase
                .from("projects")
                .select("*")
                .order("created_at", { ascending: false })

            if (projectsError) throw projectsError

            setDatasets(datasetsData || [])
            setProjects(projectsData || [])
            setPageError(null)
        } catch (error) {
            console.error("Error fetching data:", error)
            setPageError("Failed to load datasets and projects from Supabase.")
        } finally {
            setLoading(false)
        }
    }, [supabase])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    const handleDatasetUploaded = async () => {
        await fetchData()
    }

    const handleCreateProject = async (datasetId: string) => {
        try {
            const dataset = datasets.find((d) => d.id === datasetId)
            if (!dataset) return

            const { data: project, error } = await supabase
                .from("projects")
                .insert({
                    name: `${dataset.name} - Deduplication`,
                    dataset_id: datasetId,
                    status: "draft",
                })
                .select()
                .single()

            if (error) throw error

            router.push(`/projects/${project.id}`)
        } catch (error) {
            console.error("Error creating project:", error)
            setPageError("Failed to create project.")
        }
    }

    const handleRenameProject = async (projectId: string, nextName: string) => {
        if (!nextName.trim()) {
            setPageError("Project name cannot be empty.")
            return
        }

        try {
            const { error } = await supabase
                .from("projects")
                .update({ name: nextName.trim() })
                .eq("id", projectId)

            if (error) throw error

            await fetchData()
            setRenameDialogOpen(false)
        } catch (error) {
            console.error("Error renaming project:", error)
            setPageError("Failed to rename project.")
        }
    }

    const handleDeleteProject = async (projectId: string) => {
        try {
            const { error } = await supabase
                .from("projects")
                .delete()
                .eq("id", projectId)

            if (error) throw error

            await fetchData()
            setDeleteDialogOpen(false)
        } catch (error) {
            console.error("Error deleting project:", error)
            setPageError("Failed to delete project.")
        }
    }

    const handleDeleteDataset = async (datasetId: string) => {
        try {
            const dataset = datasets.find((d) => d.id === datasetId)

            if (dataset?.file_path) {
                const { error: storageError } = await supabase.storage
                    .from("datasets")
                    .remove([dataset.file_path])

                if (storageError) {
                    console.warn("Failed to delete file from storage:", storageError)
                }
            }

            await supabase.from("projects").delete().eq("dataset_id", datasetId)

            const { error } = await supabase
                .from("datasets")
                .delete()
                .eq("id", datasetId)

            if (error) throw error

            await fetchData()
            setDeleteDialogOpen(false)
        } catch (error) {
            console.error("Error deleting dataset:", error)
            setPageError("Failed to delete dataset.")
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
            <div className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight mb-2">Data Vault</h1>
                <p className="text-muted-foreground">
                    Manage your datasets and entity resolution projects
                </p>
            </div>

            {pageError && (
                <div className="mb-6 flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="flex-1">{pageError}</div>
                    <Button variant="ghost" size="sm" onClick={() => setPageError(null)}>
                        Dismiss
                    </Button>
                </div>
            )}

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
                                                <DropdownMenuItem
                                                    onClick={() => {
                                                        setRenameProjectId(project.id)
                                                        setRenameValue(project.name)
                                                        setRenameDialogOpen(true)
                                                    }}
                                                >
                                                    <Edit2 className="h-4 w-4 mr-2" />
                                                    Rename
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem
                                                    className="text-red-600"
                                                    onClick={() => {
                                                        setDeleteTarget({ id: project.id, name: project.name, kind: "project" })
                                                        setDeleteDialogOpen(true)
                                                    }}
                                                >
                                                    <Trash2 className="h-4 w-4 mr-2" />
                                                    Delete
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <Badge variant={project.status === "completed" ? "default" : "secondary"}>
                                        {project.status}
                                    </Badge>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>
            )}

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
                                                        Re-upload required
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
                                                {dataset.file_path ? "Create Project" : "Re-upload Required"}
                                            </Button>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon">
                                                        <MoreVertical className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem
                                                        className="text-red-600"
                                                        onClick={() => {
                                                            setDeleteTarget({ id: dataset.id, name: dataset.name, kind: "dataset" })
                                                            setDeleteDialogOpen(true)
                                                        }}
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

            <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Rename Project</DialogTitle>
                        <DialogDescription>
                            Update the project name shown in your vault and workspace.
                        </DialogDescription>
                    </DialogHeader>
                    <Input value={renameValue} onChange={(event) => setRenameValue(event.target.value)} />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={async () => {
                                if (!renameProjectId) return
                                await handleRenameProject(renameProjectId, renameValue)
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
                        <DialogTitle>
                            {deleteTarget?.kind === "dataset" ? "Delete Dataset" : "Delete Project"}
                        </DialogTitle>
                        <DialogDescription>
                            {deleteTarget?.kind === "dataset"
                                ? "This also deletes projects linked to the dataset."
                                : "This permanently removes the project and its saved configuration."}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-muted-foreground">
                        {deleteTarget?.name}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={async () => {
                                if (!deleteTarget) return
                                if (deleteTarget.kind === "dataset") {
                                    await handleDeleteDataset(deleteTarget.id)
                                } else {
                                    await handleDeleteProject(deleteTarget.id)
                                }
                            }}
                        >
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
