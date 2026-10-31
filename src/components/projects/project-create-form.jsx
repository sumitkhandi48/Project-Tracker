"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  AlertCircle,
  Loader2,
  FolderPlus,
  GitBranch,
  Calendar,
  Tag,
  Code2,
  FileText,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { slugify } from "@/lib/utils/slugify";

const PROJECT_STATUSES = ["Planned", "In Progress", "On Hold", "Completed"];
const PROJECT_PRIORITIES = ["Low", "Medium", "High", "Critical"];
const PROJECT_VISIBILITIES = ["Private", "Public"];

function toDateInputValue(val) {
  if (!val) return "";
  const d = new Date(val);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().split("T")[0];
}

export function ProjectForm({
  mode = "create",
  initialData = null,
  projectId = null,
}) {
  const router = useRouter();
  const isEdit = mode === "edit";
  const effectiveProjectId = projectId || initialData?._id;

  // Primary fields
  const [title, setTitle] = useState(initialData?.title || "");
  const [slug, setSlug] = useState(initialData?.slug || "");
  const [autoSlug, setAutoSlug] = useState(!isEdit && !initialData?.slug);
  const [shortDescription, setShortDescription] = useState(
    initialData?.shortDescription || ""
  );
  const [category, setCategory] = useState(initialData?.category || "General");
  const [status, setStatus] = useState(initialData?.status || "Planned");
  const [priority, setPriority] = useState(initialData?.priority || "Medium");
  const [visibility, setVisibility] = useState(
    initialData?.visibility || "Private"
  );

  // Timeline & progress
  const [startDate, setStartDate] = useState(
    toDateInputValue(initialData?.startDate)
  );
  const [deadline, setDeadline] = useState(
    toDateInputValue(initialData?.deadline)
  );
  const [progress, setProgress] = useState(
    initialData?.manualProgress ?? initialData?.progress ?? 0
  );

  // Stack & links
  const [techStackInput, setTechStackInput] = useState(
    Array.isArray(initialData?.techStack)
      ? initialData.techStack.join(", ")
      : ""
  );
  const [tagsInput, setTagsInput] = useState(
    Array.isArray(initialData?.tags) ? initialData.tags.join(", ") : ""
  );
  const [repositoryUrl, setRepositoryUrl] = useState(
    initialData?.repositoryUrl || ""
  );
  const [liveUrl, setLiveUrl] = useState(initialData?.liveUrl || "");
  const [demoUrl, setDemoUrl] = useState(initialData?.demoUrl || "");
  const [docsUrl, setDocsUrl] = useState(initialData?.docsUrl || "");

  // Detailed content
  const [description, setDescription] = useState(
    initialData?.description || ""
  );
  const [notes, setNotes] = useState(initialData?.notes || "");

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState([]);

  // Auto-slug sync
  const handleTitleChange = (e) => {
    const val = e.target.value;
    setTitle(val);
    if (autoSlug) {
      setSlug(slugify(val));
    }
  };

  const handleSlugChange = (e) => {
    setAutoSlug(false);
    setSlug(e.target.value);
  };

  const cancelHref = isEdit
    ? `/dashboard/projects/${effectiveProjectId}`
    : "/dashboard/projects";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormErrors([]);

    // Client-side quick checks for UX
    const errors = [];
    if (!title.trim()) {
      errors.push("Project title is required.");
    } else if (title.trim().length > 150) {
      errors.push("Title cannot exceed 150 characters.");
    }

    if (!shortDescription.trim()) {
      errors.push("Short description is required.");
    } else if (shortDescription.trim().length > 300) {
      errors.push("Short description cannot exceed 300 characters.");
    }

    const urlFields = [
      { name: "Repository URL", val: repositoryUrl },
      { name: "Live URL", val: liveUrl },
      { name: "Demo URL", val: demoUrl },
      { name: "Docs URL", val: docsUrl },
    ];
    for (const { name, val } of urlFields) {
      if (val && !val.startsWith("http://") && !val.startsWith("https://")) {
        errors.push(`${name} must start with http:// or https://`);
      }
    }

    if (errors.length > 0) {
      setFormErrors(errors);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    // Assemble payload strictly omitting protected fields (owner, _id, isDeleting, timestamps)
    const payload = {
      title: title.trim(),
      shortDescription: shortDescription.trim(),
      category: category.trim() || "General",
      status,
      priority,
      visibility,
    };

    // If custom slug entered, include it; otherwise omit during create so server auto-generates cleanly
    if (slug.trim()) {
      payload.slug = slug.trim().toLowerCase();
    }

    payload.description = description.trim();
    payload.startDate = startDate ? new Date(startDate).toISOString() : null;
    payload.deadline = deadline ? new Date(deadline).toISOString() : null;

    const progNum = Number(progress);
    if (!isNaN(progNum) && progNum >= 0 && progNum <= 100) {
      payload.progress = progNum;
    }

    payload.techStack = techStackInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    payload.tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    payload.repositoryUrl = repositoryUrl.trim() || null;
    payload.liveUrl = liveUrl.trim() || null;
    payload.demoUrl = demoUrl.trim() || null;
    payload.docsUrl = docsUrl.trim() || null;
    payload.notes = notes.trim();

    setIsSubmitting(true);

    try {
      const endpoint = isEdit
        ? `/api/projects/${effectiveProjectId}`
        : "/api/projects";
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok) {
        if (isEdit) {
          router.push(`/dashboard/projects/${effectiveProjectId}?updated=true`);
          router.refresh();
        } else {
          router.push("/dashboard/projects?created=true");
        }
        return;
      }

      if (res.status === 400) {
        setFormErrors(
          Array.isArray(data.errors)
            ? data.errors
            : [data.error || "Validation failed"]
        );
      } else if (res.status === 409) {
        setFormErrors([
          data.error ||
            "A project with this slug already exists. Please choose a different title or slug.",
        ]);
      } else if (res.status === 404) {
        setFormErrors([
          data.error || "Project not found or access denied.",
        ]);
      } else {
        setFormErrors([
          data.error ||
            `An unexpected error occurred while ${
              isEdit ? "updating" : "creating"
            } the project. Please try again.`,
        ]);
      }

      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setFormErrors([
        "Network error: Unable to reach the server. Please check your connection.",
      ]);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-rule/60">
        <div>
          <Link
            href={cancelHref}
            className="inline-flex items-center gap-1.5 text-xs font-mono-measured text-ink-muted hover:text-ink transition-colors mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{isEdit ? "back to project detail" : "back to projects"}</span>
          </Link>
          <h1 className="text-2xl font-medium tracking-tight text-ink">
            {isEdit
              ? `Edit Project: ${initialData?.title || title}`
              : "Create New Project"}
          </h1>
          <p className="text-xs text-ink-muted mt-1">
            {isEdit
              ? "Update repository parameters, delivery schedule, and documentation links."
              : "Initialize a new repository profile in your private workspace."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href={cancelHref}>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="text-xs"
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          </Link>
          <Button
            type="submit"
            variant="default"
            size="sm"
            className="text-xs gap-1.5 font-medium min-w-[130px]"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>{isEdit ? "Saving Changes..." : "Creating..."}</span>
              </>
            ) : isEdit ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Save Changes</span>
              </>
            ) : (
              <>
                <FolderPlus className="w-3.5 h-3.5" />
                <span>Create Project</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Error Notice Box */}
      {formErrors.length > 0 ? (
        <div
          role="alert"
          className="rounded-card border border-bad/50 bg-bad-soft p-4 text-xs text-bad space-y-1"
        >
          <div className="flex items-center gap-2 font-medium">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>Please resolve the following submission issues:</span>
          </div>
          <ul className="list-disc list-inside space-y-0.5 pl-6 text-ink-muted">
            {formErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Section 1: Core Identification */}
      <div className="rounded-card border border-rule bg-paper-2 p-6 space-y-5">
        <div className="flex items-center gap-2 pb-3 border-b border-rule/50">
          <GitBranch className="w-4 h-4 text-accent" />
          <h2 className="text-sm font-medium text-ink">Project Identification</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Title */}
          <div className="md:col-span-2 space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <label htmlFor="project-title" className="font-medium text-ink">
                Project Title <span className="text-accent">*</span>
              </label>
              <span className="font-mono-measured text-ink-muted text-[11px]">
                {title.length}/150
              </span>
            </div>
            <Input
              id="project-title"
              placeholder="e.g. Distributed Event Pipeline"
              value={title}
              onChange={handleTitleChange}
              maxLength={150}
              required
              disabled={isSubmitting}
            />
          </div>

          {/* Slug */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <label htmlFor="project-slug" className="font-medium text-ink">
                URL Slug
              </label>
              <span className="font-mono-measured text-ink-muted text-[11px]">
                {autoSlug ? "auto-derived" : "custom"}
              </span>
            </div>
            <Input
              id="project-slug"
              placeholder="e.g. distributed-event-pipeline"
              value={slug}
              onChange={handleSlugChange}
              maxLength={150}
              className="font-mono-measured text-xs"
              disabled={isSubmitting}
            />
            <p className="text-[11px] text-ink-muted">
              Unique URL identifier for this project. Auto-generated from title if left blank.
            </p>
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <label htmlFor="project-category" className="text-xs font-medium text-ink block">
              Category
            </label>
            <Input
              id="project-category"
              placeholder="e.g. Infrastructure, Developer Tooling, Web App"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              maxLength={50}
              disabled={isSubmitting}
            />
          </div>

          {/* Short Description */}
          <div className="md:col-span-2 space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <label htmlFor="project-short-desc" className="font-medium text-ink">
                Short Description <span className="text-accent">*</span>
              </label>
              <span className="font-mono-measured text-ink-muted text-[11px]">
                {shortDescription.length}/300
              </span>
            </div>
            <Textarea
              id="project-short-desc"
              placeholder="Concise 1-2 sentence technical summary displayed in dashboard cards and listings."
              value={shortDescription}
              onChange={(e) => setShortDescription(e.target.value)}
              maxLength={300}
              rows={2}
              required
              disabled={isSubmitting}
            />
          </div>
        </div>
      </div>

      {/* Section 2: Status & Classification */}
      <div className="rounded-card border border-rule bg-paper-2 p-6 space-y-5">
        <div className="flex items-center gap-2 pb-3 border-b border-rule/50">
          <Tag className="w-4 h-4 text-cool" />
          <h2 className="text-sm font-medium text-ink">Status & Parameters</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {/* Status */}
          <div className="space-y-1.5">
            <label htmlFor="project-status" className="text-xs font-medium text-ink block">
              Status
            </label>
            <select
              id="project-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-9 w-full rounded-pill border border-rule bg-paper-3 px-3 py-1.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-accent"
              disabled={isSubmitting}
            >
              {PROJECT_STATUSES.map((s) => (
                <option key={s} value={s} className="bg-paper-2 text-ink">
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Priority */}
          <div className="space-y-1.5">
            <label htmlFor="project-priority" className="text-xs font-medium text-ink block">
              Priority
            </label>
            <select
              id="project-priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="h-9 w-full rounded-pill border border-rule bg-paper-3 px-3 py-1.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-accent"
              disabled={isSubmitting}
            >
              {PROJECT_PRIORITIES.map((p) => (
                <option key={p} value={p} className="bg-paper-2 text-ink">
                  {p}
                </option>
              ))}
            </select>
          </div>

          {/* Visibility */}
          <div className="space-y-1.5">
            <label htmlFor="project-visibility" className="text-xs font-medium text-ink block">
              Visibility
            </label>
            <select
              id="project-visibility"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value)}
              className="h-9 w-full rounded-pill border border-rule bg-paper-3 px-3 py-1.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-accent"
              disabled={isSubmitting}
            >
              {PROJECT_VISIBILITIES.map((v) => (
                <option key={v} value={v} className="bg-paper-2 text-ink">
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Section 3: Timeline & Progress */}
      <div className="rounded-card border border-rule bg-paper-2 p-6 space-y-5">
        <div className="flex items-center gap-2 pb-3 border-b border-rule/50">
          <Calendar className="w-4 h-4 text-ok" />
          <h2 className="text-sm font-medium text-ink">Timeline & Initial Progress</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {/* Start Date */}
          <div className="space-y-1.5">
            <label htmlFor="project-start-date" className="text-xs font-medium text-ink block">
              Start Date
            </label>
            <Input
              id="project-start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="font-mono-measured text-xs"
              disabled={isSubmitting}
            />
          </div>

          {/* Deadline */}
          <div className="space-y-1.5">
            <label htmlFor="project-deadline" className="text-xs font-medium text-ink block">
              Deadline / Target Completion
            </label>
            <Input
              id="project-deadline"
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="font-mono-measured text-xs"
              disabled={isSubmitting}
            />
          </div>

          {/* Manual Progress */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <label htmlFor="project-progress" className="font-medium text-ink">
                Manual Target Progress
              </label>
              <span className="font-mono-measured text-ink-muted text-[11px]">{progress}%</span>
            </div>
            <div className="flex items-center gap-3">
              <input
                id="project-progress"
                type="range"
                min="0"
                max="100"
                value={progress}
                onChange={(e) => setProgress(Number(e.target.value))}
                className="w-full accent-accent h-1.5 rounded-pill bg-paper-3"
                disabled={isSubmitting}
              />
              <Input
                type="number"
                min="0"
                max="100"
                value={progress}
                onChange={(e) => setProgress(Number(e.target.value))}
                className="w-16 font-mono-measured text-xs text-center px-1"
                disabled={isSubmitting}
              />
            </div>
            <p className="text-[11px] text-ink-muted">
              {isEdit && initialData?.taskCounts?.total > 0
                ? `Note: This project has ${initialData.taskCounts.total} tasks. Delivery progress is dynamically calculated from completed tasks on the project detail view.`
                : "When tasks are added to this project, delivery progress is automatically computed from task completion."}
            </p>
          </div>
        </div>
      </div>

      {/* Section 4: Tech Stack, Tags & URLs */}
      <div className="rounded-card border border-rule bg-paper-2 p-6 space-y-5">
        <div className="flex items-center gap-2 pb-3 border-b border-rule/50">
          <Code2 className="w-4 h-4 text-cool" />
          <h2 className="text-sm font-medium text-ink">Tech Stack & External Links</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Tech Stack */}
          <div className="space-y-1.5">
            <label htmlFor="project-tech-stack" className="text-xs font-medium text-ink block">
              Technology Stack (comma-separated)
            </label>
            <Input
              id="project-tech-stack"
              placeholder="e.g. Next.js, React, Tailwind, Mongoose"
              value={techStackInput}
              onChange={(e) => setTechStackInput(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <label htmlFor="project-tags" className="text-xs font-medium text-ink block">
              Tags (comma-separated)
            </label>
            <Input
              id="project-tags"
              placeholder="e.g. backend, telemetry, infra"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          {/* Repository URL */}
          <div className="space-y-1.5">
            <label htmlFor="project-repo-url" className="text-xs font-medium text-ink block">
              Repository URL
            </label>
            <Input
              id="project-repo-url"
              type="url"
              placeholder="https://github.com/..."
              value={repositoryUrl}
              onChange={(e) => setRepositoryUrl(e.target.value)}
              className="font-mono-measured text-xs"
              disabled={isSubmitting}
            />
          </div>

          {/* Live URL */}
          <div className="space-y-1.5">
            <label htmlFor="project-live-url" className="text-xs font-medium text-ink block">
              Live Production URL
            </label>
            <Input
              id="project-live-url"
              type="url"
              placeholder="https://..."
              value={liveUrl}
              onChange={(e) => setLiveUrl(e.target.value)}
              className="font-mono-measured text-xs"
              disabled={isSubmitting}
            />
          </div>

          {/* Demo URL */}
          <div className="space-y-1.5">
            <label htmlFor="project-demo-url" className="text-xs font-medium text-ink block">
              Demo / Staging URL
            </label>
            <Input
              id="project-demo-url"
              type="url"
              placeholder="https://staging..."
              value={demoUrl}
              onChange={(e) => setDemoUrl(e.target.value)}
              className="font-mono-measured text-xs"
              disabled={isSubmitting}
            />
          </div>

          {/* Docs URL */}
          <div className="space-y-1.5">
            <label htmlFor="project-docs-url" className="text-xs font-medium text-ink block">
              Documentation URL
            </label>
            <Input
              id="project-docs-url"
              type="url"
              placeholder="https://docs..."
              value={docsUrl}
              onChange={(e) => setDocsUrl(e.target.value)}
              className="font-mono-measured text-xs"
              disabled={isSubmitting}
            />
          </div>
        </div>
      </div>

      {/* Section 5: Extended Documentation & Notes */}
      <div className="rounded-card border border-rule bg-paper-2 p-6 space-y-5">
        <div className="flex items-center gap-2 pb-3 border-b border-rule/50">
          <FileText className="w-4 h-4 text-ink-muted" />
          <h2 className="text-sm font-medium text-ink">Extended Overview & Architecture Notes</h2>
        </div>

        <div className="space-y-5">
          {/* Detailed Description */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <label htmlFor="project-description" className="font-medium text-ink">
                Full Description / README Summary
              </label>
              <span className="font-mono-measured text-ink-muted text-[11px]">
                {description.length}/5000
              </span>
            </div>
            <Textarea
              id="project-description"
              placeholder="Detailed architecture description, component responsibilities, or deployment notes."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={5000}
              rows={4}
              disabled={isSubmitting}
            />
          </div>

          {/* Private Notes */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <label htmlFor="project-notes" className="font-medium text-ink">
                Private Work Notes
              </label>
              <span className="font-mono-measured text-ink-muted text-[11px]">
                {notes.length}/3000
              </span>
            </div>
            <Textarea
              id="project-notes"
              placeholder="Internal scratchpad notes, open questions, or sprint thoughts."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={3000}
              rows={2}
              disabled={isSubmitting}
            />
          </div>
        </div>
      </div>

      {/* Form Submission Actions */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-rule/60">
        <Link href={cancelHref}>
          <Button
            type="button"
            variant="secondary"
            className="text-xs"
            disabled={isSubmitting}
          >
            Cancel
          </Button>
        </Link>
        <Button
          type="submit"
          variant="default"
          className="text-xs gap-1.5 font-medium min-w-[140px]"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>{isEdit ? "Saving Changes..." : "Creating..."}</span>
            </>
          ) : isEdit ? (
            <>
              <Check className="w-3.5 h-3.5" />
              <span>Save Changes</span>
            </>
          ) : (
            <>
              <FolderPlus className="w-3.5 h-3.5" />
              <span>Create Project</span>
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

export function ProjectCreateForm(props) {
  return <ProjectForm mode="create" {...props} />;
}
