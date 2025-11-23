"use client"

import { motion } from "framer-motion"
import { X, Plus, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { BlockingRule, ComparisonPart, useBlockingStore, MatchMethod } from "@/lib/store/useBlockingStore"
import { useState } from "react"

interface BlockingRuleCardProps {
    rule: BlockingRule
    index: number
    columns: string[]
}

export function BlockingRuleCard({ rule, index, columns }: BlockingRuleCardProps) {
    const { removeRule, addPartToRule, removePartFromRule, updatePart } = useBlockingStore()

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="group relative rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm transition-all hover:bg-white/10 hover:shadow-lg hover:shadow-purple-500/10"
        >
            <div className="mb-4 flex items-center justify-between">
                <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Blocking Rule #{index + 1}
                </h3>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                    onClick={() => removeRule(rule.id)}
                >
                    <X className="h-4 w-4" />
                </Button>
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium text-muted-foreground">Block records where</span>

                {rule.parts.map((part, i) => (
                    <div key={part.id} className="flex items-center gap-3">
                        {i > 0 && (
                            <span className="text-xs font-bold text-purple-400 bg-purple-400/10 px-2 py-1 rounded">
                                AND
                            </span>
                        )}
                        <ComparisonPartPill
                            part={part}
                            columns={columns}
                            onUpdate={(updates) => updatePart(rule.id, part.id, updates)}
                            onRemove={() => removePartFromRule(rule.id, part.id)}
                            canRemove={rule.parts.length > 1}
                        />
                    </div>
                ))}

                <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 rounded-full border border-dashed border-white/20 px-3 text-xs text-muted-foreground hover:border-purple-500 hover:text-purple-400"
                    onClick={() => addPartToRule(rule.id)}
                >
                    <Plus className="h-3 w-3" />
                    Add Condition
                </Button>
            </div>
        </motion.div>
    )
}

function ComparisonPartPill({
    part,
    columns,
    onUpdate,
    onRemove,
    canRemove
}: {
    part: ComparisonPart
    columns: string[]
    onUpdate: (updates: Partial<ComparisonPart>) => void
    onRemove: () => void
    canRemove: boolean
}) {
    const [open, setOpen] = useState(false)

    const methodLabels: Record<MatchMethod, string> = {
        exact: "is exactly",
        fuzzy_levenshtein: "looks like (Levenshtein)",
        fuzzy_metaphone: "sounds like (Metaphone)",
        jaro_winkler: "looks like (Jaro-Winkler)",
        first_n_chars: "starts with same chars"
    }

    return (
        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 p-1 pr-2 transition-colors hover:border-white/20">
            {/* Column Selector */}
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="ghost"
                        role="combobox"
                        aria-expanded={open}
                        className="h-7 justify-between gap-2 rounded-md bg-white/5 px-3 text-sm font-medium hover:bg-white/10"
                    >
                        {part.field || "Select Column..."}
                        <ChevronDown className="h-3 w-3 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[200px] p-0">
                    <Command>
                        <CommandInput placeholder="Search columns..." />
                        <CommandList>
                            <CommandEmpty>No column found.</CommandEmpty>
                            <CommandGroup>
                                {columns.map((col) => (
                                    <CommandItem
                                        key={col}
                                        value={col}
                                        onSelect={(currentValue) => {
                                            onUpdate({ field: currentValue })
                                            setOpen(false)
                                        }}
                                    >
                                        {col}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>

            {/* Method Selector */}
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-7 px-2 text-sm text-purple-300 hover:text-purple-200">
                        {methodLabels[part.method]}
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={() => onUpdate({ method: "exact" })}>
                        is exactly
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onUpdate({ method: "jaro_winkler" })}>
                        looks like (Jaro-Winkler)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onUpdate({ method: "fuzzy_metaphone" })}>
                        sounds like (Metaphone)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onUpdate({ method: "first_n_chars", parameters: { n: 1 } })}>
                        starts with same chars
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            {/* Parameters (if needed) */}
            {part.method === "first_n_chars" && (
                <input
                    type="number"
                    min={1}
                    max={10}
                    className="w-12 h-7 bg-transparent border border-white/10 rounded px-1 text-center text-sm"
                    value={part.parameters?.n || 1}
                    onChange={(e) => onUpdate({ parameters: { n: parseInt(e.target.value) } })}
                />
            )}

            {/* Value Display (Implicitly "Same Value") */}
            <span className="text-sm text-muted-foreground px-1">
                {part.field || "..."}
            </span>

            {canRemove && (
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 ml-1 text-muted-foreground hover:text-destructive"
                    onClick={onRemove}
                >
                    <X className="h-3 w-3" />
                </Button>
            )}
        </div>
    )
}
