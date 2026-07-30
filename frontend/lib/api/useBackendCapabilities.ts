"use client"

import { useEffect, useState } from "react"

import { buildApiUrl } from "@/lib/api/client"

/**
 * What the connected backend can actually do.
 *
 * Semantic blocking is an optional install: it pulls in torch, which is over
 * half a gigabyte, so it is not part of the base requirements. Without asking,
 * the UI would offer a prominent button that answers 501, which reads as a
 * broken feature rather than an uninstalled one.
 *
 * Also carries the memory budget and supported formats so the interface can
 * describe the real limits of this install rather than assuming defaults.
 */
export type BackendCapabilities = {
  reachable: boolean
  semanticBlocking: boolean
  memoryLimit: string | null
  supportedFormats: string[]
  maxUploadMb: number | null
}

const UNREACHABLE: BackendCapabilities = {
  reachable: false,
  semanticBlocking: false,
  memoryLimit: null,
  supportedFormats: [],
  maxUploadMb: null,
}

// Capabilities change only when the operator reinstalls, so one fetch per page
// load is enough. Cached at module scope so several components asking at once
// share a single request.
let cached: Promise<BackendCapabilities> | null = null

async function load(): Promise<BackendCapabilities> {
  try {
    const response = await fetch(buildApiUrl("/api/health"))
    if (!response.ok) return UNREACHABLE
    const body = await response.json()
    return {
      reachable: true,
      // Absent on older backends. Treated as unavailable rather than assumed
      // present, so the failure mode is a disabled control, not a 501.
      semanticBlocking: body.semantic_blocking_available === true,
      memoryLimit: body.memory_limit ?? null,
      supportedFormats: body.supported_formats ?? [],
      maxUploadMb: body.max_upload_mb ?? null,
    }
  } catch {
    return UNREACHABLE
  }
}

export function fetchCapabilities(): Promise<BackendCapabilities> {
  cached ??= load()
  return cached
}

export function useBackendCapabilities(): {
  capabilities: BackendCapabilities
  loading: boolean
} {
  const [capabilities, setCapabilities] = useState<BackendCapabilities>(UNREACHABLE)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    fetchCapabilities().then((result) => {
      if (active) {
        setCapabilities(result)
        setLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [])

  return { capabilities, loading }
}
