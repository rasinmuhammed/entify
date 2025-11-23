"use client"

import { useEffect, useState } from "react"
import { GlassCard } from "@/components/ui/glass-card"
import { supabase } from "@/lib/supabase"
import { useUser } from "@clerk/nextjs"
import { Loader2, CheckCircle, XCircle, Clock } from "lucide-react"
import { formatDistanceToNow } from "date-fns"

export default function HistoryPage() {
    const { user } = useUser()
    const [jobs, setJobs] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function fetchHistory() {
            if (!user) return

            const { data, error } = await supabase
                .from('jobs')
                .select(`
          *,
          datasets (name)
        `)
                .order('created_at', { ascending: false })

            if (error) {
                console.error("Error fetching history:", JSON.stringify(error, null, 2))
                alert(`Error fetching history: ${error.message || JSON.stringify(error)}`)
            } else {
                setJobs(data || [])
            }
            setLoading(false)
        }

        fetchHistory()
    }, [user])

    return (
        <div className="p-8 space-y-8">
            <h1 className="text-3xl font-bold gradient-text">Match History</h1>

            {loading ? (
                <div className="flex justify-center p-12">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
            ) : (
                <div className="grid gap-4">
                    {jobs.length === 0 ? (
                        <GlassCard className="text-center p-12 text-muted-foreground">
                            No history found. Run a match to see it here.
                        </GlassCard>
                    ) : (
                        jobs.map((job) => (
                            <GlassCard key={job.id} className="flex items-center justify-between p-6">
                                <div className="flex items-center gap-4">
                                    <div className="p-2 rounded-full bg-white/5">
                                        {job.status === 'completed' && <CheckCircle className="w-5 h-5 text-green-500" />}
                                        {job.status === 'failed' && <XCircle className="w-5 h-5 text-red-500" />}
                                        {job.status === 'running' && <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />}
                                        {job.status === 'pending' && <Clock className="w-5 h-5 text-yellow-500" />}
                                    </div>
                                    <div>
                                        <h3 className="font-medium">{job.datasets?.name || "Unknown Dataset"}</h3>
                                        <p className="text-xs text-muted-foreground">
                                            {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <span className="text-sm font-mono bg-white/10 px-2 py-1 rounded">
                                        {job.job_id.substring(0, 8)}
                                    </span>
                                </div>
                            </GlassCard>
                        ))
                    )}
                </div>
            )}
        </div>
    )
}
