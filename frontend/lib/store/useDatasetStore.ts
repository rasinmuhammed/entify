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
}

interface DatasetStore {
    activeDataset: DatasetProfile | null
    setActiveDataset: (dataset: DatasetProfile) => void
    clearDataset: () => void
}

export const useDatasetStore = create<DatasetStore>()(
    persist(
        (set) => ({
            activeDataset: null,
            setActiveDataset: (dataset) => set({ activeDataset: dataset }),
            clearDataset: () => set({ activeDataset: null }),
        }),
        {
            name: 'dataset-storage',
        }
    )
)
