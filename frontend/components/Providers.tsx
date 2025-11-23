"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState } from "react"
import { WasmProvider } from "@/lib/wasm/WasmContext"

export default function Providers({ children }: { children: React.ReactNode }) {
    const [queryClient] = useState(() => new QueryClient())

    return (
        <QueryClientProvider client={queryClient}>
            <WasmProvider>
                {children}
            </WasmProvider>
        </QueryClientProvider>
    )
}
