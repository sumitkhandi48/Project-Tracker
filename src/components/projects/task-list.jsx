"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Circle,
  Clock,
  Calendar,
  AlertCircle,
  Plus,
  Pencil,
  Trash2,
  Check,
  Filter,
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

function getStatusBadgeVariant(status) {
  switch (status) {
    case "Done":
      return "ok";
    case "In Progress":
      return "amber";
    case "Todo":
    default:
      return "default";
  }
}

export function TaskList({
  tasks = [],
  onNewTask,
  onEditTask,
  onDeleteTask,
  onStatusToggle,
  isTogglingId = null,
}) {
  const [filter, setFilter] = useState("ALL");

  const totalCount = tasks.length;
  const todoCount = tasks.filter((t) => t.status === "Todo").length;
  const inProgressCount = tasks.filter((t) => t.status === "In Progress").length;
  const doneCount = tasks.filter((t) => t.status === "Done").length;

  const filteredTasks = tasks.filter((task) => {
    if (filter === "ALL") return true;
    return task.status === filter;
  });

  return (
    <div className="space-y-4">
      {/* Task Controls Header */}
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
            onClick={() => setFilter("Todo")}
            className={`px-2.5 py-1 rounded border transition-colors ${
              filter === "Todo"
                ? "bg-paper-3 text-accent border-accent/40 font-medium"
                : "bg-paper border-rule text-ink-muted hover:text-ink"
            }`}
          >
            Todo ({todoCount})
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
            onClick={() => setFilter("Done")}
            className={`px-2.5 py-1 rounded border transition-colors ${
              filter === "Done"
                ? "bg-paper-3 text-ok border-ok/40 font-medium"
                : "bg-paper border-rule text-ink-muted hover:text-ink"
            }`}
          >
            Done ({doneCount})
          </button>
        </div>

        {/* Create Task Button */}
        <Button
          type="button"
          size="sm"
          variant="default"
          onClick={onNewTask}
          className="text-xs gap-1.5 font-medium self-start sm:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Task</span>
        </Button>
      </div>

      {/* Task List Items */}
      {filteredTasks.length === 0 ? (
        <div className="rounded-card border border-rule bg-paper-2 p-10 text-center text-xs text-ink-muted space-y-3">
          <div className="w-10 h-10 rounded-pill bg-paper-3 border border-rule mx-auto flex items-center justify-center text-ink-muted">
            <CheckCircle2 className="w-5 h-5 text-ink-muted" />
          </div>
          <h3 className="text-sm font-medium text-ink">
            {totalCount === 0 ? "No tasks added yet" : "No tasks match the filter"}
          </h3>
          <p className="max-w-sm mx-auto leading-relaxed">
            {totalCount === 0
              ? "Break down this project into trackable units of work, bugs, and deliverables."
              : `There are currently no tasks with status '${filter}'.`}
          </p>
          {totalCount === 0 ? (
            <div className="pt-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={onNewTask}
                className="text-xs gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create First Task</span>
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
        <div className="space-y-2.5">
          {filteredTasks.map((task) => {
            const isDone = task.status === "Done";
            const isToggling = isTogglingId === task._id;

            return (
              <div
                key={task._id}
                className={`rounded-card border transition-all p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-4 ${
                  isDone
                    ? "bg-paper-2/60 border-rule/60 opacity-80"
                    : "bg-paper-2 border-rule hover:border-rule-2"
                }`}
              >
                {/* Left: Status Toggle & Info */}
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  {/* Status Toggle Button */}
                  <button
                    type="button"
                    onClick={() => onStatusToggle(task)}
                    disabled={isToggling}
                    className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center border transition-colors flex-shrink-0 ${
                      isDone
                        ? "bg-ok border-ok text-paper"
                        : "border-rule bg-paper-3 hover:border-accent text-transparent hover:text-accent/50"
                    }`}
                    title={isDone ? "Reopen task" : "Mark as Done"}
                    aria-label={isDone ? "Reopen task" : "Mark as Done"}
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>

                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-sm font-medium leading-snug break-words ${
                          isDone ? "line-through text-ink-muted" : "text-ink"
                        }`}
                      >
                        {task.title}
                      </span>
                    </div>

                    {task.description ? (
                      <p className="text-xs text-ink-muted leading-relaxed whitespace-pre-wrap">
                        {task.description}
                      </p>
                    ) : null}

                    {/* Metadata chips */}
                    <div className="flex items-center gap-2 flex-wrap text-[11px] font-mono-measured pt-1">
                      <Badge
                        variant={getStatusBadgeVariant(task.status)}
                        className="text-[10px] py-0 px-1.5"
                      >
                        {task.status}
                      </Badge>

                      <span
                        className={`px-1.5 py-0.5 rounded border text-[10px] ${getPriorityClass(
                          task.priority
                        )}`}
                      >
                        {task.priority}
                      </span>

                      {task.dueDate ? (
                        <span className="flex items-center gap-1 text-ink-muted text-[10px]">
                          <Calendar className="w-3 h-3 text-ink-muted" />
                          <span>Due {formatDate(task.dueDate)}</span>
                        </span>
                      ) : null}

                      {task.completedAt ? (
                        <span className="text-ok/80 text-[10px]">
                          Completed {formatDate(task.completedAt)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-1.5 self-end sm:self-start flex-shrink-0 pt-1 sm:pt-0">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onEditTask(task)}
                    className="h-8 px-2 text-xs text-ink-muted hover:text-ink gap-1"
                    title="Edit task"
                  >
                    <Pencil className="w-3 h-3" />
                    <span>Edit</span>
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onDeleteTask(task)}
                    className="h-8 px-2 text-xs text-ink-muted hover:text-bad gap-1"
                    title="Delete task"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Delete</span>
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
