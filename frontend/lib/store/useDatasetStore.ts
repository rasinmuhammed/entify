import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface ColumnProfile {
    column: string
    type: string
    null_percentage: number
    unique_count: number
}

export interface DatasetProfile {
    name: string
    rowCount: number
    columns: ColumnProfile[]
    file_path?: string  // Path to the dataset file in storage
}

export interface Project {
    id: string
    name: string
    description?: string
    status: 'draft' | 'processing' | 'completed'
    step: 'overview' | 'configure' | 'process' | 'review'
    dataset_id: string
    configuration?: any
    created_at: string
}

interface DatasetStore {
    activeDataset: DatasetProfile | null
    activeProject: Project | null
    setActiveDataset: (dataset: DatasetProfile) => void
    setActiveProject: (project: Project) => void
    clearDataset: () => void
    clearProject: () => void
}

export const useDatasetStore = create<DatasetStore>()(
    persist(
        (set) => ({
            activeDataset: null,
            activeProject: null,
            setActiveDataset: (dataset) => set({ activeDataset: dataset }),
            setActiveProject: (project) => set({ activeProject: project }),
            clearDataset: () => set({ activeDataset: null }),
            clearProject: () => set({ activeProject: null }),
        }),
        {
            name: 'dataset-storage',
        }
    )
)
