"use client"

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
} from '@/components/ui/command'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover'
import { ChevronDown, Plus, FolderOpen, User, Settings, LogOut, Check, Moon, Sun } from 'lucide-react'
import { useDatasetStore } from '@/lib/store/useDatasetStore'
import { supabase } from '@/lib/supabase'

interface TopNavProps {
    userName?: string
    userEmail?: string
}

export function TopNav({ userName = "User", userEmail = "user@example.com" }: TopNavProps) {
    const pathname = usePathname()
    const router = useRouter()
    const { activeProject } = useDatasetStore()
    const [projectSwitcherOpen, setProjectSwitcherOpen] = useState(false)
    const [projects, setProjects] = useState<any[]>([])
    const [mounted, setMounted] = useState(false)

    // Prevent hydration mismatch by only rendering interactive components after mount
    useEffect(() => {
        setMounted(true)
    }, [])

    // Load projects from Supabase
    useEffect(() => {
        const loadProjects = async () => {
            const { data, error } = await supabase
                .from('projects')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(10)

            if (!error && data) {
                setProjects(data)
            }
        }
        loadProjects()
    }, [])

    // Initialize theme from localStorage
    useEffect(() => {
        const savedTheme = localStorage.getItem('theme')
        if (savedTheme) {
            document.documentElement.classList.toggle('dark', savedTheme === 'dark')
        }
    }, [])

    const currentProject = activeProject || (projects.length > 0 ? projects[0] : null)

    return (
        <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex h-14 items-center px-6">
                {/* Logo */}
                <Link href="/" className="flex items-center gap-2 mr-6">
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 via-purple-500 to-purple-600 p-1.5 shadow-md">
                        {/* Modern geometric logo - connected nodes */}
                        <svg viewBox="0 0 24 24" fill="none" className="w-full h-full text-white">
                            <circle cx="7" cy="17" r="3" stroke="currentColor" strokeWidth="2" />
                            <circle cx="17" cy="7" r="3" stroke="currentColor" strokeWidth="2" />
                            <path d="M9.5 14.5L14.5 9.5" stroke="currentColor" strokeWidth="2" />
                        </svg>
                    </div>
                    <span className="font-semibold text-lg bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                        Entify
                    </span>
                </Link>

                {/* Project Switcher */}
                {mounted && (
                    <Popover open={projectSwitcherOpen} onOpenChange={setProjectSwitcherOpen}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="ghost"
                                role="combobox"
                                aria-expanded={projectSwitcherOpen}
                                className="justify-between gap-2 px-3"
                            >
                                <FolderOpen className="h-4 w-4" />
                                <span className="font-medium">Projects</span>
                                <ChevronDown className="h-4 w-4 opacity-50" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[300px] p-0" align="start">
                            <Command>
                                <CommandInput placeholder="Search projects..." />
                                <CommandEmpty>No projects found.</CommandEmpty>
                                <CommandList>
                                    <CommandGroup heading="Recent Projects">
                                        {projects.map((project) => (
                                            <CommandItem
                                                key={project.id}
                                                onSelect={() => {
                                                    router.push(`/projects/${project.id}`)
                                                    setProjectSwitcherOpen(false)
                                                }}
                                                className="cursor-pointer"
                                            >
                                                <Check
                                                    className={`mr-2 h-4 w-4 ${currentProject?.id === project.id ? 'opacity-100' : 'opacity-0'
                                                        }`}
                                                />
                                                <div className="flex-1">
                                                    <div className="font-medium">{project.name}</div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {new Date(project.created_at).toLocaleDateString()}
                                                    </div>
                                                </div>
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                    <CommandSeparator />
                                    <CommandGroup>
                                        <CommandItem
                                            onSelect={() => {
                                                router.push('/vault')
                                                setProjectSwitcherOpen(false)
                                            }}
                                            className="cursor-pointer"
                                        >
                                            <Plus className="mr-2 h-4 w-4" />
                                            <span>Create New Project</span>
                                        </CommandItem>
                                    </CommandGroup>
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>
                )}

                {/* Navigation Links */}
                <nav className="flex items-center gap-1 ml-6">
                    <Link href="/vault">
                        <Button
                            variant={pathname === '/vault' ? 'secondary' : 'ghost'}
                            size="sm"
                            className="text-sm"
                        >
                            Data Vault
                        </Button>
                    </Link>
                </nav>

                {/* Right Side */}
                <div className="ml-auto flex items-center gap-2">
                    {/* Dark Mode Toggle */}
                    {mounted && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                                const html = document.documentElement
                                const isDark = html.classList.contains('dark')
                                html.classList.toggle('dark', !isDark)
                                localStorage.setItem('theme', isDark ? 'light' : 'dark')
                            }}
                            className="h-9 w-9"
                            title="Toggle theme"
                        >
                            <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                            <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                            <span className="sr-only">Toggle theme</span>
                        </Button>
                    )}

                    {/* User Menu */}
                    {mounted && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="gap-2">
                                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center text-white text-xs font-medium">
                                        {userName.charAt(0).toUpperCase()}
                                    </div>
                                    <span className="hidden md:inline-block">{userName}</span>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                                <DropdownMenuLabel>
                                    <div className="flex flex-col space-y-1">
                                        <p className="text-sm font-medium">{userName}</p>
                                        <p className="text-xs text-muted-foreground">{userEmail}</p>
                                    </div>
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem>
                                    <User className="mr-2 h-4 w-4" />
                                    Profile
                                </DropdownMenuItem>
                                <DropdownMenuItem>
                                    <Settings className="mr-2 h-4 w-4" />
                                    Settings
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-red-600">
                                    <LogOut className="mr-2 h-4 w-4" />
                                    Sign out
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </div>
            </div>
        </header>
    )
}
