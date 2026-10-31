import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Terminal,
  Shield,
  ArrowLeft,
  CheckCircle2,
  Lock,
  GitBranch,
  Layers,
  Activity as ActivityIcon,
  Clock,
  AlertTriangle,
  Calendar,
  Target,
  ExternalLink,
} from "lucide-react";
import { checkOwnerAccess } from "@/lib/auth/session";
import { getVerifiedOwnerId } from "@/lib/api/owner-resolver";
import { getDashboardSummary } from "@/lib/api/dashboard-service";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Dashboard — Project Tracker",
  description: "Private developer workspace and project tracking command center.",
};

// Formats an ISO date string into a compact readable format
function formatDate(dateString) {
  if (!dateString) return "No date";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "Invalid date";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

// Compact relative time format
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

// Maps project status to Hallmark badge variants
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

// Maps priority to color classes
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

export default async function DashboardPage() {
  const { status, session } = await checkOwnerAccess();

  // 1. Unauthenticated visitor: redirect to login
  if (status === "UNAUTHENTICATED") {
    redirect("/login?callbackUrl=/dashboard");
  }

  // 2. Authenticated non-owner: render 403 Forbidden access denial screen
  if (status === "UNAUTHORIZED") {
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
            <div className="flex items-center gap-2.5 mb-6">
              <div className="w-8 h-8 rounded-pill bg-paper-3 border border-bad/50 flex items-center justify-center text-bad">
                <Lock className="w-4 h-4" />
              </div>
              <div>
                <h1 className="text-base font-medium tracking-tight text-ink">
                  Access Restricted
                </h1>
                <p className="text-xs text-ink-muted">Personal developer workspace</p>
              </div>
            </div>

            <div className="space-y-4 text-xs text-ink-muted leading-relaxed">
              <p>
                You are authenticated as{" "}
                <span className="text-ink font-medium font-mono-measured">
                  {session?.user?.name || "GitHub User"}
                </span>
                . However, this private workspace is strictly restricted to the configured repository owner.
              </p>

              <div className="p-3 rounded-pill bg-paper-3 border border-rule/70 text-[11px] font-mono-measured text-ink-muted">
                <span>security.boundary: single-tenant-lock</span>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <SignOutButton className="w-full justify-center" variant="secondary">
                  Disconnect session
                </SignOutButton>
              </div>
            </div>
          </div>
        </main>

        <footer className="hallmark-container py-4 text-center text-xs font-mono-measured text-ink-muted">
          <span>PROJECT TRACKER // ACCESS GATEWAY</span>
        </footer>
      </div>
    );
  }

  // 3. Authenticated owner: query real owner-scoped MongoDB data
  const user = session.user;
  let summary = null;
  let fetchError = null;

  try {
    const ownerId = await getVerifiedOwnerId(session);
    summary = await getDashboardSummary(ownerId);
  } catch (err) {
    console.error("Dashboard page data fetch error:", err.message);
    fetchError = "Unable to connect to database or compute workspace metrics.";
  }

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col">
      <DashboardHeader user={session.user} active="overview" />

      {/* Main Dashboard Container */}
      <main className="flex-1 hallmark-container py-10">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="amber" className="font-mono-measured text-[11px]">
                phase 5 · live data
              </Badge>
              <span className="text-xs text-ink-muted font-mono-measured">
                session: secure-jwt
              </span>
            </div>
            <h1 className="text-3xl font-medium tracking-tight text-ink">
              Workspace Overview
            </h1>
            <p className="text-xs text-ink-muted mt-1">
              Authorized personal management environment for active repositories and milestones.
            </p>
          </div>
        </div>

        {/* Database Error Banner (if connection failed) */}
        {fetchError ? (
          <div className="rounded-card border border-bad/50 bg-bad-soft p-5 mb-8 text-xs text-bad flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <div>
                <p className="font-medium text-sm">Telemetry Query Failed</p>
                <p className="text-ink-muted mt-0.5">{fetchError}</p>
              </div>
            </div>
            <Link
              href="/dashboard"
              className="px-3 py-1.5 rounded-pill bg-paper-2 border border-rule text-ink hover:text-accent font-mono-measured text-[11px] transition-colors"
            >
              retry.connection
            </Link>
          </div>
        ) : null}

        {summary ? (
          <>
            {/* Metric Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
              {/* Card 1: Tracked Projects */}
              <div className="rounded-card border border-rule bg-paper-2 p-5 flex flex-col justify-between">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono-measured text-ink-muted">
                    repositories.total
                  </span>
                  <Layers className="w-4 h-4 text-cool" />
                </div>
                <div className="text-3xl font-medium font-mono-measured text-ink mb-1">
                  {summary.stats.projects.total}
                </div>
                <div className="text-[11px] font-mono-measured text-ink-muted truncate">
                  {summary.stats.projects.byStatus["In Progress"]} in progress ·{" "}
                  {summary.stats.projects.byStatus["Planned"]} planned ·{" "}
                  {summary.stats.projects.byStatus["Completed"]} done
                </div>
              </div>

              {/* Card 2: Task Completion */}
              <div className="rounded-card border border-rule bg-paper-2 p-5 flex flex-col justify-between">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono-measured text-ink-muted">
                    tasks.completion
                  </span>
                  <CheckCircle2 className="w-4 h-4 text-ok" />
                </div>
                <div className="text-3xl font-medium font-mono-measured text-ink mb-1">
                  {summary.stats.tasks.completionRate}%
                </div>
                <div className="text-[11px] font-mono-measured text-ink-muted truncate">
                  {summary.stats.tasks.completed}/{summary.stats.tasks.total} done ·{" "}
                  {summary.stats.tasks.outstanding} pending
                </div>
              </div>

              {/* Card 3: Milestone Velocity */}
              <div className="rounded-card border border-rule bg-paper-2 p-5 flex flex-col justify-between">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono-measured text-ink-muted">
                    milestones.delivered
                  </span>
                  <Target className="w-4 h-4 text-accent" />
                </div>
                <div className="text-3xl font-medium font-mono-measured text-ink mb-1">
                  {summary.stats.milestones.completed}
                  <span className="text-lg text-ink-muted font-normal">
                    /{summary.stats.milestones.total}
                  </span>
                </div>
                <div className="text-[11px] font-mono-measured text-ink-muted truncate">
                  {summary.stats.milestones.outstanding} active ·{" "}
                  {summary.stats.milestones.completionRate}% completed
                </div>
              </div>

              {/* Card 4: Deadline Schedule & Overdue Watch */}
              <div className="rounded-card border border-rule bg-paper-2 p-5 flex flex-col justify-between">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono-measured text-ink-muted">
                    schedule.health
                  </span>
                  <Clock
                    className={`w-4 h-4 ${
                      summary.stats.tasks.overdue > 0 || summary.stats.milestones.overdue > 0
                        ? "text-bad"
                        : "text-ok"
                    }`}
                  />
                </div>
                <div className="text-2xl font-medium font-mono-measured text-ink mb-1">
                  {summary.stats.tasks.overdue > 0 || summary.stats.milestones.overdue > 0 ? (
                    <span className="text-bad flex items-center gap-1.5">
                      {summary.stats.tasks.overdue + summary.stats.milestones.overdue} Overdue
                    </span>
                  ) : (
                    <span className="text-ok flex items-center gap-1.5">On Schedule</span>
                  )}
                </div>
                <div className="text-[11px] font-mono-measured text-ink-muted truncate">
                  {summary.stats.tasks.overdue > 0 || summary.stats.milestones.overdue > 0
                    ? `${summary.stats.tasks.overdue} task(s), ${summary.stats.milestones.overdue} milestone(s)`
                    : "0 overdue items recorded"}
                </div>
              </div>
            </div>

            {/* Two-Column Telemetry Dashboard Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Left Column (2 cols): Projects & Active Deadlines */}
              <div className="lg:col-span-2 space-y-8">
                {/* Section: Recent Projects */}
                <div className="rounded-card border border-rule bg-paper-2 p-6">
                  <div className="flex items-center justify-between pb-4 border-b border-rule/50 mb-5">
                    <div className="flex items-center gap-2.5">
                      <Layers className="w-4 h-4 text-cool" />
                      <h2 className="text-sm font-medium text-ink">Recent Projects</h2>
                    </div>
                    <div className="flex items-center gap-3">
                      <Link
                        href="/dashboard/projects"
                        className="text-xs font-mono-measured text-accent hover:underline"
                      >
                        view all //
                      </Link>
                      <span className="text-xs font-mono-measured text-ink-muted">
                        {summary.recentProjects.length} tracked
                      </span>
                    </div>
                  </div>

                  {summary.recentProjects.length === 0 ? (
                    <div className="py-12 text-center text-xs text-ink-muted space-y-3">
                      <p className="text-sm font-medium text-ink">No projects tracked yet</p>
                      <p className="max-w-md mx-auto leading-relaxed">
                        Your workspace database currently has 0 project records. Create your initial
                        project to begin tracking sprint delivery.
                      </p>
                      <div className="pt-2">
                        <Link href="/dashboard/projects/new">
                          <Button size="sm" variant="default" className="text-xs">
                            Create First Project
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {summary.recentProjects.map((project) => (
                        <div
                          key={project._id}
                          className="p-4 rounded-pill bg-paper-3/70 border border-rule/60 hover:border-rule transition-colors space-y-3"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-ink">
                                  {project.title}
                                </span>
                                <Badge
                                  variant={getStatusBadgeVariant(project.status)}
                                  className="text-[10px] font-mono-measured px-1.5 py-0"
                                >
                                  {project.status}
                                </Badge>
                                <span
                                  className={`text-[10px] font-mono-measured px-1.5 py-0.5 rounded border ${getPriorityClass(
                                    project.priority
                                  )}`}
                                >
                                  {project.priority}
                                </span>
                              </div>
                              <p className="text-xs text-ink-muted mt-1 line-clamp-1">
                                {project.shortDescription}
                              </p>
                            </div>
                            <span className="text-[11px] font-mono-measured text-ink-muted whitespace-nowrap">
                              updated {formatRelativeTime(project.updatedAt)}
                            </span>
                          </div>

                          {/* Progress bar */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[11px] font-mono-measured text-ink-muted">
                              <span>
                                {project.progressSource === "tasks"
                                  ? `${project.taskCounts.completed}/${project.taskCounts.total} tasks completed`
                                  : "manual progress"}
                              </span>
                              <span className="text-ink font-medium">{project.progress}%</span>
                            </div>
                            <div className="w-full h-1.5 rounded-pill bg-paper border border-rule/50 overflow-hidden">
                              <div
                                className={`h-full transition-all duration-300 ${
                                  project.progress === 100 ? "bg-ok" : "bg-accent"
                                }`}
                                style={{ width: `${project.progress}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Section: Upcoming & Overdue Work */}
                <div className="rounded-card border border-rule bg-paper-2 p-6">
                  <div className="flex items-center justify-between pb-4 border-b border-rule/50 mb-5">
                    <div className="flex items-center gap-2.5">
                      <Calendar className="w-4 h-4 text-accent" />
                      <h2 className="text-sm font-medium text-ink">
                        Work Schedule & Deadlines
                      </h2>
                    </div>
                    <span className="text-xs font-mono-measured text-ink-muted">
                      {summary.overdueTasks.length +
                        summary.overdueMilestones.length +
                        summary.upcomingTasks.length +
                        summary.upcomingMilestones.length}{" "}
                      scheduled
                    </span>
                  </div>

                  {summary.overdueTasks.length === 0 &&
                  summary.overdueMilestones.length === 0 &&
                  summary.upcomingTasks.length === 0 &&
                  summary.upcomingMilestones.length === 0 ? (
                    <div className="py-8 text-center text-xs text-ink-muted">
                      <p className="font-medium text-ink">No scheduled deadlines</p>
                      <p className="mt-1">
                        Tasks and milestones with dueDate or targetDate will display here
                        chronologically.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Overdue items */}
                      {summary.overdueTasks.length > 0 || summary.overdueMilestones.length > 0 ? (
                        <div className="space-y-2">
                          <span className="text-[11px] font-mono-measured text-bad font-medium flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-bad"></span>
                            OVERDUE ITEMS
                          </span>
                          <div className="space-y-2">
                            {summary.overdueTasks.map((task) => (
                              <div
                                key={task._id}
                                className="p-3 rounded-pill bg-bad-soft/50 border border-bad/30 flex items-center justify-between text-xs"
                              >
                                <div className="flex items-center gap-2 truncate">
                                  <Badge variant="bad" className="text-[10px]">
                                    Task
                                  </Badge>
                                  <span className="font-medium text-ink truncate">
                                    {task.title}
                                  </span>
                                  {task.project ? (
                                    <span className="text-ink-muted text-[11px] truncate">
                                      · {task.project.title}
                                    </span>
                                  ) : null}
                                </div>
                                <span className="font-mono-measured text-bad whitespace-nowrap text-[11px]">
                                  Due {formatDate(task.dueDate)}
                                </span>
                              </div>
                            ))}

                            {summary.overdueMilestones.map((ms) => (
                              <div
                                key={ms._id}
                                className="p-3 rounded-pill bg-bad-soft/50 border border-bad/30 flex items-center justify-between text-xs"
                              >
                                <div className="flex items-center gap-2 truncate">
                                  <Badge variant="bad" className="text-[10px]">
                                    Milestone
                                  </Badge>
                                  <span className="font-medium text-ink truncate">
                                    {ms.title}
                                  </span>
                                  {ms.project ? (
                                    <span className="text-ink-muted text-[11px] truncate">
                                      · {ms.project.title}
                                    </span>
                                  ) : null}
                                </div>
                                <span className="font-mono-measured text-bad whitespace-nowrap text-[11px]">
                                  Target {formatDate(ms.targetDate)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {/* Upcoming items */}
                      {summary.upcomingTasks.length > 0 ||
                      summary.upcomingMilestones.length > 0 ? (
                        <div className="space-y-2 pt-2">
                          <span className="text-[11px] font-mono-measured text-cool font-medium flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-cool"></span>
                            UPCOMING DEADLINES
                          </span>
                          <div className="space-y-2">
                            {summary.upcomingTasks.map((task) => (
                              <div
                                key={task._id}
                                className="p-3 rounded-pill bg-paper-3/60 border border-rule/60 flex items-center justify-between text-xs"
                              >
                                <div className="flex items-center gap-2 truncate">
                                  <Badge variant="default" className="text-[10px]">
                                    Task
                                  </Badge>
                                  <span className="font-medium text-ink truncate">
                                    {task.title}
                                  </span>
                                  {task.project ? (
                                    <span className="text-ink-muted text-[11px] truncate">
                                      · {task.project.title}
                                    </span>
                                  ) : null}
                                </div>
                                <span className="font-mono-measured text-ink-muted whitespace-nowrap text-[11px]">
                                  Due {formatDate(task.dueDate)}
                                </span>
                              </div>
                            ))}

                            {summary.upcomingMilestones.map((ms) => (
                              <div
                                key={ms._id}
                                className="p-3 rounded-pill bg-paper-3/60 border border-rule/60 flex items-center justify-between text-xs"
                              >
                                <div className="flex items-center gap-2 truncate">
                                  <Badge variant="amber" className="text-[10px]">
                                    Milestone
                                  </Badge>
                                  <span className="font-medium text-ink truncate">
                                    {ms.title}
                                  </span>
                                  {ms.project ? (
                                    <span className="text-ink-muted text-[11px] truncate">
                                      · {ms.project.title}
                                    </span>
                                  ) : null}
                                </div>
                                <span className="font-mono-measured text-ink-muted whitespace-nowrap text-[11px]">
                                  Target {formatDate(ms.targetDate)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column (1 col): System Activity & Security Telemetry */}
              <div className="space-y-8">
                {/* Section: Activity Stream */}
                <div className="rounded-card border border-rule bg-paper-2 p-6">
                  <div className="flex items-center justify-between pb-4 border-b border-rule/50 mb-5">
                    <div className="flex items-center gap-2.5">
                      <ActivityIcon className="w-4 h-4 text-cool" />
                      <h2 className="text-sm font-medium text-ink">System Activity Log</h2>
                    </div>
                    <span className="text-xs font-mono-measured text-ink-muted">
                      // telemetry
                    </span>
                  </div>

                  {summary.recentActivities.length === 0 ? (
                    <div className="py-10 text-center text-xs text-ink-muted space-y-2">
                      <div className="w-8 h-8 rounded-pill bg-paper-3 border border-rule mx-auto flex items-center justify-center text-ink-muted">
                        <ActivityIcon className="w-4 h-4" />
                      </div>
                      <p className="font-medium text-ink">No telemetry recorded yet</p>
                      <p className="leading-relaxed">
                        Automated event logs will register here as projects, tasks, and
                        milestones are modified.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {summary.recentActivities.map((act) => (
                        <div
                          key={act._id}
                          className="p-3 rounded-pill bg-paper-3/50 border border-rule/40 text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between text-[11px] font-mono-measured text-ink-muted">
                            <span className="text-accent">{act.type}</span>
                            <span>{formatRelativeTime(act.createdAt)}</span>
                          </div>
                          <p className="text-ink leading-snug">{act.message}</p>
                          {act.project ? (
                            <span className="text-[10px] font-mono-measured text-ink-muted block">
                              // {act.project.title}
                            </span>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Section: Verified Security Credentials */}
                <div className="rounded-card border border-rule bg-paper-2 p-6 space-y-4">
                  <div className="flex items-center gap-2.5 pb-3 border-b border-rule/50">
                    <Shield className="w-4 h-4 text-cool" />
                    <h2 className="text-sm font-medium text-ink">Security Boundary</h2>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-ink-muted">Authentication</span>
                      <span className="font-mono-measured text-ink font-medium">GitHub OAuth</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-ink-muted">Account</span>
                      <span className="font-mono-measured text-ink font-medium truncate max-w-[150px]">
                        {user.name || user.email}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-ink-muted">Tenant Isolation</span>
                      <span className="font-mono-measured text-cool font-medium">
                        Owner-Scoped
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-ink-muted">Database Engine</span>
                      <span className="font-mono-measured text-ok font-medium">
                        MongoDB Local
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-rule/40">
                    <p className="text-[11px] text-ink-muted leading-relaxed font-mono-measured">
                      All database queries are strictly enforced by the server-side owner resolver.
                    </p>
                  </div>
                </div>
              </div>
            </div>
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
