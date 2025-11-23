"use client"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
    LayoutDashboard,
    Database,
    Settings2,
    FileText,
    LogOut,
    Sparkles,
    BarChart3
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useClerk } from "@clerk/nextjs"

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> { }

export function AppSidebar({ className }: SidebarProps) {
    const pathname = usePathname()
    const { signOut } = useClerk()

    const routes = [
        {
            label: "Dashboard",
            icon: LayoutDashboard,
            href: "/",
            color: "text-sky-500",
        },

        {
            label: "Data Vault",
            icon: Database,
            href: "/vault",
            color: "text-violet-500",
        },
        {
            label: "History",
            icon: FileText,
            href: "/history",
            color: "text-orange-700",
        },
        {
            label: "Match Builder",
            icon: Settings2,
            href: "/config",
            color: "text-pink-700",
        },
        {
            label: "Analytics",
            icon: BarChart3,
            href: "/dashboard/analytics",
            color: "text-blue-500",
        },
        {
            label: "Audit Reports",
            icon: FileText,
            href: "/audit",
            color: "text-orange-700",
        },
    ]

    return (
        <div className={cn("space-y-4 py-4 flex flex-col h-full bg-[#111827] text-white", className)}>
            <div className="px-3 py-2 flex-1">
                <Link href="/" className="flex items-center pl-3 mb-14">
                    <div className="relative w-8 h-8 mr-4">
                        <Sparkles className="w-8 h-8 text-purple-500" />
                    </div>
                    <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-600">
                        Entify
                    </h1>
                </Link>
                <div className="space-y-1">
                    {routes.map((route) => (
                        <Link
                            key={route.href}
                            href={route.href}
                            className={cn(
                                "text-sm group flex p-3 w-full justify-start font-medium cursor-pointer hover:text-white hover:bg-white/10 rounded-lg transition",
                                pathname === route.href ? "text-white bg-white/10" : "text-zinc-400"
                            )}
                        >
                            <div className="flex items-center flex-1">
                                <route.icon className={cn("h-5 w-5 mr-3", route.color)} />
                                {route.label}
                            </div>
                        </Link>
                    ))}
                </div>
            </div>
            <div className="px-3 py-2">
                <Button
                    onClick={() => signOut()}
                    variant="ghost"
                    className="w-full justify-start text-zinc-400 hover:text-white hover:bg-white/10"
                >
                    <LogOut className="h-5 w-5 mr-3" />
                    Sign Out
                </Button>
            </div>
        </div>
    )
}
