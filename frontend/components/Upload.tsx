"use client"

import { useState, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { UploadCloud, FileText, CheckCircle, Loader2 } from "lucide-react"
import { GlassCard } from "@/components/ui/glass-card"
import axios from "axios"
import { cn } from "@/lib/utils"
import { supabase } from "@/lib/supabase"
import { useUser } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { useDatasetStore } from "@/lib/store/useDatasetStore"

interface UploadProps {
  onUploadComplete: (tableName: string) => void
}

export function Upload({ onUploadComplete }: UploadProps) {
  const { user } = useUser()
  const router = useRouter()
  const { setActiveDataset } = useDatasetStore()
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await uploadFile(e.dataTransfer.files[0])
    }
  }, [])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await uploadFile(e.target.files[0])
    }
  }

  const uploadFile = async (file: File) => {
    setUploading(true)
    setProgress(0)

    const formData = new FormData()
    formData.append("file", file)

    try {
      const interval = setInterval(() => {
        setProgress((prev) => (prev >= 90 ? 90 : prev + 5))
      }, 100)

      const response = await axios.post("http://127.0.0.1:8000/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      })

      // Sync with Supabase
      if (user) {
        await supabase.from('datasets').insert({
          name: response.data.table_name,
          row_count: response.data.rows,
          user_id: user.id
        })
      }

      // Fetch profile immediately to populate store
      const profileResponse = await axios.get(`http://127.0.0.1:8000/profile/${response.data.table_name}`)

      // Update global store
      setActiveDataset({
        name: response.data.table_name,
        rowCount: response.data.rows,
        columns: profileResponse.data.columns
      })

      clearInterval(interval)
      setProgress(100)

      // Redirect to Data Explorer
      router.push("/data")

      setTimeout(() => {
        setUploading(false)
        onUploadComplete(response.data.table_name)
      }, 800)

    } catch (error) {
      console.error("Upload failed", error)
      setUploading(false)
      alert("Upload failed")
    }
  }

  return (
    <GlassCard className="w-full max-w-2xl mx-auto mt-10 overflow-hidden relative group">
      <div
        className={cn(
          "border-2 border-dashed rounded-lg p-12 text-center transition-all duration-300",
          isDragging ? "border-primary bg-primary/10 scale-[1.02]" : "border-white/20 hover:border-white/40",
          uploading && "opacity-50 pointer-events-none"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          type="file"
          className="hidden"
          id="file-upload"
          accept=".csv,.parquet"
          onChange={handleFileChange}
        />

        <AnimatePresence mode="wait">
          {!uploading ? (
            <motion.label
              htmlFor="file-upload"
              className="cursor-pointer flex flex-col items-center justify-center gap-4"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <div className="p-4 rounded-full bg-white/5 group-hover:bg-white/10 transition-colors">
                <UploadCloud className="w-10 h-10 text-primary" />
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-1">Drop your dataset here</h3>
                <p className="text-muted-foreground text-sm">Support for CSV and Parquet files</p>
              </div>
            </motion.label>
          ) : (
            <motion.div
              className="flex flex-col items-center justify-center gap-4"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <div className="relative">
                <Loader2 className="w-12 h-12 text-primary animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center text-xs font-bold">
                  {progress}%
                </div>
              </div>
              <p className="text-sm font-medium animate-pulse">Ingesting data into DuckDB...</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </GlassCard>
  )
}
