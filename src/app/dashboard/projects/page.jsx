import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Layers,
  Plus,
  Search,
  ArrowLeft,
  Lock,
  Filter,
  CheckCircle2,
  Calendar,
  Code2,
  Tag,
  Clock,
  RotateCcw,
  ExternalLink,
} from "lucide-react";
import { checkOwnerAccess } from "@/lib/auth/session";
import { getVerifiedOwnerId } from "@/lib/api/owner-resolver";
import { getProjectsList } from "@/lib/api/project-service";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const metadata = {
  title: "Projects — Project Tracker",
  description: "Browse, filter, and inspect tracked projects and repositories.",
};

const PROJECT_STATUSES = ["Planned", "In Progress", "On Hold", "Completed"];

function formatDate(dateString) {
  if (!dateString) return null;
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatRelativeTime(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay === 1) return "yesterday";
  if (diffDay < 30) return `${diffDay}d ago`;
  return formatDate(dateString);
}

function getStatusBadgeVariant(status) {
  switch (status) {
    case "In Progress":
      return "amber";
    case "Completed":
      return "ok";
    case "On Hold":
      return "subtle";
    case "Planned":
    default:
      return "default";
  }
}

function getPriorityClass(priority) {
  switch (priority) {
    case "Critical":
      return "text-bad border-bad/40 bg-bad-soft";
    case "High":
      return "text-accent border-accent/40 bg-accent-soft";
    case "Medium":
      return "text-cool border-cool/40 bg-cool-soft";
    case "Low":
    default:
      return "text-ink-muted border-rule/60 bg-paper-3";
  }
}

export default async function ProjectsPage({ searchParams }) {
  const { status: authStatus, session } = await checkOwnerAccess();

  // 1. Unauthenticated visitor: redirect to login
  if (authStatus === "UNAUTHENTICATED") {
    redirect("/login?callbackUrl=/dashboard/projects");
  }

  // 2. Authenticated non-owner: render 403 screen
  if (authStatus === "UNAUTHORIZED") {
    return (
      <div className="min-h-screen bg-paper text-ink flex flex-col justify-between p-4 sm:p-6 lg:p-8">
        <header className="hallmark-container h-14 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-mono-measured text-ink-muted hover:text-ink transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>return to public landing</span>
          </Link>
          <Badge variant="bad" className="font-mono-measured">
            403 · restricted
          </Badge>
        </header>

        <main className="flex-1 flex items-center justify-center py-10">
          <div className="w-full max-w-md rounded-card border border-rule bg-paper-2 p-6 sm:p-8">
            <div className="flex items-center gap-2.5 mb-4 text-bad">
              <Lock className="w-5 h-5" />
              <h1 className="text-base font-medium text-ink">Access Restricted</h1>
            </div>
            <p className="text-xs text-ink-muted leading-relaxed">
              This repository tracking catalog is private to the verified workspace owner.
            </p>
          </div>
        </main>
      </div>
    );
  }

  // 3. Resolve verified owner ID and query parameters
  const resolvedSearchParams = await searchParams;
  const page = parseInt(resolvedSearchParams?.page || "1", 10) || 1;
  const search = resolvedSearchParams?.search?.trim() || "";
  const statusFilter = resolvedSearchParams?.status?.trim() || "";
  const priorityFilter = resolvedSearchParams?.priority?.trim() || "";
  const isCreatedSuccess = resolvedSearchParams?.created === "true";
  const isDeletedSuccess = resolvedSearchParams?.deleted === "true";

  let data = null;
  let fetchError = null;

  try {
    const ownerId = await getVerifiedOwnerId(session);
    data = await getProjectsList({
      ownerId,
      page,
      limit: 9,
      search,
      status: statusFilter,
      priority: priorityFilter,
    });
  } catch (err) {
    console.error("Projects list query error:", err.message);
    fetchError = "Unable to retrieve projects from database.";
  }

  const isFiltered = Boolean(search || statusFilter || priorityFilter);

  // Helper to build pagination links preserving filters
  const buildPageUrl = (targetPage) => {
    const params = new URLSearchParams();
    if (targetPage > 1) params.set("page", String(targetPage));
    if (search) params.set("search", search);
    if (statusFilter) params.set("status", statusFilter);
    if (priorityFilter) params.set("priority", priorityFilter);
    const qs = params.toString();
    return `/dashboard/projects${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col">
      <DashboardHeader user={session.user} active="projects" />

      <main className="flex-1 hallmark-container py-10">
        {/* Success Banner if redirected from new project */}
        {isCreatedSuccess ? (
          <div className="mb-6 rounded-card border border-ok/40 bg-ok-soft p-4 flex items-center justify-between text-xs text-ok">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span className="font-medium">
                Project created successfully! It is now active in your private workspace.
              </span>
            </div>
            <Link
              href="/dashboard/projects"
              className="text-[11px] font-mono-measured text-ok/80 hover:text-ok underline"
            >
              dismiss
            </Link>
          </div>
        ) : null}

        {/* Success Banner if redirected from deleted project */}
        {isDeletedSuccess ? (
          <div className="mb-6 rounded-card border border-ok/40 bg-ok-soft p-4 flex items-center justify-between text-xs text-ok">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span className="font-medium">
                Project and all associated tasks, milestones, and activities deleted successfully.
              </span>
            </div>
            <Link
              href="/dashboard/projects"
              className="text-[11px] font-mono-measured text-ok/80 hover:text-ok underline"
            >
              dismiss
            </Link>
          </div>
        ) : null}

        {/* Page Title & Action Bar */}
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="cool" className="font-mono-measured text-[11px]">
                // catalog
              </Badge>
              <span className="text-xs text-ink-muted font-mono-measured">
                total: {data ? data.pagination.total : 0} projects
              </span>
            </div>
            <h1 className="text-3xl font-medium tracking-tight text-ink">
              Tracked Projects
            </h1>
            <p className="text-xs text-ink-muted mt-1">
              Centralized repository index, delivery velocity, and sprint progress.
            </p>
          </div>

          <Link href="/dashboard/projects/new">
            <Button size="sm" variant="default" className="text-xs gap-1.5 font-medium">
              <Plus className="w-3.5 h-3.5" />
              <span>Create Project</span>
            </Button>
          </Link>
        </div>

        {/* Search & Filter Controls */}
        <div className="rounded-card border border-rule bg-paper-2 p-4 mb-8 space-y-3">
          <form method="GET" action="/dashboard/projects" className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <Input
                name="search"
                defaultValue={search}
                placeholder="Search projects by title, description, tags, or tech stack..."
                className="pl-9 text-xs"
              />
            </div>

            {/* Status Dropdown */}
            <select
              name="status"
              defaultValue={statusFilter}
              className="h-9 rounded-pill border border-rule bg-paper-3 px-3 py-1.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-accent min-w-[140px]"
            >
              <option value="">All Statuses</option>
              {PROJECT_STATUSES.map((s) => (
                <option key={s} value={s} className="bg-paper-2 text-ink">
                  {s}
                </option>
              ))}
            </select>

            {/* Filter Submit Button */}
            <Button type="submit" variant="secondary" size="sm" className="text-xs gap-1.5">
              <Filter className="w-3.5 h-3.5" />
              <span>Filter</span>
            </Button>

            {/* Reset Filters Link */}
            {isFiltered ? (
              <Link href="/dashboard/projects">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-xs text-ink-muted hover:text-ink gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset</span>
                </Button>
              </Link>
            ) : null}
          </form>

          {/* Quick status pills for rapid switching */}
          <div className="flex items-center gap-1.5 flex-wrap pt-1 text-[11px] font-mono-measured">
            <span className="text-ink-muted mr-1">quick.filter:</span>
            <Link
              href={buildPageUrl(1).replace(/&?status=[^&]*/, "")}
              className={`px-2 py-0.5 rounded border transition-colors ${
                !statusFilter
                  ? "bg-paper-3 text-accent border-accent/40"
                  : "bg-paper border-rule text-ink-muted hover:text-ink"
              }`}
            >
              All
            </Link>
            {PROJECT_STATUSES.map((s) => {
              const active = statusFilter === s;
              const params = new URLSearchParams();
              if (search) params.set("search", search);
              params.set("status", s);
              return (
                <Link
                  key={s}
                  href={`/dashboard/projects?${params.toString()}`}
                  className={`px-2 py-0.5 rounded border transition-colors ${
                    active
                      ? "bg-paper-3 text-accent border-accent/40"
                      : "bg-paper border-rule text-ink-muted hover:text-ink"
                  }`}
                >
                  {s}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Database Error Banner */}
        {fetchError ? (
          <div className="rounded-card border border-bad/50 bg-bad-soft p-5 text-xs text-bad mb-8">
            <p className="font-medium text-sm">Failed to Load Projects</p>
            <p className="text-ink-muted mt-0.5">{fetchError}</p>
          </div>
        ) : null}

        {/* Projects Content Area */}
        {data ? (
          <>
            {data.projects.length === 0 ? (
              // Empty States
              isFiltered ? (
                // Filtered Empty State
                <div className="rounded-card border border-rule bg-paper-2 p-12 text-center text-xs text-ink-muted space-y-3">
                  <div className="w-10 h-10 rounded-pill bg-paper-3 border border-rule mx-auto flex items-center justify-center text-ink-muted">
                    <Filter className="w-5 h-5" />
                  </div>
                  <h2 className="text-base font-medium text-ink">No projects match your filter</h2>
                  <p className="max-w-md mx-auto leading-relaxed">
                    No tracked projects matched your search criteria or status filter. Try clearing
                    keywords or resetting the filter options.
                  </p>
                  <div className="pt-2">
                    <Link href="/dashboard/projects">
                      <Button variant="secondary" size="sm" className="text-xs">
                        Reset All Filters
                      </Button>
                    </Link>
                  </div>
                </div>
              ) : (
                // True Empty State (Zero Projects)
                <div className="rounded-card border border-rule bg-paper-2 p-12 text-center text-xs text-ink-muted space-y-3">
                  <div className="w-10 h-10 rounded-pill bg-paper-3 border border-rule mx-auto flex items-center justify-center text-accent">
                    <Layers className="w-5 h-5" />
                  </div>
                  <h2 className="text-base font-medium text-ink">No projects tracked yet</h2>
                  <p className="max-w-md mx-auto leading-relaxed">
                    Your workspace database has 0 project records. Create your first project profile
                    to begin tracking sprint tasks and milestones.
                  </p>
                  <div className="pt-2">
                    <Link href="/dashboard/projects/new">
                      <Button variant="default" size="sm" className="text-xs gap-1.5 font-medium">
                        <Plus className="w-3.5 h-3.5" />
                        <span>Create Your First Project</span>
                      </Button>
                    </Link>
                  </div>
                </div>
              )
            ) : (
              // Projects Grid
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {data.projects.map((project) => (
                  <div
                    key={project._id}
                    className="rounded-card border border-rule bg-paper-2 p-5 flex flex-col justify-between hover:border-rule-2 transition-colors space-y-4"
                  >
                    {/* Top Row: Category, Priority, Visibility */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[11px] font-mono-measured">
                        <span className="text-cool font-medium">
                          {project.category || "General"}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-1.5 py-0.5 rounded border text-[10px] ${getPriorityClass(
                              project.priority
                            )}`}
                          >
                            {project.priority}
                          </span>
                          <span className="text-ink-muted text-[10px] px-1.5 py-0.5 rounded border border-rule bg-paper-3">
                            {project.visibility}
                          </span>
                        </div>
                      </div>

                      {/* Title & Slug */}
                      <div>
                        <h2 className="text-base font-medium text-ink line-clamp-1">
                          <Link
                            href={`/dashboard/projects/${project._id}`}
                            className="hover:text-accent transition-colors"
                          >
                            {project.title}
                          </Link>
                        </h2>
                        <span className="text-[11px] font-mono-measured text-ink-muted block truncate">
                          // {project.slug}
                        </span>
                      </div>

                      {/* Short Description */}
                      <p className="text-xs text-ink-muted line-clamp-2 leading-relaxed">
                        {project.shortDescription}
                      </p>
                    </div>

                    {/* Middle: Tech Stack */}
                    {Array.isArray(project.techStack) && project.techStack.length > 0 ? (
                      <div className="flex items-center gap-1.5 flex-wrap pt-1">
                        {project.techStack.slice(0, 4).map((tech, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded bg-paper-3 border border-rule/70 text-[10px] font-mono-measured text-ink-2"
                          >
                            {tech}
                          </span>
                        ))}
                        {project.techStack.length > 4 ? (
                          <span className="text-[10px] font-mono-measured text-ink-muted">
                            +{project.techStack.length - 4}
                          </span>
                        ) : null}
                      </div>
                    ) : null}

                    {/* Bottom: Progress Bar & Meta Status */}
                    <div className="space-y-3 pt-3 border-t border-rule/50">
                      {/* Progress bar */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px] font-mono-measured text-ink-muted">
                          <span>
                            {project.progressSource === "tasks"
                              ? `${project.taskCounts.completed}/${project.taskCounts.total} tasks`
                              : "manual progress"}
                          </span>
                          <span className="text-ink font-medium">{project.progress}%</span>
                        </div>
                        <div className="w-full h-1.5 rounded-pill bg-paper-3 border border-rule/50 overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 ${
                              project.progress === 100 ? "bg-ok" : "bg-accent"
                            }`}
                            style={{ width: `${project.progress}%` }}
                          />
                        </div>
                      </div>

                      {/* Footer Row: Status badge & Date */}
                      <div className="flex items-center justify-between text-xs pt-1">
                        <Badge
                          variant={getStatusBadgeVariant(project.status)}
                          className="text-[11px] font-mono-measured"
                        >
                          {project.status}
                        </Badge>

                        <span className="text-[11px] font-mono-measured text-ink-muted">
                          {project.deadline
                            ? `Due ${formatDate(project.deadline)}`
                            : `Updated ${formatRelativeTime(project.updatedAt)}`}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination Controls */}
            {data.pagination.totalPages > 1 ? (
              <div className="mt-8 pt-6 border-t border-rule flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono-measured text-ink-muted">
                <div>
                  Showing {(data.pagination.page - 1) * data.pagination.limit + 1} to{" "}
                  {Math.min(data.pagination.page * data.pagination.limit, data.pagination.total)} of{" "}
                  {data.pagination.total} projects
                </div>

                <div className="flex items-center gap-2">
                  {data.pagination.hasPrevPage ? (
                    <Link href={buildPageUrl(data.pagination.page - 1)}>
                      <Button variant="secondary" size="sm" className="text-xs">
                        Previous
                      </Button>
                    </Link>
                  ) : (
                    <Button variant="secondary" size="sm" className="text-xs" disabled>
                      Previous
                    </Button>
                  )}

                  <span className="px-3 py-1 rounded bg-paper-2 border border-rule text-ink">
                    {data.pagination.page} / {data.pagination.totalPages}
                  </span>

                  {data.pagination.hasNextPage ? (
                    <Link href={buildPageUrl(data.pagination.page + 1)}>
                      <Button variant="secondary" size="sm" className="text-xs">
                        Next
                      </Button>
                    </Link>
                  ) : (
                    <Button variant="secondary" size="sm" className="text-xs" disabled>
                      Next
                    </Button>
                  )}
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </main>

      {/* Footer */}
      <footer className="border-t border-rule bg-paper-3 py-6 mt-12">
        <div className="hallmark-container flex items-center justify-between text-xs font-mono-measured text-ink-muted">
          <span>PROJECT TRACKER // PRIVATE CONSOLE</span>
          <span>authenticated session</span>
        </div>
      </footer>
    </div>
  );
}
