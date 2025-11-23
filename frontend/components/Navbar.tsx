"use client"

import { UserButton } from "@clerk/nextjs"
import { usePathname } from "next/navigation"

export function Navbar() {
    const pathname = usePathname()
    const pathSegments = pathname.split('/').filter(Boolean)

    return (
        <div className="flex items-center p-4 border-b border-white/10 bg-black/20 backdrop-blur-lg">
            <div className="flex-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>Entify</span>
                    <span>/</span>
                    <span className="text-white font-medium capitalize">
                        {pathSegments.length === 0 ? 'Dashboard' : pathSegments[pathSegments.length - 1]}
                    </span>
                </div>
            </div>
            <div className="flex items-center gap-x-4">
                <UserButton afterSignOutUrl="/" />
            </div>
        </div>
    )
}
