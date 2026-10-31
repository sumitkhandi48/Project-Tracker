"use client";

import { useState } from "react";
import {
  Flag,
  Calendar,
  CheckCircle2,
  Plus,
  Pencil,
  Trash2,
  Clock,
  Check,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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

function getMilestoneBadgeVariant(status) {
  switch (status) {
    case "Completed":
      return "ok";
    case "In Progress":
      return "amber";
    case "Planned":
    default:
      return "default";
  }
}

export function MilestoneList({
  milestones = [],
  onNewMilestone,
  onEditMilestone,
  onDeleteMilestone,
  onStatusToggle,
  isTogglingId = null,
}) {
  const [filter, setFilter] = useState("ALL");

  const totalCount = milestones.length;
  const plannedCount = milestones.filter((m) => m.status === "Planned").length;
  const inProgressCount = milestones.filter((m) => m.status === "In Progress").length;
  const completedCount = milestones.filter((m) => m.status === "Completed").length;

  const filteredMilestones = milestones.filter((m) => {
    if (filter === "ALL") return true;
    return m.status === filter;
  });

  return (
    <div className="space-y-4">
      {/* Milestone Controls Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-rule/70">
        {/* Status Filter Pills */}
        <div className="flex items-center gap-1.5 flex-wrap text-xs font-mono-measured">
          <button
            type="button"
            onClick={() => setFilter("ALL")}
            className={`px-2.5 py-1 rounded border transition-colors ${
              filter === "ALL"
                ? "bg-paper-3 text-accent border-accent/40 font-medium"
                : "bg-paper border-rule text-ink-muted hover:text-ink"
            }`}
          >
            All ({totalCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter("Planned")}
            className={`px-2.5 py-1 rounded border transition-colors ${
              filter === "Planned"
                ? "bg-paper-3 text-accent border-accent/40 font-medium"
                : "bg-paper border-rule text-ink-muted hover:text-ink"
            }`}
          >
            Planned ({plannedCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter("In Progress")}
            className={`px-2.5 py-1 rounded border transition-colors ${
              filter === "In Progress"
                ? "bg-paper-3 text-accent border-accent/40 font-medium"
                : "bg-paper border-rule text-ink-muted hover:text-ink"
            }`}
          >
            In Progress ({inProgressCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter("Completed")}
            className={`px-2.5 py-1 rounded border transition-colors ${
              filter === "Completed"
                ? "bg-paper-3 text-ok border-ok/40 font-medium"
                : "bg-paper border-rule text-ink-muted hover:text-ink"
            }`}
          >
            Completed ({completedCount})
          </button>
        </div>

        {/* Create Milestone Button */}
        <Button
          type="button"
          size="sm"
          variant="default"
          onClick={onNewMilestone}
          className="text-xs gap-1.5 font-medium self-start sm:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Milestone</span>
        </Button>
      </div>

      {/* Milestone List Items */}
      {filteredMilestones.length === 0 ? (
        <div className="rounded-card border border-rule bg-paper-2 p-10 text-center text-xs text-ink-muted space-y-3">
          <div className="w-10 h-10 rounded-pill bg-paper-3 border border-rule mx-auto flex items-center justify-center text-ink-muted">
            <Flag className="w-5 h-5 text-ink-muted" />
          </div>
          <h3 className="text-sm font-medium text-ink">
            {totalCount === 0 ? "No milestones defined yet" : "No milestones match the filter"}
          </h3>
          <p className="max-w-sm mx-auto leading-relaxed">
            {totalCount === 0
              ? "Establish high-level sprint goals, releases, or major delivery gates for this project."
              : `There are currently no milestones with status '${filter}'.`}
          </p>
          {totalCount === 0 ? (
            <div className="pt-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={onNewMilestone}
                className="text-xs gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Define First Milestone</span>
              </Button>
            </div>
          ) : (
            <div className="pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setFilter("ALL")}
                className="text-xs text-ink-muted hover:text-ink"
              >
                Reset Filter
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredMilestones.map((milestone, index) => {
            const isCompleted = milestone.status === "Completed";
            const isToggling = isTogglingId === milestone._id;

            return (
              <div
                key={milestone._id}
                className={`rounded-card border transition-all p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4 ${
                  isCompleted
                    ? "bg-paper-2/60 border-rule/60 opacity-80"
                    : "bg-paper-2 border-rule hover:border-rule-2"
                }`}
              >
                {/* Left: Indicator & Content */}
                <div className="flex items-start gap-3.5 flex-1 min-w-0">
                  <div
                    className={`mt-0.5 w-6 h-6 rounded-pill flex items-center justify-center border text-[11px] font-mono-measured flex-shrink-0 ${
                      isCompleted
                        ? "bg-ok-soft border-ok/40 text-ok"
                        : milestone.status === "In Progress"
                        ? "bg-accent-soft border-accent/40 text-accent"
                        : "bg-paper-3 border-rule text-ink-muted"
                    }`}
                  >
                    {isCompleted ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <span>{index + 1}</span>
                    )}
                  </div>

                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h4
                        className={`text-sm font-medium leading-snug break-words ${
                          isCompleted ? "line-through text-ink-muted" : "text-ink"
                        }`}
                      >
                        {milestone.title}
                      </h4>
                    </div>

                    {milestone.description ? (
                      <p className="text-xs text-ink-muted leading-relaxed whitespace-pre-wrap">
                        {milestone.description}
                      </p>
                    ) : null}

                    {/* Metadata chips */}
                    <div className="flex items-center gap-2.5 flex-wrap text-[11px] font-mono-measured pt-1">
                      <Badge
                        variant={getMilestoneBadgeVariant(milestone.status)}
                        className="text-[10px] py-0 px-1.5"
                      >
                        {milestone.status}
                      </Badge>

                      {milestone.targetDate ? (
                        <span className="flex items-center gap-1 text-ink-muted text-[10px]">
                          <Calendar className="w-3 h-3 text-ink-muted" />
                          <span>Target: {formatDate(milestone.targetDate)}</span>
                        </span>
                      ) : null}

                      {milestone.completedAt ? (
                        <span className="text-ok/80 text-[10px]">
                          Completed {formatDate(milestone.completedAt)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-1.5 self-end sm:self-start flex-shrink-0 pt-1 sm:pt-0">
                  {/* Status Toggle Button */}
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => onStatusToggle(milestone)}
                    disabled={isToggling}
                    className="h-8 text-xs font-mono-measured"
                  >
                    {isCompleted ? "Reopen" : "Mark Completed"}
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onEditMilestone(milestone)}
                    className="h-8 px-2 text-xs text-ink-muted hover:text-ink"
                    title="Edit milestone"
                  >
                    <Pencil className="w-3 h-3" />
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onDeleteMilestone(milestone)}
                    className="h-8 px-2 text-xs text-ink-muted hover:text-bad"
                    title="Delete milestone"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
