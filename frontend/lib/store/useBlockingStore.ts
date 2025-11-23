import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { v4 as uuidv4 } from 'uuid'

export type MatchMethod = "exact" | "fuzzy_levenshtein" | "fuzzy_metaphone" | "first_n_chars" | "jaro_winkler"

export interface ComparisonPart {
    id: string
    field: string
    method: MatchMethod
    parameters?: { n?: number }
}

export interface BlockingRule {
    id: string
    parts: ComparisonPart[]
}

interface BlockingStore {
    rules: BlockingRule[]
    addRule: () => void
    removeRule: (id: string) => void
    addPartToRule: (ruleId: string) => void
    removePartFromRule: (ruleId: string, partId: string) => void
    updatePart: (ruleId: string, partId: string, updates: Partial<ComparisonPart>) => void
    reorderRules: (rules: BlockingRule[]) => void
}

export const useBlockingStore = create<BlockingStore>()(
    persist(
        (set) => ({
            rules: [
                {
                    id: uuidv4(),
                    parts: [{ id: uuidv4(), field: "", method: "exact" }]
                }
            ],
            addRule: () => set((state) => ({
                rules: [...state.rules, {
                    id: uuidv4(),
                    parts: [{ id: uuidv4(), field: "", method: "exact" }]
                }]
            })),
            removeRule: (id) => set((state) => ({
                rules: state.rules.filter((r) => r.id !== id)
            })),
            addPartToRule: (ruleId) => set((state) => ({
                rules: state.rules.map((r) =>
                    r.id === ruleId
                        ? { ...r, parts: [...r.parts, { id: uuidv4(), field: "", method: "exact" }] }
                        : r
                )
            })),
            removePartFromRule: (ruleId, partId) => set((state) => ({
                rules: state.rules.map((r) =>
                    r.id === ruleId
                        ? { ...r, parts: r.parts.filter(p => p.id !== partId) }
                        : r
                )
            })),
            updatePart: (ruleId, partId, updates) => set((state) => ({
                rules: state.rules.map((r) =>
                    r.id === ruleId
                        ? {
                            ...r,
                            parts: r.parts.map(p => p.id === partId ? { ...p, ...updates } : p)
                        }
                        : r
                )
            })),
            reorderRules: (rules) => set({ rules })
        }),
        {
            name: 'blocking-rules-storage',
        }
    )
)
