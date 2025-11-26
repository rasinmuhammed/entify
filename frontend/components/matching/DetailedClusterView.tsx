"use client"

import { useMemo, useState } from 'react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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
    tableName?: string
}

export function DetailedClusterView({
    isOpen,
    onClose,
    cluster,
    tableName = "input_data"
}: DetailedClusterViewProps) {
    const [selectedLink, setSelectedLink] = useState<ClusterLink | null>(null)
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
                                    cy={(cy: any) => {
                                        cy.on('tap', 'edge', (evt: any) => {
                                            const edge = evt.target
                                            const source = edge.data('source')
                                            const target = edge.data('target')
                                            const link = cluster?.links.find(l => l.source === source && l.target === target)
                                            if (link) setSelectedLink(link)
                                        })
                                    }}
                                />
                            </div>
                            <div className="mt-2 text-xs text-muted-foreground text-center">
                                Click on a connection line to view the Match Waterfall Chart
                            </div>
                        </CardContent>
                    </Card>

                    {/* Waterfall Chart for Selected Link */}
                    {selectedLink && (
                        <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="font-semibold flex items-center gap-2">
                                        <Badge variant="outline">{selectedLink.source}</Badge>
                                        <span className="text-muted-foreground">vs</span>
                                        <Badge variant="outline">{selectedLink.target}</Badge>
                                        <Badge className="ml-2 bg-blue-600">
                                            {(selectedLink.score * 100).toFixed(1)}% Match
                                        </Badge>
                                    </h3>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setSelectedLink(null)}
                                        className="h-6 w-6 p-0"
                                    >
                                        ×
                                    </Button>
                                </div>
                                <div className="h-[500px] bg-white rounded-lg border overflow-hidden">
                                    <iframe
                                        src={`http://localhost:8000/api/waterfall-chart?table_name=${tableName}&record_id_1=${selectedLink.source}&record_id_2=${selectedLink.target}`}
                                        className="w-full h-full border-0"
                                        title="Match Waterfall Chart"
                                    />
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Entity Details */}
                    <Card>
                        <CardContent className="p-4">
                            <h3 className="font-semibold mb-3">All Entities in This Cluster</h3>

                            {/* Show cluster_id prominently */}
                            {cluster.cluster_id && (
                                <div className="mb-3 p-3 bg-purple-50 dark:bg-purple-950/30 rounded-lg">
                                    <div className="text-sm font-semibold text-purple-600 dark:text-purple-400">
                                        Cluster ID
                                    </div>
                                    <div className="text-xs font-mono mt-1">
                                        {cluster.cluster_id}
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto">
                                {cluster.entities.map((entity, idx) => {
                                    // Show ALL fields including IDs
                                    const displayFields = Object.entries(entity)
                                        .filter(([key]) => !key.startsWith('_') || key === '_id')
                                        .filter(([key]) => !key.endsWith('_clean'))

                                    return (
                                        <div
                                            key={idx}
                                            className="p-3 border rounded-lg bg-muted/30 space-y-1.5"
                                        >
                                            <div className="flex items-center justify-between mb-2 pb-2 border-b">
                                                <Badge variant="outline" className="text-xs">
                                                    {cluster.entityIds[idx]}
                                                </Badge>
                                                <Badge variant="secondary" className="text-xs">
                                                    Entity {idx + 1}
                                                </Badge>
                                            </div>

                                            {/* Show entity's cluster_id if present */}
                                            {entity.cluster_id && (
                                                <div className="bg-purple-50 dark:bg-purple-950/30 p-2 rounded text-xs mb-2">
                                                    <span className="text-muted-foreground font-medium">cluster_id:</span>
                                                    <span className="ml-2 font-mono text-purple-600 dark:text-purple-400">
                                                        {entity.cluster_id}
                                                    </span>
                                                </div>
                                            )}

                                            <div className="space-y-1 max-h-[200px] overflow-y-auto">
                                                {displayFields.map(([key, value]) => {
                                                    const isIdField = key.toLowerCase().includes('id') || key === '_id'

                                                    return (
                                                        <div key={key} className={`flex justify-between text-xs gap-2 ${isIdField ? 'bg-blue-50 dark:bg-blue-950/30 p-1.5 rounded' : ''
                                                            }`}>
                                                            <span className={`font-medium ${isIdField ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground'
                                                                }`}>
                                                                {key}:
                                                            </span>
                                                            <span className={`text-right break-all max-w-[200px] ${isIdField
                                                                ? 'font-mono text-blue-600 dark:text-blue-400'
                                                                : 'font-medium'
                                                                }`}>
                                                                {String(value || '-')}
                                                            </span>
                                                        </div>
                                                    )
                                                })}
                                            </div>
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
