"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  Clock,
  Code2,
  ExternalLink,
  Github,
  Layers,
  Tag,
  Globe,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  FileText,
  ListTodo,
  Flag,
  Pencil,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TaskList } from "@/components/projects/task-list";
import { MilestoneList } from "@/components/projects/milestone-list";
import { TaskModal } from "@/components/projects/task-modal";
import { MilestoneModal } from "@/components/projects/milestone-modal";
import { DeleteConfirmDialog } from "@/components/projects/delete-confirm-dialog";
import {
  calculateProjectProgress,
  calculateMilestoneStats,
} from "@/lib/utils/project-progress";

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

export function ProjectDetailView({
  initialProject,
  initialTasks = [],
  initialMilestones = [],
  initialStats,
  isUpdated = false,
}) {
  const router = useRouter();
  const [project, setProject] = useState(initialProject);
  const [tasks, setTasks] = useState(initialTasks);
  const [milestones, setMilestones] = useState(initialMilestones);
  const [stats, setStats] = useState(initialStats);
  const [activeTab, setActiveTab] = useState("tasks");

  // Modals & Dialogs state
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [milestoneModalOpen, setMilestoneModalOpen] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState(null);

  const [deleteDialog, setDeleteDialog] = useState({
    isOpen: false,
    type: null, // "project" | "task" | "milestone"
    item: null,
  });
  const [isDeleting, setIsDeleting] = useState(false);

  // Status toggling indicators
  const [isTogglingTaskId, setIsTogglingTaskId] = useState(null);
  const [isTogglingMilestoneId, setIsTogglingMilestoneId] = useState(null);

  // Notification / Feedback banner
  const [feedback, setFeedback] = useState(
    isUpdated ? { type: "success", message: "Project updated successfully!" } : null
  );

  function triggerFeedback(type, message) {
    setFeedback({ type, message });
    setTimeout(() => {
      setFeedback((current) => (current?.message === message ? null : current));
    }, 4000);
  }

  // ---------------------------------------------------------------------------
  // Task Handlers
  // ---------------------------------------------------------------------------
  function handleTaskSaved(savedTask, isEdit) {
    let updatedTasks;
    if (isEdit) {
      updatedTasks = tasks.map((t) => (t._id === savedTask._id ? savedTask : t));
      triggerFeedback("success", "Task updated successfully.");
    } else {
      updatedTasks = [savedTask, ...tasks];
      triggerFeedback("success", "Task created successfully.");
    }

    setTasks(updatedTasks);

    // Recompute progress and task counts
    const newStats = calculateProjectProgress(
      updatedTasks,
      project.manualProgress || 0
    );

    setStats((prev) => ({
      ...prev,
      progress: newStats.progress,
      progressSource: newStats.progressSource,
      taskCounts: newStats.taskCounts,
    }));
  }

  async function handleTaskStatusToggle(task) {
    setIsTogglingTaskId(task._id);
    const newStatus = task.status === "Done" ? "In Progress" : "Done";

    try {
      const res = await fetch(`/api/tasks/${task._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await res.json();
      if (!res.ok) {
        triggerFeedback("error", data.error || "Failed to update task status.");
        return;
      }

      const updatedTask = data.task;
      const updatedTasks = tasks.map((t) =>
        t._id === updatedTask._id ? updatedTask : t
      );
      setTasks(updatedTasks);

      const newStats = calculateProjectProgress(
        updatedTasks,
        project.manualProgress || 0
      );

      setStats((prev) => ({
        ...prev,
        progress: newStats.progress,
        progressSource: newStats.progressSource,
        taskCounts: newStats.taskCounts,
      }));

      triggerFeedback(
        "success",
        newStatus === "Done" ? "Task marked as Done." : "Task reopened."
      );
    } catch (err) {
      console.error("Task status toggle error:", err);
      triggerFeedback("error", "Network error updating task status.");
    } finally {
      setIsTogglingTaskId(null);
    }
  }

  // ---------------------------------------------------------------------------
  // Milestone Handlers
  // ---------------------------------------------------------------------------
  function handleMilestoneSaved(savedMilestone, isEdit) {
    let updatedMilestones;
    if (isEdit) {
      updatedMilestones = milestones.map((m) =>
        m._id === savedMilestone._id ? savedMilestone : m
      );
      triggerFeedback("success", "Milestone updated successfully.");
    } else {
      updatedMilestones = [...milestones, savedMilestone];
      triggerFeedback("success", "Milestone created successfully.");
    }

    setMilestones(updatedMilestones);

    const newMilestoneStats = calculateMilestoneStats(updatedMilestones);
    setStats((prev) => ({
      ...prev,
      milestoneCounts: newMilestoneStats,
    }));
  }

  async function handleMilestoneStatusToggle(milestone) {
    setIsTogglingMilestoneId(milestone._id);
    const newStatus =
      milestone.status === "Completed" ? "In Progress" : "Completed";

    try {
      const res = await fetch(`/api/milestones/${milestone._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await res.json();
      if (!res.ok) {
        triggerFeedback(
          "error",
          data.error || "Failed to update milestone status."
        );
        return;
      }

      const updatedMilestone = data.milestone;
      const updatedMilestones = milestones.map((m) =>
        m._id === updatedMilestone._id ? updatedMilestone : m
      );
      setMilestones(updatedMilestones);

      const newMilestoneStats = calculateMilestoneStats(updatedMilestones);
      setStats((prev) => ({
        ...prev,
        milestoneCounts: newMilestoneStats,
      }));

      triggerFeedback(
        "success",
        newStatus === "Completed"
          ? "Milestone marked Completed."
          : "Milestone reopened."
      );
    } catch (err) {
      console.error("Milestone status toggle error:", err);
      triggerFeedback("error", "Network error updating milestone status.");
    } finally {
      setIsTogglingMilestoneId(null);
    }
  }

  // ---------------------------------------------------------------------------
  // Deletion Confirmation & Execution
  // ---------------------------------------------------------------------------
  function openDeleteDialog(type, item) {
    setDeleteDialog({
      isOpen: true,
      type,
      item,
    });
  }

  async function handleConfirmDelete() {
    if (!deleteDialog.item) return;
    setIsDeleting(true);

    const { type, item } = deleteDialog;

    try {
      if (type === "project") {
        const res = await fetch(`/api/projects/${item._id}`, {
          method: "DELETE",
        });

        if (res.status === 200) {
          setDeleteDialog({ isOpen: false, type: null, item: null });
          router.push("/dashboard/projects?deleted=true");
          router.refresh();
          return;
        }

        const errData = await res.json().catch(() => ({}));

        if (res.status === 404) {
          triggerFeedback(
            "error",
            errData.error || "Project was not found or is no longer available in your workspace."
          );
        } else if (res.status === 501) {
          triggerFeedback(
            "error",
            "Project deletion requires a transaction-capable MongoDB deployment (replica set or mongos). Standalone MongoDB instances are unsupported for atomic cascade deletion. Zero records were modified."
          );
        } else {
          triggerFeedback(
            "error",
            errData.error || "An unexpected error occurred while deleting the project. Please try again."
          );
        }
        setDeleteDialog({ isOpen: false, type: null, item: null });
        return;
      } else if (type === "task") {
        const res = await fetch(`/api/tasks/${item._id}`, { method: "DELETE" });
        if (!res.ok) {
          const errData = await res.json();
          triggerFeedback("error", errData.error || "Failed to delete task.");
          return;
        }

        const updatedTasks = tasks.filter((t) => t._id !== item._id);
        setTasks(updatedTasks);

        const newStats = calculateProjectProgress(
          updatedTasks,
          project.manualProgress || 0
        );

        setStats((prev) => ({
          ...prev,
          progress: newStats.progress,
          progressSource: newStats.progressSource,
          taskCounts: newStats.taskCounts,
        }));

        triggerFeedback("success", "Task deleted successfully.");
      } else if (type === "milestone") {
        const res = await fetch(`/api/milestones/${item._id}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const errData = await res.json();
          triggerFeedback("error", errData.error || "Failed to delete milestone.");
          return;
        }

        const updatedMilestones = milestones.filter((m) => m._id !== item._id);
        setMilestones(updatedMilestones);

        const newMilestoneStats = calculateMilestoneStats(updatedMilestones);
        setStats((prev) => ({
          ...prev,
          milestoneCounts: newMilestoneStats,
        }));

        triggerFeedback("success", "Milestone deleted successfully.");
      }

      setDeleteDialog({ isOpen: false, type: null, item: null });
    } catch (err) {
      console.error("Deletion error:", err);
      triggerFeedback("error", "Network error during deletion.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Breadcrumb & Navigation */}
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/dashboard/projects"
          className="inline-flex items-center gap-2 text-xs font-mono-measured text-ink-muted hover:text-ink transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>// projects / catalog</span>
        </Link>

        <div className="flex items-center gap-2 text-[11px] font-mono-measured text-ink-muted">
          <span>slug:</span>
          <span className="text-cool font-medium">//{project.slug}</span>
        </div>
      </div>

      {/* Floating Feedback Notification */}
      {feedback ? (
        <div
          role="status"
          className={`rounded-card border p-3.5 text-xs flex items-center justify-between transition-all ${
            feedback.type === "success"
              ? "border-ok/40 bg-ok-soft text-ok"
              : "border-bad/40 bg-bad-soft text-bad"
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
            )}
            <span className="font-medium">{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-[11px] font-mono-measured hover:underline"
          >
            dismiss
          </button>
        </div>
      ) : null}

      {/* Project Overview Card */}
      <div className="rounded-card border border-rule bg-paper-2 p-6 sm:p-8 space-y-6">
        {/* Header Row: Category, Priority, Visibility, Status */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-2 flex-1">
            <div className="flex items-center gap-2 flex-wrap text-xs font-mono-measured">
              <span className="text-cool font-medium">
                {project.category || "General"}
              </span>
              <span className="text-rule-2">·</span>
              <span
                className={`px-1.5 py-0.5 rounded border text-[10px] ${getPriorityClass(
                  project.priority
                )}`}
              >
                {project.priority} priority
              </span>
              <span className="text-rule-2">·</span>
              <span className="text-ink-muted text-[10px] px-1.5 py-0.5 rounded border border-rule bg-paper-3">
                {project.visibility}
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-medium tracking-tight text-ink">
              {project.title}
            </h1>

            <p className="text-xs sm:text-sm text-ink-muted leading-relaxed max-w-3xl">
              {project.shortDescription}
            </p>
          </div>

          <div className="flex items-center gap-2.5 self-start flex-shrink-0">
            <Link href={`/dashboard/projects/${project._id}/edit`}>
              <Button
                variant="secondary"
                size="sm"
                className="text-xs gap-1.5 font-medium"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Edit Project</span>
              </Button>
            </Link>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => openDeleteDialog("project", project)}
              disabled={isDeleting}
              className="text-xs gap-1.5 font-medium text-ink-muted hover:text-bad hover:bg-bad-soft/60 border border-rule/60 hover:border-bad/40 transition-colors"
              title="Delete project"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </Button>

            <Badge
              variant={getStatusBadgeVariant(project.status)}
              className="text-xs font-mono-measured px-3 py-1"
            >
              {project.status}
            </Badge>
          </div>
        </div>

        {/* Progress Section */}
        <div className="space-y-2 pt-4 border-t border-rule/60">
          <div className="flex items-center justify-between text-xs font-mono-measured text-ink-muted">
            <div className="flex items-center gap-2">
              <span className="text-ink font-medium">Sprint Delivery Progress</span>
              <span className="text-[11px]">
                ({stats.progressSource === "tasks"
                  ? `${stats.taskCounts.completed} of ${stats.taskCounts.total} tasks completed`
                  : "manual progress target"})
              </span>
            </div>
            <span className="text-ink font-medium text-sm">{stats.progress}%</span>
          </div>

          <div className="w-full h-2 rounded-pill bg-paper-3 border border-rule/50 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                stats.progress === 100 ? "bg-ok" : "bg-accent"
              }`}
              style={{ width: `${stats.progress}%` }}
            />
          </div>
        </div>

        {/* Tech Stack & Tags */}
        {(Array.isArray(project.techStack) && project.techStack.length > 0) ||
        (Array.isArray(project.tags) && project.tags.length > 0) ? (
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 pt-4 border-t border-rule/60 text-xs">
            {project.techStack?.length > 0 ? (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-ink-muted font-mono-measured text-[11px] flex items-center gap-1">
                  <Code2 className="w-3.5 h-3.5" />
                  <span>stack:</span>
                </span>
                {project.techStack.map((tech, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-0.5 rounded bg-paper-3 border border-rule text-[11px] font-mono-measured text-ink-2"
                  >
                    {tech}
                  </span>
                ))}
              </div>
            ) : null}

            {project.tags?.length > 0 ? (
              <div className="flex items-center gap-2 flex-wrap sm:ml-auto">
                <span className="text-ink-muted font-mono-measured text-[11px] flex items-center gap-1">
                  <Tag className="w-3 h-3" />
                  <span>tags:</span>
                </span>
                {project.tags.map((tag, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-0.5 rounded bg-paper-3/60 border border-rule/60 text-[10px] font-mono-measured text-ink-muted"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* External Links Bar (Only rendered when URLs exist) */}
        {project.repositoryUrl || project.liveUrl || project.demoUrl || project.docsUrl ? (
          <div className="flex items-center gap-3 flex-wrap pt-4 border-t border-rule/60 text-xs font-mono-measured">
            <span className="text-ink-muted text-[11px]">resources:</span>

            {project.repositoryUrl ? (
              <a
                href={project.repositoryUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-paper-3 border border-rule text-ink hover:text-accent hover:border-accent/40 transition-colors"
              >
                <Github className="w-3.5 h-3.5" />
                <span>Repository</span>
                <ExternalLink className="w-3 h-3 text-ink-muted" />
              </a>
            ) : null}

            {project.liveUrl ? (
              <a
                href={project.liveUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-paper-3 border border-rule text-ink hover:text-accent hover:border-accent/40 transition-colors"
              >
                <Globe className="w-3.5 h-3.5" />
                <span>Live Site</span>
                <ExternalLink className="w-3 h-3 text-ink-muted" />
              </a>
            ) : null}

            {project.demoUrl ? (
              <a
                href={project.demoUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-paper-3 border border-rule text-ink hover:text-accent hover:border-accent/40 transition-colors"
              >
                <Globe className="w-3.5 h-3.5" />
                <span>Demo</span>
                <ExternalLink className="w-3 h-3 text-ink-muted" />
              </a>
            ) : null}

            {project.docsUrl ? (
              <a
                href={project.docsUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-paper-3 border border-rule text-ink hover:text-accent hover:border-accent/40 transition-colors"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Docs</span>
                <ExternalLink className="w-3 h-3 text-ink-muted" />
              </a>
            ) : null}
          </div>
        ) : null}

        {/* Schedule & Metadata Dates */}
        <div className="flex items-center justify-between flex-wrap gap-4 pt-4 border-t border-rule/60 text-[11px] font-mono-measured text-ink-muted">
          <div className="flex items-center gap-4 flex-wrap">
            {project.startDate ? (
              <span>Started: {formatDate(project.startDate)}</span>
            ) : null}
            {project.deadline ? (
              <span className="text-accent font-medium">
                Deadline: {formatDate(project.deadline)}
              </span>
            ) : null}
            {project.completedAt ? (
              <span className="text-ok font-medium">
                Completed: {formatDate(project.completedAt)}
              </span>
            ) : null}
          </div>

          <span>Created {formatDate(project.createdAt)}</span>
        </div>
      </div>

      {/* Tab Navigation: Tasks | Milestones | Details */}
      <div className="border-b border-rule">
        <nav className="flex items-center gap-6 text-xs font-mono-measured">
          <button
            type="button"
            onClick={() => setActiveTab("tasks")}
            className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === "tasks"
                ? "border-accent text-accent font-medium"
                : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            <ListTodo className="w-4 h-4" />
            <span>Tasks ({tasks.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("milestones")}
            className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === "milestones"
                ? "border-accent text-accent font-medium"
                : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            <Flag className="w-4 h-4" />
            <span>Milestones ({milestones.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === "overview"
                ? "border-accent text-accent font-medium"
                : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Detailed Notes</span>
          </button>
        </nav>
      </div>

      {/* Tab 1: Tasks Content */}
      {activeTab === "tasks" ? (
        <TaskList
          tasks={tasks}
          onNewTask={() => {
            setEditingTask(null);
            setTaskModalOpen(true);
          }}
          onEditTask={(task) => {
            setEditingTask(task);
            setTaskModalOpen(true);
          }}
          onDeleteTask={(task) => openDeleteDialog("task", task)}
          onStatusToggle={handleTaskStatusToggle}
          isTogglingId={isTogglingTaskId}
        />
      ) : null}

      {/* Tab 2: Milestones Content */}
      {activeTab === "milestones" ? (
        <MilestoneList
          milestones={milestones}
          onNewMilestone={() => {
            setEditingMilestone(null);
            setMilestoneModalOpen(true);
          }}
          onEditMilestone={(milestone) => {
            setEditingMilestone(milestone);
            setMilestoneModalOpen(true);
          }}
          onDeleteMilestone={(milestone) =>
            openDeleteDialog("milestone", milestone)
          }
          onStatusToggle={handleMilestoneStatusToggle}
          isTogglingId={isTogglingMilestoneId}
        />
      ) : null}

      {/* Tab 3: Detailed Notes Content */}
      {activeTab === "overview" ? (
        <div className="space-y-6">
          <div className="rounded-card border border-rule bg-paper-2 p-6 sm:p-8 space-y-6">
            <div>
              <h3 className="text-sm font-medium text-ink mb-2">Extended Specification</h3>
              {project.description ? (
                <p className="text-xs text-ink-muted leading-relaxed whitespace-pre-wrap">
                  {project.description}
                </p>
              ) : (
                <p className="text-xs text-ink-muted italic">
                  No extended description provided for this project.
                </p>
              )}
            </div>

            {project.notes ? (
              <div className="pt-4 border-t border-rule/60">
                <h3 className="text-sm font-medium text-ink mb-2">Developer Notes</h3>
                <p className="text-xs text-ink-muted leading-relaxed whitespace-pre-wrap">
                  {project.notes}
                </p>
              </div>
            ) : null}
          </div>

          {/* Danger Zone: Delete Project */}
          <div className="rounded-card border border-bad/30 bg-bad-soft/10 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h4 className="text-xs font-medium text-ink flex items-center gap-1.5 text-bad">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Danger Zone: Delete Project</span>
              </h4>
              <p className="text-[11px] text-ink-muted leading-relaxed">
                Permanently delete this project and all associated tasks, milestones, and activity history.
              </p>
            </div>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => openDeleteDialog("project", project)}
              disabled={isDeleting}
              className="text-xs gap-1.5 bg-bad text-paper hover:bg-bad/90 font-medium self-start sm:self-auto flex-shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Project</span>
            </Button>
          </div>
        </div>
      ) : null}

      {/* Task Create / Edit Modal */}
      <TaskModal
        isOpen={taskModalOpen}
        task={editingTask}
        projectId={project._id}
        onClose={() => setTaskModalOpen(false)}
        onSuccess={handleTaskSaved}
      />

      {/* Milestone Create / Edit Modal */}
      <MilestoneModal
        isOpen={milestoneModalOpen}
        milestone={editingMilestone}
        projectId={project._id}
        onClose={() => setMilestoneModalOpen(false)}
        onSuccess={handleMilestoneSaved}
      />

      {/* Safe Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        isOpen={deleteDialog.isOpen}
        title={
          deleteDialog.type === "project"
            ? "Delete Project"
            : deleteDialog.type === "task"
            ? "Delete Task"
            : "Delete Milestone"
        }
        message={
          deleteDialog.type === "project"
            ? "Are you sure you want to permanently delete this project? This will permanently delete the project and all associated tasks, milestones, and activities. This action cannot be undone."
            : deleteDialog.type === "task"
            ? "Are you sure you want to permanently delete this task? Associated sprint progress will be updated."
            : "Are you sure you want to permanently delete this milestone?"
        }
        itemName={deleteDialog.item?.title || ""}
        confirmText={
          deleteDialog.type === "project" ? "Delete Project" : "Confirm Delete"
        }
        isDeleting={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() =>
          setDeleteDialog({ isOpen: false, type: null, item: null })
        }
      />
    </div>
  );
}
