import Link from "next/link";
import {
  Layers,
  GitBranch,
  Terminal,
  Activity,
  Cpu,
  ArrowUpRight,
  Database,
  Shield,
  Gauge,
  Sparkles,
  CheckCircle2,
  Clock,
  Code2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

// Fictional demonstration projects with realistic technical scopes
const DEMO_PROJECTS = [
  {
    id: "PRJ-01",
    name: "Distributed Event Pipeline",
    description: "High-throughput log collector and event router with partitioned consumer groups and memory-backed offsets.",
    category: "Infrastructure",
    status: "Active Sprint",
    statusVariant: "amber",
    branch: "feat/partition-rebalance",
    stack: ["Go", "Kafka", "gRPC"],
    lastUpdated: "22m ago",
    progress: 74,
  },
  {
    id: "PRJ-02",
    name: "AST Optimization Harness",
    description: "Multi-pass compiler inspection tool measuring symbol table allocation overhead and dead code elimination rates.",
    category: "Developer Tooling",
    status: "Shipped v1.4",
    statusVariant: "ok",
    branch: "release/v1.4.2",
    stack: ["Rust", "LLVM", "Wasm"],
    lastUpdated: "4h ago",
    progress: 100,
  },
  {
    id: "PRJ-03",
    name: "Vector Index Store",
    description: "Quantized embeddings search engine utilizing HNSW indexing with tiered storage fallback for disk arrays.",
    category: "Data Systems",
    status: "Review",
    statusVariant: "cool",
    branch: "fix/cosine-simd",
    stack: ["C++20", "AVX-512", "SQLite"],
    lastUpdated: "1d ago",
    progress: 91,
  },
  {
    id: "PRJ-04",
    name: "Project Tracker Platform",
    description: "Centralized developer dashboard for sprint tracking, milestone velocity, and multi-repository delivery telemetry.",
    category: "Productivity",
    status: "Phase 1 Foundation",
    statusVariant: "amber",
    branch: "main",
    stack: ["Next.js", "Tailwind", "Mongoose"],
    lastUpdated: "Live now",
    progress: 25,
  },
];

const DEMO_STATS = [
  { label: "Tracked projects", value: "12", unit: "repositories", note: "4 active this sprint" },
  { label: "Completed milestones", value: "87", unit: "delivered", note: "94.2% on schedule" },
  { label: "Median deploy cycle", value: "18", unit: "minutes", note: "from commit to staging" },
  { label: "System availability", value: "99.94", unit: "percent", note: "across 3 clusters" },
];

const DEMO_ACTIVITY = [
  {
    id: "act-104",
    time: "19:14:02",
    actor: "sumit",
    project: "PRJ-04",
    action: "scaffolded design tokens and base styles for Hallmark Console",
    type: "commit",
  },
  {
    id: "act-103",
    time: "18:45:18",
    actor: "pipeline",
    project: "PRJ-02",
    action: "automated bench regression tests passed with zero regressions",
    type: "ci",
  },
  {
    id: "act-102",
    time: "16:20:55",
    actor: "sumit",
    project: "PRJ-01",
    action: "merged pull request #48: partition rebalance handler",
    type: "merge",
  },
  {
    id: "act-101",
    time: "11:05:30",
    actor: "security-bot",
    project: "PRJ-03",
    action: "dependency scan completed: 0 critical vulnerabilities reported",
    type: "audit",
  },
];

const STACK_MATRIX = [
  { name: "Next.js 14 App Router", layer: "Framework", purpose: "Server components, streaming route handlers, fast client transitions" },
  { name: "React (JavaScript / JSX)", layer: "UI Runtime", purpose: "Clean component hierarchy without compilation overhead" },
  { name: "Tailwind CSS", layer: "Styling Engine", purpose: "Strict design-token utility mapping with zero runtime CSS cost" },
  { name: "Hallmark Console", layer: "Design System", purpose: "Disciplined graphite ground, hairline borders, and Host Grotesk typography" },
  { name: "MongoDB & Mongoose", layer: "Persistence (Phase 2)", purpose: "Structured document storage with cached connection pooling" },
  { name: "Auth.js / NextAuth", layer: "Security (Phase 3)", purpose: "Server-side session management and protected route handlers" },
  { name: "Recharts & Motion", layer: "Telemetry (Phase 4-5)", purpose: "Accessible data visualizations and restrained UI transitions" },
  { name: "Lucide React", layer: "Iconography", purpose: "Precise 1.5px and 2px stroke functional interface icons" },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col">
      {/* 1. Header / Navigation */}
      <header className="border-b border-rule/70 bg-paper/95 sticky top-0 z-40 backdrop-blur-sm">
        <div className="hallmark-container h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="flex items-center gap-2.5 text-sm font-semibold tracking-tight text-ink hover:text-accent transition-colors"
            >
              <div className="w-7 h-7 rounded-pill bg-paper-3 border border-rule-2 flex items-center justify-center text-accent">
                <Terminal className="w-4 h-4" />
              </div>
              <span>PROJECT.LOG</span>
            </Link>

            <nav className="hidden md:flex items-center gap-5 text-xs text-ink-muted">
              <a href="#projects" className="hover:text-ink transition-colors">
                projects
              </a>
              <a href="#activity" className="hover:text-ink transition-colors">
                activity trail
              </a>
              <a href="#stack" className="hover:text-ink transition-colors">
                architecture
              </a>
              <a href="#metrics" className="hover:text-ink transition-colors">
                sample metrics
              </a>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-pill bg-paper-3 border border-rule text-xs font-mono-measured text-cool">
              <span className="w-1.5 h-1.5 rounded-full bg-cool"></span>
              <span>sys.ready · phase-1</span>
            </div>

            <Button asChild size="sm" variant="default">
              <Link href="#projects">
                <span>View projects</span>
                <ArrowUpRight className="w-3.5 h-3.5 ml-1" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* 2. Hero Section (Stage Posture - Fits 1280x800 viewport without scroll) */}
        <section className="border-b border-rule/70 py-12 lg:py-16 bg-paper-3/40">
          <div className="hallmark-container">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
              {/* Left Column: Headlines & Actions */}
              <div className="lg:col-span-7 flex flex-col justify-center">
                <div className="inline-flex items-center gap-2 mb-4">
                  <Badge variant="subtle" className="font-mono-measured text-[11px]">
                    v0.1.0 // public preview
                  </Badge>
                  <span className="text-xs text-ink-muted">developer workspace</span>
                </div>

                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-medium tracking-tight text-ink leading-[1.1] mb-4">
                  Everything I’m Building, All in One Place
                </h1>

                <p className="text-base sm:text-lg text-ink-muted max-w-xl leading-relaxed mb-6">
                  A centralized engineering workspace for milestone velocity, roadmaps, and delivery telemetry.
                </p>

                <div className="flex flex-wrap items-center gap-3">
                  <Button asChild size="default" variant="default">
                    <Link href="#projects">Explore active projects</Link>
                  </Button>

                  <Button asChild size="default" variant="secondary">
                    <a
                      href="https://github.com/sumitkhandi48/Project-Tracker"
                      target="_blank"
                      rel="noreferrer"
                    >
                      <GitBranch className="w-4 h-4 mr-2 text-cool" />
                      GitHub repository
                    </a>
                  </Button>
                </div>

                <div className="mt-8 pt-6 border-t border-rule/50 flex items-center gap-6 text-xs text-ink-muted font-mono-measured">
                  <div>
                    <span className="text-ink font-medium">Console</span> design system
                  </div>
                  <div>
                    <span className="text-ink font-medium">100%</span> JavaScript App Router
                  </div>
                  <div>
                    <span className="text-accent font-medium">4</span> tracked repos
                  </div>
                </div>
              </div>

              {/* Right Column: Live Telemetry Ledger (Console signature element) */}
              <div className="lg:col-span-5">
                <div className="rounded-card border border-rule bg-paper-2 overflow-hidden shadow-none">
                  {/* Ledger Header */}
                  <div className="px-4 py-3 bg-paper-3 border-b border-rule flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4 text-cool" />
                      <span className="text-xs font-medium text-ink">Active Sprint Telemetry</span>
                    </div>
                    <span className="text-[11px] font-mono-measured text-ink-muted">live stream</span>
                  </div>

                  {/* Ledger Body */}
                  <div className="divide-y divide-rule/60 text-xs">
                    <div className="p-3.5 flex items-center justify-between hover:bg-paper-3/50 transition-colors">
                      <div className="flex flex-col gap-1">
                        <span className="text-ink font-medium">Phase 1: Foundation & Landing</span>
                        <span className="font-mono-measured text-[11px] text-ink-muted">Next.js App Router + Tailwind</span>
                      </div>
                      <Badge variant="amber">In progress</Badge>
                    </div>

                    <div className="p-3.5 flex items-center justify-between hover:bg-paper-3/50 transition-colors">
                      <div className="flex flex-col gap-1">
                        <span className="text-ink font-medium">Phase 2: Database & Schemas</span>
                        <span className="font-mono-measured text-[11px] text-ink-muted">MongoDB Atlas + Mongoose Pool</span>
                      </div>
                      <Badge variant="subtle">Queued</Badge>
                    </div>

                    <div className="p-3.5 flex items-center justify-between hover:bg-paper-3/50 transition-colors">
                      <div className="flex flex-col gap-1">
                        <span className="text-ink font-medium">Phase 3: Auth & Sessions</span>
                        <span className="font-mono-measured text-[11px] text-ink-muted">Auth.js Route Handlers</span>
                      </div>
                      <Badge variant="subtle">Scheduled</Badge>
                    </div>

                    <div className="p-3.5 flex items-center justify-between hover:bg-paper-3/50 transition-colors">
                      <div className="flex flex-col gap-1">
                        <span className="text-ink font-medium">Hallmark Floor Gates</span>
                        <span className="font-mono-measured text-[11px] text-ink-muted">16 non-negotiable checks</span>
                      </div>
                      <Badge variant="ok">16/16 Passed</Badge>
                    </div>
                  </div>

                  {/* Ledger Footer */}
                  <div className="px-4 py-2.5 bg-paper-3/70 border-t border-rule flex items-center justify-between text-[11px] text-ink-muted font-mono-measured">
                    <span>Host: Node v24.20.0</span>
                    <span className="text-cool">all systems nominal</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 3. Overview Stats (Explicitly Sample Data) */}
        <section id="metrics" className="border-b border-rule/70 py-10 bg-paper">
          <div className="hallmark-container">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-6 gap-2">
              <div>
                <h2 className="text-lg font-medium text-ink">Delivery Overview</h2>
                <p className="text-xs text-ink-muted">Aggregated throughput and deployment indicators</p>
              </div>
              <Badge variant="subtle" className="w-fit font-mono-measured text-[11px]">
                sample metrics for preview
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {DEMO_STATS.map((stat, idx) => (
                <div
                  key={idx}
                  className="rounded-card border border-rule bg-paper-2 p-5 flex flex-col justify-between"
                >
                  <span className="text-xs text-ink-muted font-normal">{stat.label}</span>
                  <div className="my-3 flex items-baseline gap-2">
                    <span className="text-3xl font-medium font-mono-measured text-ink tracking-tight">
                      {stat.value}
                    </span>
                    <span className="text-xs text-ink-muted font-mono-measured">{stat.unit}</span>
                  </div>
                  <span className="text-[11px] text-cool font-mono-measured">{stat.note}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 4. Featured Projects Section */}
        <section id="projects" className="border-b border-rule/70 py-14 bg-paper-3/20">
          <div className="hallmark-container">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 gap-3">
              <div>
                <h2 className="text-2xl font-medium text-ink">Featured Workspaces</h2>
                <p className="text-xs text-ink-muted mt-1">
                  Active engineering initiatives and archived project milestones
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="cool">4 tracked systems</Badge>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {DEMO_PROJECTS.map((project) => (
                <Card key={project.id} className="hover:border-rule-2 transition-colors">
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-xs font-mono-measured text-ink-muted">{project.id}</span>
                      <Badge variant={project.statusVariant}>{project.status}</Badge>
                    </div>
                    <CardTitle className="text-lg font-medium text-ink">{project.name}</CardTitle>
                    <CardDescription>{project.description}</CardDescription>
                  </CardHeader>

                  <CardContent>
                    {/* Progress Bar with restrained styling */}
                    <div className="mt-2 mb-4">
                      <div className="flex items-center justify-between text-xs font-mono-measured text-ink-muted mb-1.5">
                        <span>Milestone progress</span>
                        <span className="text-ink">{project.progress}%</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-paper-3 overflow-hidden border border-rule/40">
                        <div
                          className="h-full bg-accent transition-colors"
                          style={{ width: `${project.progress}%` }}
                        />
                      </div>
                    </div>

                    {/* Tech Badges & Branch Info */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-rule/50 text-xs">
                      <div className="flex flex-wrap gap-1.5">
                        {project.stack.map((tech) => (
                          <span
                            key={tech}
                            className="px-2 py-0.5 rounded-[4px] bg-paper-3 border border-rule text-[11px] font-mono-measured text-ink-2"
                          >
                            {tech}
                          </span>
                        ))}
                      </div>

                      <div className="flex items-center gap-1.5 text-ink-muted font-mono-measured text-[11px]">
                        <GitBranch className="w-3.5 h-3.5 text-cool" />
                        <span>{project.branch}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* 5. Progress and Activity Trail (Console Spine Style) */}
        <section id="activity" className="border-b border-rule/70 py-14 bg-paper">
          <div className="hallmark-container">
            <div className="mb-8">
              <h2 className="text-2xl font-medium text-ink">Activity Trail</h2>
              <p className="text-xs text-ink-muted mt-1">
                Recent milestone dispatches, continuous integration events, and deployment records
              </p>
            </div>

            <div className="rounded-card border border-rule bg-paper-2 p-5 sm:p-6">
              <div className="space-y-6 relative before:absolute before:inset-0 before:left-3 sm:before:left-3.5 before:w-[1px] before:bg-rule-2">
                {DEMO_ACTIVITY.map((act) => (
                  <div key={act.id} className="relative flex items-start gap-4 pl-8 sm:pl-9">
                    {/* Spine Node Marker */}
                    <div className="absolute left-1.5 sm:left-2 top-1.5 w-3 h-3 rounded-full bg-paper-2 border-2 border-accent"></div>

                    <div className="flex-1 flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs">
                        <span className="font-mono-measured text-accent font-medium">@{act.actor}</span>
                        <span className="px-1.5 py-0.5 rounded-[3px] bg-paper-3 border border-rule font-mono-measured text-[10px] text-cool">
                          {act.project}
                        </span>
                        <span className="text-ink">{act.action}</span>
                      </div>

                      <span className="font-mono-measured text-[11px] text-ink-muted whitespace-nowrap">
                        {act.time}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 6. Technology Stack & Architectural Strategy */}
        <section id="stack" className="border-b border-rule/70 py-14 bg-paper-3/20">
          <div className="hallmark-container">
            <div className="mb-8">
              <h2 className="text-2xl font-medium text-ink">System Architecture</h2>
              <p className="text-xs text-ink-muted mt-1">
                Curated components powering the project tracking platform
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {STACK_MATRIX.map((item, idx) => (
                <div
                  key={idx}
                  className="rounded-card border border-rule bg-paper-2 p-4 flex flex-col justify-between hover:border-rule-2 transition-colors"
                >
                  <div>
                    <span className="text-[11px] font-mono-measured text-cool block mb-1">
                      {item.layer}
                    </span>
                    <h3 className="text-sm font-medium text-ink mb-2">{item.name}</h3>
                    <p className="text-xs text-ink-muted leading-relaxed">{item.purpose}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* 7. Footer */}
      <footer className="border-t border-rule bg-paper-3 py-10">
        <div className="hallmark-container flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex flex-col items-center sm:items-start gap-1">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Terminal className="w-4 h-4 text-accent" />
              <span>PROJECT TRACKING PLATFORM</span>
            </div>
            <p className="text-xs text-ink-muted">
              Built with Next.js App Router, Tailwind CSS, and Hallmark Console design tokens.
            </p>
          </div>

          <div className="flex items-center gap-6 text-xs text-ink-muted font-mono-measured">
            <a
              href="https://github.com/sumitkhandi48/Project-Tracker"
              target="_blank"
              rel="noreferrer"
              className="hover:text-ink transition-colors"
            >
              github/project-tracker
            </a>
            <span className="text-rule-2">/</span>
            <span className="text-cool">status: healthy</span>
            <span className="text-rule-2">/</span>
            <span>2026 build</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
