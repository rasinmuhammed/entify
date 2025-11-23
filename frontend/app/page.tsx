"use client"

import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowRight, FolderOpen, Database, Zap, Shield } from "lucide-react"

export default function HomePage() {
  const router = useRouter()

  return (
    <div className="container max-w-6xl mx-auto px-6">
      {/* Hero Section */}
      <div className="py-20 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
          <Zap className="h-4 w-4" />
          <span>Zero-Cost Entity Resolution</span>
        </div>

        <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-6 bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
          Entity Resolution
          <br />
          Made Simple
        </h1>

        <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
          Design, test, and execute entity resolution workflows entirely in your browser.
          Export to Databricks for production scale.
        </p>

        <div className="flex gap-4 justify-center">
          <Button size="lg" onClick={() => router.push('/vault')}>
            Get Started
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <Button size="lg" variant="outline" onClick={() => window.open('https://github.com/moj-analytical-services/splink', '_blank')}>
            Learn About Splink
          </Button>
        </div>
      </div>

      {/* Features Grid */}
      <div className="grid md:grid-cols-3 gap-6 py-12">
        <Card className="border-2">
          <CardHeader>
            <div className="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center mb-4">
              <Database className="h-6 w-6 text-blue-500" />
            </div>
            <CardTitle>Visual Workflow</CardTitle>
            <CardDescription>
              Drag-and-drop data cleaning, visual blocking rules, and comparison builders
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="border-2">
          <CardHeader>
            <div className="w-12 h-12 rounded-lg bg-purple-500/10 flex items-center justify-center mb-4">
              <Shield className="h-6 w-6 text-purple-500" />
            </div>
            <CardTitle>Privacy First</CardTitle>
            <CardDescription>
              All processing happens in your browser. Your data never leaves your machine
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="border-2">
          <CardHeader>
            <div className="w-12 h-12 rounded-lg bg-pink-500/10 flex items-center justify-center mb-4">
              <FolderOpen className="h-6 w-6 text-pink-500" />
            </div>
            <CardTitle>Splink Compatible</CardTitle>
            <CardDescription>
              Export settings as JSON and run with real Splink on Databricks for production
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      {/* CTA Section */}
      <div className="py-12">
        <Card className="bg-gradient-to-br from-blue-500/10 via-purple-500/10 to-pink-500/10 border-2">
          <CardContent className="p-12 text-center">
            <h2 className="text-3xl font-bold mb-4">Ready to get started?</h2>
            <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
              Upload your dataset and create your first entity resolution project in minutes
            </p>
            <Button size="lg" onClick={() => router.push('/vault')}>
              Go to Data Vault
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
