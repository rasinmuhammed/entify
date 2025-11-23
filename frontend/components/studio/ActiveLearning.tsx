"use client"

import { useState, useEffect } from "react"
import { motion, useMotionValue, useTransform, AnimatePresence } from "framer-motion"
import { Check, X, Info, Loader2 } from "lucide-react"
import { GlassCard } from "@/components/ui/glass-card"
import { Button } from "@/components/ui/button"
import { useQuery } from "@tanstack/react-query"
import axios from "axios"

interface RecordPair {
    id: string
    score: number
    left: Record<string, any>
    right: Record<string, any>
}

export default function ActiveLearning() {
    const [pairs, setPairs] = useState<RecordPair[]>([])
    const [history, setHistory] = useState<{ id: string, match: boolean }[]>([])

    const { data, isLoading, refetch } = useQuery({
        queryKey: ['active-learning-pairs'],
        queryFn: async () => {
            const res = await axios.get('http://127.0.0.1:8000/active-learning/pairs')
            return res.data.pairs as RecordPair[]
        }
    })

    useEffect(() => {
        if (data) {
            setPairs(data)
        }
    }, [data])

    const handleSwipe = (id: string, match: boolean) => {
        console.log(`Pair ${id} marked as ${match ? "MATCH" : "NON-MATCH"}`)
        setHistory([...history, { id, match }])
        setPairs(pairs.filter(p => p.id !== id))
    }

    if (isLoading) {
        return <div className="flex justify-center p-12"><Loader2 className="animate-spin" /></div>
    }

    if (pairs.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-[400px] text-center space-y-4">
                <div className="p-4 rounded-full bg-green-500/10 text-green-400">
                    <Check className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-semibold">All caught up!</h3>
                <p className="text-muted-foreground max-w-xs">
                    You've reviewed all uncertain matches. The model will be retrained with your feedback.
                </p>
                <Button onClick={() => refetch()}>Check for more</Button>
            </div>
        )
    }

    return (
        <div className="relative w-full max-w-2xl mx-auto h-[500px] flex flex-col items-center">
            <div className="absolute top-0 left-0 right-0 z-10 flex justify-between items-center px-4 py-2">
                <span className="text-sm font-medium text-muted-foreground">
                    Reviewing uncertain matches (0.4 - 0.6)
                </span>
                <span className="text-sm font-bold text-purple-400">
                    {pairs.length} remaining
                </span>
            </div>

            <div className="relative w-full h-full flex items-center justify-center mt-8">
                <AnimatePresence>
                    {pairs.map((pair, index) => (
                        index === 0 ? (
                            <SwipeCard key={pair.id} pair={pair} onSwipe={handleSwipe} />
                        ) : (
                            <CardBack key={pair.id} index={index} />
                        )
                    )).reverse()}
                </AnimatePresence>
            </div>

            <div className="flex gap-8 mt-8">
                <Button
                    size="lg"
                    variant="outline"
                    className="rounded-full w-16 h-16 border-red-500/50 text-red-400 hover:bg-red-500/10 hover:border-red-500"
                    onClick={() => handleSwipe(pairs[0].id, false)}
                >
                    <X className="w-8 h-8" />
                </Button>
                <Button
                    size="lg"
                    variant="outline"
                    className="rounded-full w-16 h-16 border-green-500/50 text-green-400 hover:bg-green-500/10 hover:border-green-500"
                    onClick={() => handleSwipe(pairs[0].id, true)}
                >
                    <Check className="w-8 h-8" />
                </Button>
            </div>
        </div>
    )
}

function SwipeCard({ pair, onSwipe }: { pair: RecordPair, onSwipe: (id: string, match: boolean) => void }) {
    const x = useMotionValue(0)
    const rotate = useTransform(x, [-200, 200], [-10, 10])
    const opacity = useTransform(x, [-200, -100, 0, 100, 200], [0, 1, 1, 1, 0])
    const bg = useTransform(x, [-200, 0, 200], ["rgba(239, 68, 68, 0.2)", "rgba(0,0,0,0)", "rgba(34, 197, 94, 0.2)"])

    const handleDragEnd = (_: any, info: any) => {
        if (info.offset.x > 100) {
            onSwipe(pair.id, true)
        } else if (info.offset.x < -100) {
            onSwipe(pair.id, false)
        }
    }

    return (
        <motion.div
            style={{ x, rotate, opacity, background: bg }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            onDragEnd={handleDragEnd}
            className="absolute w-full max-w-lg cursor-grab active:cursor-grabbing"
        >
            <GlassCard className="p-6 border-white/10 shadow-2xl">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-semibold text-lg">Do these records match?</h3>
                    <span className="px-3 py-1 rounded-full bg-yellow-500/20 text-yellow-400 text-xs font-bold">
                        {(pair.score * 100).toFixed(0)}% Match Score
                    </span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-4">
                        <h4 className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Record A</h4>
                        {Object.entries(pair.left).map(([key, value]) => (
                            <div key={key} className="space-y-1">
                                <span className="text-xs text-muted-foreground capitalize">{key.replace('_', ' ')}</span>
                                <p className="text-sm font-medium truncate" title={String(value)}>{String(value)}</p>
                            </div>
                        ))}
                    </div>

                    <div className="space-y-4 relative">
                        <div className="absolute -left-2 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-white/10 to-transparent" />
                        <h4 className="text-xs font-bold uppercase text-muted-foreground tracking-wider pl-4">Record B</h4>
                        {Object.entries(pair.right).map(([key, value]) => (
                            <div key={key} className="space-y-1 pl-4">
                                <span className="text-xs text-muted-foreground capitalize">{key.replace('_', ' ')}</span>
                                <p className={`text-sm font-medium truncate ${value === pair.left[key] ? 'text-green-400' : 'text-white'}`} title={String(value)}>
                                    {String(value)}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="mt-6 pt-4 border-t border-white/5 flex justify-center text-xs text-muted-foreground">
                    <Info className="w-3 h-3 mr-2" />
                    Swipe right to match, left to reject
                </div>
            </GlassCard>
        </motion.div>
    )
}

function CardBack({ index }: { index: number }) {
    return (
        <div
            className="absolute w-full max-w-lg p-6 rounded-xl border border-white/5 bg-white/5"
            style={{
                transform: `scale(${1 - index * 0.05}) translateY(${index * 10}px)`,
                zIndex: -index,
                opacity: 1 - index * 0.2
            }}
        >
            <div className="h-64" />
        </div>
    )
}
