"use client"

import { useState } from "react"
import { Upload } from "@/components/Upload"
import { DataTable } from "@/components/DataTable"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { GlassCard } from "@/components/ui/glass-card"
import { motion, AnimatePresence } from "framer-motion"
import { Sparkles, Database, FileSpreadsheet, Play, Download, Search } from "lucide-react"
import axios from "axios"
import { ColumnDef } from "@tanstack/react-table"
import { useQuery, useMutation } from "@tanstack/react-query"

export default function Dashboard() {
  const [tableName, setTableName] = useState<string | null>(null)
  const [threshold, setThreshold] = useState([0.5])
  const [results, setResults] = useState<any[]>([])
  const [jobId, setJobId] = useState<string | null>(null)

  // Fetch profile data
  const { data: profile } = useQuery({
    queryKey: ['profile', tableName],
    queryFn: async () => {
      if (!tableName) return null
      const res = await axios.get(`http://127.0.0.1:8000/profile/${tableName}`)
      return res.data
    },
    enabled: !!tableName
  })

  // Match mutation
  const matchMutation = useMutation({
    mutationFn: async () => {
      const settings = {
        link_type: "dedupe_only",
        unique_id_column_name: "id",
        blocking_rules_to_generate_predictions: ["l.city = r.city"],
        threshold: threshold[0]
      }
      const res = await axios.post("http://127.0.0.1:8000/run-match", {
        table_name: tableName,
        settings: settings
      })
      return res.data
    },
    onSuccess: (data) => {
      setJobId(data.job_id)
      pollJob(data.job_id)
    }
  })

  const pollJob = async (id: string) => {
    const interval = setInterval(async () => {
      try {
        const response = await axios.get(`http://127.0.0.1:8000/job/${id}`)
        const status = response.data.status

        if (status === "completed") {
          clearInterval(interval)
          const downloadUrl = response.data.result.download_url
          const csvResponse = await axios.get(`http://127.0.0.1:8000${downloadUrl}`)
          setResults(parseCSV(csvResponse.data))
        } else if (status === "failed") {
          clearInterval(interval)
          alert(`Job failed: ${response.data.result.error}`)
        }
      } catch (error) {
        clearInterval(interval)
      }
    }, 1000)
  }

  const parseCSV = (csvText: string) => {
    const lines = csvText.split("\n")
    const headers = lines[0].split(",")
    const data = []
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i]) continue
      const values = lines[i].split(",")
      const row: any = {}
      headers.forEach((header, index) => {
        row[header.trim()] = values[index]?.trim()
      })
      data.push(row)
    }
    return data
  }

  const columns: ColumnDef<any>[] = results.length > 0
    ? Object.keys(results[0]).map(key => ({
      accessorKey: key,
      header: key,
    }))
    : []

  return (
    <div className="min-h-screen p-8 pb-20">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-6xl mx-auto space-y-12"
      >
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-sm font-medium text-primary-foreground/80">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span>AI-Powered Entity Resolution</span>
          </div>
          <h1 className="text-6xl font-bold tracking-tight gradient-text pb-2">
            Entify
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            The Unified Truth Platform. Democratizing data quality with zero infrastructure.
          </p>
        </div>

        <AnimatePresence mode="wait">
          {!tableName ? (
            <Upload onUploadComplete={setTableName} />
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-8"
            >
              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <GlassCard>
                  <div className="flex items-center gap-4 mb-2">
                    <div className="p-2 rounded-lg bg-blue-500/20 text-blue-400">
                      <Database className="w-5 h-5" />
                    </div>
                    <h3 className="font-medium text-muted-foreground">Total Records</h3>
                  </div>
                  <p className="text-3xl font-bold">{profile?.total_rows.toLocaleString()}</p>
                </GlassCard>

                <GlassCard>
                  <div className="flex items-center gap-4 mb-2">
                    <div className="p-2 rounded-lg bg-purple-500/20 text-purple-400">
                      <FileSpreadsheet className="w-5 h-5" />
                    </div>
                    <h3 className="font-medium text-muted-foreground">Columns</h3>
                  </div>
                  <p className="text-3xl font-bold">{profile?.columns.length}</p>
                </GlassCard>

                <GlassCard>
                  <div className="flex items-center gap-4 mb-2">
                    <div className="p-2 rounded-lg bg-pink-500/20 text-pink-400">
                      <Search className="w-5 h-5" />
                    </div>
                    <h3 className="font-medium text-muted-foreground">Quality Score</h3>
                  </div>
                  <p className="text-3xl font-bold">98%</p>
                </GlassCard>
              </div>

              {/* Controls */}
              <GlassCard className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold">Match Configuration</h2>
                  <span className="text-sm text-muted-foreground">Strictness: {Math.round(threshold[0] * 100)}%</span>
                </div>
                <Slider
                  value={threshold}
                  onValueChange={setThreshold}
                  max={1}
                  step={0.01}
                  className="py-4"
                />
                <Button
                  onClick={() => matchMutation.mutate()}
                  disabled={matchMutation.isPending || !!jobId}
                  className="w-full h-12 text-lg bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 transition-all"
                >
                  {matchMutation.isPending || (jobId && results.length === 0) ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" /> Resolving Entities...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Play className="w-5 h-5" /> Run Entity Resolution
                    </span>
                  )}
                </Button>
              </GlassCard>

              {/* Results */}
              {results.length > 0 && (
                <GlassCard>
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-semibold">Resolution Results</h2>
                    <Button variant="outline" className="gap-2">
                      <Download className="w-4 h-4" /> Export CSV
                    </Button>
                  </div>
                  <DataTable columns={columns} data={results} />
                </GlassCard>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}

import { Loader2 } from "lucide-react"
