"use client"

import { useState, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { UploadCloud, FileText, CheckCircle, Loader2 } from "lucide-react"
import { GlassCard } from "@/components/ui/glass-card"
import axios from "axios"
import { cn } from "@/lib/utils"
import { createClient } from "@/utils/supabase/client"
import { useUser } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { useDatasetStore } from "@/lib/store/useDatasetStore"
import { useWasm } from "@/lib/wasm/WasmContext"

interface UploadProps {
  onUploadComplete?: (tableName: string) => void
  onDatasetUploaded?: (dataset: any) => void
}

export function Upload({ onUploadComplete, onDatasetUploaded }: UploadProps = {}) {
  const { user } = useUser()
  const router = useRouter()
  const { setActiveDataset } = useDatasetStore()
  const { duckDB, isReady } = useWasm()
  const supabase = createClient()
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
    if (!duckDB || !isReady) {
      alert("Please wait for the database to initialize")
      return
    }

    setUploading(true)
    setProgress(10)

    try {
      const tableName = file.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase().replace(/\.[^/.]+$/, "")

      // 1. Register file in DuckDB
      await duckDB.registerFileHandle(file.name, file, 2, true) // BROWSER_FILEREADER = 2
      setProgress(40)

      // 2. Create table from file
      const conn = await duckDB.connect()
      await conn.query(`DROP TABLE IF EXISTS "${tableName}"`)

      // Determine file type and load
      if (file.name.endsWith('.csv')) {
        await conn.query(`CREATE TABLE "${tableName}" AS SELECT * FROM read_csv_auto('${file.name}')`)
      } else if (file.name.endsWith('.parquet')) {
        await conn.query(`CREATE TABLE "${tableName}" AS SELECT * FROM read_parquet('${file.name}')`)
      } else {
        throw new Error("Unsupported file format")
      }

      setProgress(70)

      // 3. Get stats
      const countResult = await conn.query(`SELECT count(*) as count FROM "${tableName}"`)
      const rowCount = Number(countResult.toArray()[0].count)

      // 4. Get columns and profile data
      const schemaResult = await conn.query(`DESCRIBE "${tableName}"`)
      const rawColumns = schemaResult.toArray().map((row: any) => ({
        name: row.column_name,
        type: row.column_type
      }))

      const columns = []

      // Calculate profile for each column
      for (const col of rawColumns) {
        const profileQuery = `
          SELECT 
            COUNT(*) as total_count,
            COUNT("${col.name}") as non_null_count,
            COUNT(DISTINCT "${col.name}") as unique_count
          FROM "${tableName}"
        `
        const profileResult = await conn.query(profileQuery)
        const stats = profileResult.toArray()[0]

        columns.push({
          column: col.name,
          type: col.type,
          null_percentage: Number(((Number(stats.total_count) - Number(stats.non_null_count)) / Number(stats.total_count) * 100).toFixed(2)),
          unique_count: Number(stats.unique_count)
        })
      }

      await conn.close()

      setProgress(90)

      console.log('📤 Uploading to Supabase...')
      console.log('User ID:', user?.id)

      // 5. Upload file to Supabase Storage for persistence
      const filePathInStorage = `${user?.id}/${tableName}_${Date.now()}.csv`
      const { error: uploadError } = await supabase.storage
        .from('datasets')
        .upload(filePathInStorage, file, {
          cacheControl: '3600',
          upsert: false
        })

      if (uploadError) {
        console.error('❌ Storage upload failed:', uploadError)
        throw new Error(`Failed to upload to storage: ${uploadError.message}`)
      }

      console.log('✅ File uploaded to storage:', filePathInStorage)

      // 6. Insert into Supabase database
      const { data: newDataset, error: insertError } = await supabase
        .from('datasets')
        .insert({
          name: tableName,
          row_count: rowCount,
          columns,
          user_id: user?.id,
          file_path: filePathInStorage
        })
        .select()
        .single()

      if (insertError) {
        console.error('❌ Database insert failed:', insertError)
        throw new Error(`Failed to save dataset: ${insertError.message}`)
      }

      console.log('✅ Dataset saved to database:', newDataset)

      // Update global store
      setActiveDataset({
        name: tableName,
        rowCount: rowCount,
        columns: columns
      })

      setProgress(100)

      // Call callbacks if provided
      onDatasetUploaded?.(newDataset)

      setTimeout(() => {
        setUploading(false)
        onUploadComplete?.(tableName)
      }, 800)

    } catch (error) {
      console.error("❌ Upload failed:", error)
      setUploading(false)
      alert(`Upload failed: ${(error as any).message || 'Unknown error'}`)
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
