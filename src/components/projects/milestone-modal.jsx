"use client";

import { useState, useEffect, useRef } from "react";
import { X, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useDialogFocus } from "@/lib/utils/dialog-focus";

const MILESTONE_STATUSES = ["Planned", "In Progress", "Completed"];

export function MilestoneModal({
  isOpen,
  milestone = null,
  projectId,
  onClose,
  onSuccess,
}) {
  const isEdit = Boolean(milestone);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("Planned");
  const [targetDate, setTargetDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState([]);

  const titleInputRef = useRef(null);
  const dialogRef = useDialogFocus({
    isOpen,
    isLocked: isSubmitting,
    onClose,
    initialFocusRef: titleInputRef,
  });

  useEffect(() => {
    if (milestone) {
      setTitle(milestone.title || "");
      setDescription(milestone.description || "");
      setStatus(milestone.status || "Planned");
      if (milestone.targetDate) {
        const d = new Date(milestone.targetDate);
        if (!isNaN(d.getTime())) {
          setTargetDate(d.toISOString().split("T")[0]);
        } else {
          setTargetDate("");
        }
      } else {
        setTargetDate("");
      }
    } else {
      setTitle("");
      setDescription("");
      setStatus("Planned");
      setTargetDate("");
    }
    setErrorMessage("");
    setFieldErrors([]);
  }, [milestone, isOpen]);

  if (!isOpen) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMessage("");
    setFieldErrors([]);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setErrorMessage("Milestone title is required.");
      return;
    }

    if (trimmedTitle.length > 200) {
      setErrorMessage("Milestone title cannot exceed 200 characters.");
      return;
    }

    if (description && description.length > 3000) {
      setErrorMessage("Description cannot exceed 3000 characters.");
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        title: trimmedTitle,
        description: description ? description.trim() : "",
        status,
        targetDate: targetDate ? new Date(targetDate).toISOString() : null,
      };

      const url = isEdit
        ? `/api/milestones/${milestone._id}`
        : `/api/projects/${projectId}/milestones`;
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.errors && Array.isArray(data.errors)) {
          setFieldErrors(data.errors);
        } else {
          setErrorMessage(data.error || "Failed to save milestone. Please try again.");
        }
        setIsSubmitting(false);
        return;
      }

      onSuccess(data.milestone, isEdit);
      onClose();
    } catch (err) {
      console.error("Milestone submission error:", err);
      setErrorMessage("An unexpected network error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="milestone-modal-title"
      aria-describedby="milestone-modal-description"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-paper/80 backdrop-blur-sm outline-none"
    >
      <div className="w-full max-w-lg rounded-card border border-rule bg-paper-2 p-6 shadow-xl space-y-5 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-rule">
          <div>
            <h2 id="milestone-modal-title" className="text-base font-medium text-ink">
              {isEdit ? "Edit Milestone" : "Define New Milestone"}
            </h2>
            <p id="milestone-modal-description" className="text-xs text-ink-muted">
              {isEdit ? "Update milestone roadmap targets." : "Establish a key objective or delivery phase."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="text-ink-muted hover:text-ink transition-colors p-1 rounded hover:bg-paper-3 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Error notification */}
        {errorMessage || fieldErrors.length > 0 ? (
          <div className="rounded border border-bad/50 bg-bad-soft p-3 text-xs text-bad space-y-1">
            {errorMessage ? (
              <div className="flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{errorMessage}</span>
              </div>
            ) : null}
            {fieldErrors.map((err, idx) => (
              <p key={idx} className="font-mono-measured text-[11px] pl-5">
                • {err}
              </p>
            ))}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-ink flex items-center justify-between">
              <span>Milestone Title *</span>
              <span className="text-[10px] font-mono-measured text-ink-muted">
                {title.length}/200
              </span>
            </label>
            <Input
              ref={titleInputRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Beta MVP Release (v0.5.0)"
              maxLength={200}
              required
              disabled={isSubmitting}
              className="text-xs"
            />
          </div>

          {/* Description */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-ink flex items-center justify-between">
              <span>Description</span>
              <span className="text-[10px] font-mono-measured text-ink-muted">
                {description.length}/3000
              </span>
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What are the key goals, deliverables, or acceptance criteria for this milestone?"
              rows={3}
              maxLength={3000}
              disabled={isSubmitting}
              className="text-xs resize-y"
            />
          </div>

          {/* Status & Target Date Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-ink">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                disabled={isSubmitting}
                className="w-full h-9 rounded-pill border border-rule bg-paper-3 px-3 py-1.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-accent"
              >
                {MILESTONE_STATUSES.map((s) => (
                  <option key={s} value={s} className="bg-paper-2 text-ink">
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-ink">Target Date</label>
              <Input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                disabled={isSubmitting}
                className="text-xs"
              />
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-rule">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              variant="default"
              disabled={isSubmitting || !title.trim()}
              className="text-xs gap-1.5 font-medium"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>{isEdit ? "Update Milestone" : "Create Milestone"}</span>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
