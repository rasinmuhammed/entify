"use client"

import { UserButton } from "@clerk/nextjs"
import { usePathname } from "next/navigation"
import { Moon, Sun, Database } from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export function Navbar() {
    const pathname = usePathname()
    const { theme, setTheme } = useTheme()
    const pathSegments = pathname.split('/').filter(Boolean)

    // Get the current page name
    const currentPage = pathSegments.length === 0
        ? 'Dashboard'
        : pathSegments[pathSegments.length - 1].replace(/-/g, ' ')

    return (
        <div className="sticky top-0 z-50 flex items-center justify-between px-6 py-3 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            {/* Left: Logo and Breadcrumb */}
            <div className="flex items-center gap-4">
                <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600">
                        <Database className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                        Entify
                    </span>
                </Link>

                {/* Breadcrumb - only show if not on home */}
                {pathSegments.length > 0 && (
                    <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">/</span>
                        <span className="text-foreground font-medium capitalize">
                            {currentPage}
                        </span>
                    </div>
                )}
            </div>

            {/* Right: Dark Mode Toggle and User Button */}
            <div className="flex items-center gap-3">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setTheme(theme === "light" ? "dark" : "light")}
                    className="h-9 w-9"
                    title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
                >
                    <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                    <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                    <span className="sr-only">Toggle theme</span>
                </Button>
                <UserButton afterSignOutUrl="/" />
            </div>
        </div>
    )
}
