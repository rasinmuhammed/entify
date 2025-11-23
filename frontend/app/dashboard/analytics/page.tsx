"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

export default function AnalyticsRedirect() {
    const router = useRouter()

    useEffect(() => {
        // Redirect to home - analytics moved to project-level
        router.replace('/')
    }, [router])

    return (
        <div className="flex items-center justify-center min-h-screen">
            <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
                <p className="text-muted-foreground">Redirecting...</p>
            </div>
        </div>
    )
}
