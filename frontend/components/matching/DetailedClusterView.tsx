"use client"

import { useMemo } from 'react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import Cytoscape from 'cytoscape'
import CytoscapeComponent from 'react-cytoscapejs'

interface Entity {
    [key: string]: any
}

interface ClusterLink {
    source: string
    target: string
    score: number
}

interface DetailedClusterViewProps {
    isOpen: boolean
    onClose: () => void
    cluster: {
        id: number
        cluster_id: string
        entities: Entity[]
        entityIds: string[]
        links: ClusterLink[]
        avgScore: number
    } | null
}

export function DetailedClusterView({
    isOpen,
    onClose,
    cluster
}: DetailedClusterViewProps) {
    // Prepare data for Cytoscape network visualization
    const graphData = useMemo(() => {
        if (!cluster) return { nodes: [], edges: [] }

        // Create nodes from entities
        const nodes = cluster.entityIds.map((id, idx) => ({
            data: {
                id,
                label: id,
                entity: cluster.entities[idx]
            }
        }))

        // Create edges from links
        const edges = cluster.links.map((link, idx) => ({
            data: {
                id: `edge-${idx}`,
                source: link.source,
                target: link.target,
                weight: link.score,
                label: `${(link.score * 100).toFixed(0)}%`
            }
        }))

        return { nodes, edges }
    }, [cluster])

    const cytoscapeStylesheet = [
        {
            selector: 'node',
            style: {
                'background-color': '#3b82f6',
                'label': 'data(label)',
                'color': '#fff',
                'text-valign': 'center',
                'text-halign': 'center',
                'font-size': '10px',
                'width': '40px',
                'height': '40px'
            }
        },
        {
            selector: 'edge',
            style: {
                'width': 'mapData(weight, 0, 1, 1, 5)',
                'line-color': '#10b981',
                'target-arrow-color': '#10b981',
                'target-arrow-shape': 'triangle',
                'curve-style': 'bezier',
                'label': 'data(label)',
                'font-size': '8px',
                'text-rotation': 'autorotate',
                'text-margin-y': '-10px'
            }
        }
    ]

    const cytoscapeLayout = {
        name: 'circle',
        fit: true,
        padding: 30,
        animate: true,
        animationDuration: 500
    }

    if (!cluster) return null

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-6xl max-h-[90vh] overflow-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        Cluster #{cluster.id + 1} - Detailed Network View
                        <Badge variant="secondary">{cluster.entities.length} entities</Badge>
                    </DialogTitle>
                    <DialogDescription>
                        Cluster ID: {cluster.cluster_id} | Avg Match Score: {(cluster.avgScore * 100).toFixed(1)}%
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Network Visualization */}
                    <Card>
                        <CardContent className="p-4">
                            <div className="h-[400px] border rounded-lg overflow-hidden">
                                <CytoscapeComponent
                                    elements={[...graphData.nodes, ...graphData.edges]}
                                    style={{ width: '100%', height: '100%' }}
                                    stylesheet={cytoscapeStylesheet as any}
                                    layout={cytoscapeLayout}
                                />
                            </div>
                            <div className="mt-2 text-xs text-muted-foreground text-center">
                                Node = Entity | Edge = Match Connection | Edge thickness = Match probability
                            </div>
                        </CardContent>
                    </Card>

                    {/* Entity Details */}
                    <Card>
                        <CardContent className="p-4">
                            <h3 className="font-semibold mb-3">All Entities in This Cluster</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto">
                                {cluster.entities.map((entity, idx) => {
                                    const displayFields = Object.entries(entity)
                                        .filter(([key]) => !key.includes('_id') && !key.startsWith('_'))
                                        .slice(0, 5)

                                    return (
                                        <div
                                            key={idx}
                                            className="p-3 border rounded-lg bg-muted/30 space-y-1"
                                        >
                                            <div className="flex items-center justify-between mb-2">
                                                <Badge variant="outline" className="text-xs">
                                                    {cluster.entityIds[idx]}
                                                </Badge>
                                                <Badge variant="secondary" className="text-xs">
                                                    Entity {idx + 1}
                                                </Badge>
                                            </div>
                                            {displayFields.map(([key, value]) => (
                                                <div key={key} className="flex justify-between text-xs">
                                                    <span className="text-muted-foreground">{key}:</span>
                                                    <span className="font-medium truncate ml-2 max-w-[200px]">
                                                        {String(value || '-')}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )
                                })}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Link Details */}
                    <Card>
                        <CardContent className="p-4">
                            <h3 className="font-semibold mb-3">Match Connections ({cluster.links.length})</h3>
                            <div className="space-y-2 max-h-[200px] overflow-y-auto">
                                {cluster.links.map((link, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-2 bg-muted/30 rounded text-xs">
                                        <div className="flex items-center gap-2">
                                            <Badge variant="outline">{link.source}</Badge>
                                            <span className="text-muted-foreground">↔</span>
                                            <Badge variant="outline">{link.target}</Badge>
                                        </div>
                                        <Badge
                                            variant={link.score > 0.8 ? 'default' : link.score > 0.6 ? 'secondary' : 'outline'}
                                        >
                                            {(link.score * 100).toFixed(1)}%
                                        </Badge>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </DialogContent>
        </Dialog>
    )
}
