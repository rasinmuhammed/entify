"use client"

import { useState, useMemo, useEffect } from 'react'
import { GlassCard } from '@/components/ui/glass-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
    Network,
    Users,
    TrendingUp,
    Filter,
    Download,
    Maximize2,
    Link as LinkIcon,
    Eye,
    EyeOff
} from 'lucide-react'
import { SplinkVisualization } from './SplinkVisualization'
import { DetailedClusterView } from './DetailedClusterView'
import { AsyncDuckDB } from '@duckdb/duckdb-wasm'

interface Entity {
    [key: string]: any
    _id?: string
    _original_id?: string  // ID from original dataset
}

interface Match {
    left_id: string
    right_id: string
    match_probability: number
    left_entity: Entity
    right_entity: Entity
}

interface Cluster {
    id: number
    cluster_id: string  // Unique cluster identifier
    entities: Entity[]
    entityIds: string[]  // IDs of entities in this cluster
    size: number
    avgScore: number
    links: Array<{ source: string; target: string; score: number }>
}

interface ClusterVisualizationProps {
    matches: any[] // Accept raw Splink output
    threshold?: number
    onExport?: () => void
    duckDB?: AsyncDuckDB | null  // For fetching original data
    originalTableName?: string
}

export function ClusterVisualization({
    matches: rawMatches,
    threshold = 0.5,
    onExport,
    duckDB,
    originalTableName
}: ClusterVisualizationProps) {
    const [minScore, setMinScore] = useState(threshold)
    const [selectedCluster, setSelectedCluster] = useState<number | null>(null)
    const [viewMode, setViewMode] = useState<'clusters' | 'network' | 'table'>('clusters')
    const [showDetails, setShowDetails] = useState(true)
    const [showClusterDetail, setShowClusterDetail] = useState(false)
    const [originalDataMap, setOriginalDataMap] = useState<Map<string, Entity>>(new Map())

    // Parse matches into structured format
    const matches = useMemo(() => {
        return rawMatches.map(m => {
            // If already structured, return as is
            if (m.left_entity && m.right_entity) return m as Match

            // Parse flat Splink output
            const left_entity: Entity = {}
            const right_entity: Entity = {}

            Object.keys(m).forEach(key => {
                if (key.endsWith('_l')) {
                    const field = key.slice(0, -2)
                    left_entity[field] = m[key]
                } else if (key.endsWith('_r')) {
                    const field = key.slice(0, -2)
                    right_entity[field] = m[key]
                }
            })

            // Extract IDs with better fallback logic
            const left_id = String(
                m.unique_id_l ||
                left_entity.unique_id ||
                left_entity.id ||
                m.id_l ||
                `left_${Math.random()}` // Fallback to prevent missing IDs
            )

            const right_id = String(
                m.unique_id_r ||
                right_entity.unique_id ||
                right_entity.id ||
                m.id_r ||
                `right_${Math.random()}` // Fallback to prevent missing IDs
            )

            return {
                left_id,
                right_id,
                match_probability: m.match_probability,
                left_entity: { ...left_entity, _id: left_id }, // Add ID to entity
                right_entity: { ...right_entity, _id: right_id }
            }
        })
    }, [rawMatches])

    // Build clusters from matches using union-find algorithm
    const clusters = useMemo(() => {
        const filteredMatches = matches.filter(m => m.match_probability >= minScore)

        // Union-find data structure
        const parent = new Map<string, string>()
        const rank = new Map<string, number>()

        const find = (x: string): string => {
            if (!parent.has(x)) {
                parent.set(x, x)
                rank.set(x, 0)
            }
            if (parent.get(x) !== x) {
                parent.set(x, find(parent.get(x)!))
            }
            return parent.get(x)!
        }

        const union = (x: string, y: string) => {
            const rootX = find(x)
            const rootY = find(y)

            if (rootX === rootY) return

            const rankX = rank.get(rootX) || 0
            const rankY = rank.get(rootY) || 0

            if (rankX < rankY) {
                parent.set(rootX, rootY)
            } else if (rankX > rankY) {
                parent.set(rootY, rootX)
            } else {
                parent.set(rootY, rootX)
                rank.set(rootX, rankX + 1)
            }
        }

        // Build clusters - store entities by ID to avoid duplicates
        const entityMap = new Map<string, Entity>()
        const clusterLinks = new Map<string, Array<{ source: string; target: string; score: number }>>()

        filteredMatches.forEach(match => {
            const leftId = String(match.left_id)
            const rightId = String(match.right_id)

            // Only add each unique entity once
            if (!entityMap.has(leftId)) {
                entityMap.set(leftId, match.left_entity)
            }
            if (!entityMap.has(rightId)) {
                entityMap.set(rightId, match.right_entity)
            }

            union(leftId, rightId)

            const root = find(leftId)
            if (!clusterLinks.has(root)) {
                clusterLinks.set(root, [])
            }
            clusterLinks.get(root)!.push({
                source: leftId,
                target: rightId,
                score: match.match_probability
            })
        })

        // Group entities by cluster
        const clusterGroups = new Map<string, Entity[]>()
        const clusterEntityIds = new Map<string, string[]>()

        entityMap.forEach((entity, id) => {
            const root = find(id)
            if (!clusterGroups.has(root)) {
                clusterGroups.set(root, [])
                clusterEntityIds.set(root, [])
            }
            clusterGroups.get(root)!.push(entity)
            clusterEntityIds.get(root)!.push(id)
        })

        // Convert to cluster objects
        const clusterArray: Cluster[] = []
        let clusterId = 0

        clusterGroups.forEach((entities, root) => {
            const links = clusterLinks.get(root) || []
            const avgScore = links.length > 0
                ? links.reduce((sum, l) => sum + l.score, 0) / links.length
                : 0

            const entityIds = clusterEntityIds.get(root) || []
            const cluster_id = `cluster_${clusterId}_${Date.now()}`

            clusterArray.push({
                id: clusterId++,
                cluster_id,
                entities,
                entityIds,
                size: entities.length,
                avgScore,
                links
            })
        })

        return clusterArray.sort((a, b) => b.size - a.size)
    }, [matches, minScore])

    const stats = {
        totalClusters: clusters.length,
        totalEntities: clusters.reduce((sum, c) => sum + c.size, 0),
        avgClusterSize: clusters.length > 0
            ? (clusters.reduce((sum, c) => sum + c.size, 0) / clusters.length).toFixed(1)
            : '0',
        largestCluster: clusters.length > 0 ? Math.max(...clusters.map(c => c.size)) : 0
    }

    // Fetch original data from DuckDB if available
    useEffect(() => {
        if (duckDB && originalTableName && clusters.length > 0) {
            fetchOriginalData()
        }
    }, [duckDB, originalTableName, clusters])

    const fetchOriginalData = async () => {
        if (!duckDB || !originalTableName) return

        try {
            const conn = await duckDB.connect()

            // Get all unique entity IDs from clusters
            const allEntityIds = new Set<string>()
            clusters.forEach(cluster => {
                cluster.entityIds.forEach(id => allEntityIds.add(id))
            })

            // Fetch original data for these IDs
            const idList = Array.from(allEntityIds).map(id => `'${id}'`).join(',')
            const query = `SELECT * FROM ${originalTableName} WHERE id IN (${idList})`

            const result = await conn.query(query)
            const rows = result.toArray().map(row => row.toJSON())

            // Build map of ID -> original entity
            const dataMap = new Map<string, Entity>()
            rows.forEach(row => {
                const id = String(row.id || row.unique_id)
                dataMap.set(id, row)
            })

            setOriginalDataMap(dataMap)
            await conn.close()
        } catch (error) {
            console.error('Failed to fetch original data:', error)
        }
    }

    // Export cluster mappings as CSV
    const exportClusterMappings = () => {
        const rows: string[][] = [['entity_id', 'cluster_id', 'cluster_number', 'cluster_size']]

        clusters.forEach(cluster => {
            cluster.entityIds.forEach(entityId => {
                rows.push([
                    entityId,
                    cluster.cluster_id,
                    String(cluster.id + 1),
                    String(cluster.size)
                ])
            })
        })

        const csv = rows.map(row => row.join(',')).join('\n')
        const blob = new Blob([csv], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `cluster_mappings_${Date.now()}.csv`
        a.click()
        URL.revokeObjectURL(url)
    }

    // Get entity display data (use original if available, fallback to match data)
    const getEntityDisplay = (entity: Entity): Entity => {
        const entityId = entity._id || entity.id || entity.unique_id
        if (originalDataMap.has(String(entityId))) {
            return originalDataMap.get(String(entityId))!
        }
        return entity
    }

    return (
        <div className="space-y-6">
            {/* Header with Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <GlassCard className="p-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                        <Network className="w-4 h-4" />
                        Total Clusters
                    </div>
                    <div className="text-2xl font-bold">{stats.totalClusters}</div>
                </GlassCard>

                <GlassCard className="p-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                        <Users className="w-4 h-4" />
                        Total Entities
                    </div>
                    <div className="text-2xl font-bold">{stats.totalEntities}</div>
                </GlassCard>

                <GlassCard className="p-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                        <TrendingUp className="w-4 h-4" />
                        Avg Cluster Size
                    </div>
                    <div className="text-2xl font-bold">{stats.avgClusterSize}</div>
                </GlassCard>

                <GlassCard className="p-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                        <Maximize2 className="w-4 h-4" />
                        Largest Cluster
                    </div>
                    <div className="text-2xl font-bold">{stats.largestCluster}</div>
                </GlassCard>
            </div>

            {/* Controls */}
            <GlassCard className="p-4">
                <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                        <Filter className="w-4 h-4 text-muted-foreground" />
                        <label className="text-sm font-medium">Min Score:</label>
                        <Input
                            type="number"
                            min="0"
                            max="1"
                            step="0.05"
                            value={minScore}
                            onChange={(e) => setMinScore(parseFloat(e.target.value))}
                            className="w-24"
                        />
                        <span className="text-sm text-muted-foreground">{(minScore * 100).toFixed(0)}%</span>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowDetails(!showDetails)}
                        >
                            {showDetails ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
                            {showDetails ? 'Hide' : 'Show'} Details
                        </Button>

                        <Button variant="outline" size="sm" onClick={exportClusterMappings}>
                            <Download className="w-4 h-4 mr-2" />
                            Download Mappings
                        </Button>

                        {onExport && (
                            <Button variant="outline" size="sm" onClick={onExport}>
                                <Download className="w-4 h-4 mr-2" />
                                Export All
                            </Button>
                        )}
                    </div>
                </div>
            </GlassCard>

            {/* View Tabs */}
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)}>
                <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="clusters">
                        <Network className="w-4 h-4 mr-2" />
                        Clusters
                    </TabsTrigger>
                    <TabsTrigger value="network">
                        <LinkIcon className="w-4 h-4 mr-2" />
                        Network
                    </TabsTrigger>
                    <TabsTrigger value="table">
                        <Users className="w-4 h-4 mr-2" />
                        Table
                    </TabsTrigger>
                    <TabsTrigger value="insights">
                        <TrendingUp className="w-4 h-4 mr-2" />
                        Model Insights
                    </TabsTrigger>
                </TabsList>

                {/* Cluster View */}
                <TabsContent value="clusters" className="mt-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {clusters.map((cluster) => (
                            <GlassCard
                                key={cluster.id}
                                className={`p-4 cursor-pointer transition-all hover:scale-[1.02] ${selectedCluster === cluster.id ? 'ring-2 ring-primary' : ''
                                    }`}
                                onClick={() => setSelectedCluster(cluster.id)}
                            >
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <Badge variant="secondary">
                                            Cluster #{cluster.id + 1}
                                        </Badge>
                                        <Badge variant="outline">
                                            {cluster.size} entities
                                        </Badge>
                                    </div>
                                    <div className="text-sm">
                                        Avg: <span className="font-semibold">{(cluster.avgScore * 100).toFixed(0)}%</span>
                                    </div>
                                </div>

                                {showDetails && (
                                    <div className="space-y-2">
                                        {cluster.entities.slice(0, 3).map((entity, idx) => {
                                            // Get original data if available
                                            const displayEntity = getEntityDisplay(entity)

                                            // Filter out ID columns and internal fields
                                            const displayFields = Object.entries(displayEntity)
                                                .filter(([key]) => !key.includes('id') && !key.includes('_') && !key.endsWith('_clean'))
                                                .slice(0, 3)

                                            return (
                                                <div
                                                    key={idx}
                                                    className="p-2 bg-background/50 rounded text-xs space-y-1"
                                                >
                                                    <div className="flex items-center justify-between mb-1">
                                                        <Badge variant="outline" className="text-xs">
                                                            ID: {cluster.entityIds[idx] || 'N/A'}
                                                        </Badge>
                                                        {originalDataMap.size > 0 && (
                                                            <Badge variant="secondary" className="text-xs">
                                                                Original
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    {displayFields.map(([key, value]) => {
                                                        const cleanValue = entity[`${key}_clean`]
                                                        const hasCleaned = cleanValue && cleanValue !== value

                                                        return (
                                                            <div key={key} className="flex flex-col">
                                                                <div className="flex justify-between">
                                                                    <span className="text-muted-foreground">{key}:</span>
                                                                    <span className={`font-medium truncate ml-2 max-w-[200px] ${hasCleaned ? 'line-through text-muted-foreground/70' : ''}`}>
                                                                        {String(value)}
                                                                    </span>
                                                                </div>
                                                                {hasCleaned && (
                                                                    <div className="flex justify-between">
                                                                        <span className="text-muted-foreground opacity-0">{key}:</span>
                                                                        <span className="font-medium truncate ml-2 max-w-[200px] text-green-600 dark:text-green-400">
                                                                            {String(cleanValue)}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            )
                                        })}
                                        {cluster.size > 3 && (
                                            <div className="text-xs text-muted-foreground text-center py-1">
                                                +{cluster.size - 3} more entities
                                            </div>
                                        )}
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="w-full mt-2"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                setSelectedCluster(cluster.id)
                                                setShowClusterDetail(true)
                                            }}
                                        >
                                            View Detailed Network
                                        </Button>
                                    </div>
                                )}
                            </GlassCard>
                        ))}
                    </div>
                </TabsContent>

                {/* Network View */}
                <TabsContent value="network" className="mt-6">
                    <GlassCard className="p-6">
                        <div className="text-center py-12 text-muted-foreground">
                            <Network className="w-16 h-16 mx-auto mb-4 opacity-50" />
                            <p className="text-lg font-medium mb-2">Network Graph Visualization</p>
                            <p className="text-sm">
                                Interactive network graph coming soon. Will show entity connections with D3.js or vis.js.
                            </p>
                        </div>
                    </GlassCard>
                </TabsContent>

                {/* Table View */}
                <TabsContent value="table" className="mt-6">
                    <GlassCard className="overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-muted sticky top-0">
                                    <tr>
                                        <th className="px-4 py-2 text-left">Cluster</th>
                                        <th className="px-4 py-2 text-left">Size</th>
                                        <th className="px-4 py-2 text-left">Avg Score</th>
                                        <th className="px-4 py-2 text-left">Entities</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {clusters.map((cluster) => (
                                        <tr key={cluster.id} className="border-t hover:bg-muted/50">
                                            <td className="px-4 py-2">
                                                <Badge variant="secondary">#{cluster.id + 1}</Badge>
                                            </td>
                                            <td className="px-4 py-2">{cluster.size}</td>
                                            <td className="px-4 py-2">
                                                <Badge variant="outline">
                                                    {(cluster.avgScore * 100).toFixed(0)}%
                                                </Badge>
                                            </td>
                                            <td className="px-4 py-2">
                                                <div className="max-w-md truncate">
                                                    {cluster.entities.map((e, i) =>
                                                        Object.values(e)[1] || Object.values(e)[0]
                                                    ).join(', ')}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </GlassCard>
                </TabsContent>

                {/* Model Insights View */}
                <TabsContent value="insights" className="mt-6">
                    <SplinkVisualization
                        type="match_weights"
                        title="Match Weights Analysis"
                        description="Understand which fields contribute most to the matching decision."
                    />
                </TabsContent>
            </Tabs>

            {/* Detailed Cluster View Modal */}
            <DetailedClusterView
                isOpen={showClusterDetail}
                onClose={() => setShowClusterDetail(false)}
                cluster={selectedCluster !== null ? clusters.find(c => c.id === selectedCluster) || null : null}
            />
        </div>
    )
}
