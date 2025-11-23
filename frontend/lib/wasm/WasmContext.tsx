"use client"

import React, { createContext, useContext, useEffect, useState } from 'react'
import * as duckdb from '@duckdb/duckdb-wasm'
import { AsyncDuckDB } from '@duckdb/duckdb-wasm'

// Define types for our context
interface WasmContextType {
    duckDB: AsyncDuckDB | null
    pyodide: any | null
    isLoading: boolean
    isReady: boolean
    error: string | null
    runPython: (code: string) => Promise<any>
    runQuery: (query: string) => Promise<any>
}

const WasmContext = createContext<WasmContextType>({
    duckDB: null,
    pyodide: null,
    isLoading: true,
    isReady: false,
    error: null,
    runPython: async () => { },
    runQuery: async () => { },
})

export const useWasm = () => useContext(WasmContext)

interface WasmProviderProps {
    children: React.ReactNode
}

export function WasmProvider({ children }: WasmProviderProps) {
    const [duckDB, setDuckDB] = useState<AsyncDuckDB | null>(null)
    const [pyodide, setPyodide] = useState<any | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        async function initWasm() {
            try {
                // 1. Initialize DuckDB-Wasm
                const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles()
                const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES)

                const worker_url = URL.createObjectURL(
                    new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' })
                )

                const worker = new Worker(worker_url)
                const logger = new duckdb.ConsoleLogger()
                const db = new duckdb.AsyncDuckDB(logger, worker)
                await db.instantiate(bundle.mainModule, bundle.pthreadWorker)
                setDuckDB(db)

                // 2. Initialize Pyodide
                // We need to load the script first. In a real app, we might want to do this more robustly.
                if (!(window as any).loadPyodide) {
                    const script = document.createElement('script')
                    script.src = "https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js"
                    script.async = true
                    document.body.appendChild(script)
                    await new Promise((resolve) => {
                        script.onload = resolve
                    })
                }

                const pyodideInstance = await (window as any).loadPyodide({
                    indexURL: "https://cdn.jsdelivr.net/pyodide/v0.25.0/full/"
                })

                // Install necessary python packages
                await pyodideInstance.loadPackage(['pandas', 'micropip'])

                // Note: Real Splink cannot run in browser due to C-extension dependencies
                // We implement a Splink-compatible engine instead
                console.log('✅ Python environment ready (Splink-compatible mode)')

                // Register JS callbacks for Python
                pyodideInstance.globals.set("js_run_query", async (sql: string) => {
                    if (!db) throw new Error("DuckDB not initialized")
                    const conn = await db.connect()
                    try {
                        const result = await conn.query(sql)
                        // Convert Arrow result to JSON for now (simplest for MVP)
                        // In production, we should pass Arrow buffers directly
                        return result.toArray().map((row: any) => row.toJSON())
                    } finally {
                        await conn.close()
                    }
                })

                setPyodide(pyodideInstance)
                setIsLoading(false)

            } catch (err: any) {
                console.error("Failed to initialize WASM:", err)
                setError(err.message || "Failed to initialize WASM runtimes")
                setIsLoading(false)
            }
        }

        initWasm()
    }, [])

    const runPython = async (code: string) => {
        if (!pyodide) throw new Error("Pyodide not initialized")
        return await pyodide.runPythonAsync(code)
    }

    const runQuery = async (query: string) => {
        if (!duckDB) throw new Error("DuckDB not initialized")
        const conn = await duckDB.connect()
        const result = await conn.query(query)
        await conn.close()
        return result
    }

    return (
        <WasmContext.Provider value={{
            duckDB,
            pyodide,
            isLoading,
            isReady: !!duckDB && !!pyodide,
            error,
            runPython,
            runQuery
        }}>
            {children}
        </WasmContext.Provider>
    )
}
