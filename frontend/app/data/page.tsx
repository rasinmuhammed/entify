"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

export default function DataRedirect() {
    const router = useRouter()

    useEffect(() => {
        // Redirect to vault - data explorer is now in project workspace
        router.replace('/vault')
    }, [router])

    return (
        <div className="flex items-center justify-center min-h-screen">
            <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
                <p className="text-muted-foreground">Redirecting to Data Vault...</p>
            </div>
        </div>
    )
}
