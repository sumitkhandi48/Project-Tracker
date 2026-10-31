"use client";

import { useRef } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDialogFocus } from "@/lib/utils/dialog-focus";

export function DeleteConfirmDialog({
  isOpen,
  title = "Confirm Deletion",
  message = "Are you sure you want to delete this item? This action cannot be undone.",
  itemName = "",
  confirmText = "Confirm Delete",
  isDeleting = false,
  onConfirm,
  onCancel,
}) {
  const cancelButtonRef = useRef(null);
  const dialogRef = useDialogFocus({
    isOpen,
    isLocked: isDeleting,
    onClose: onCancel,
    initialFocusRef: cancelButtonRef,
  });

  if (!isOpen) return null;

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-dialog-title"
      aria-describedby="delete-dialog-description"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-paper/80 backdrop-blur-sm outline-none"
    >
      <div className="w-full max-w-md rounded-card border border-bad/40 bg-paper-2 p-6 shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-pill bg-bad-soft border border-bad/40 flex items-center justify-center text-bad flex-shrink-0 mt-0.5">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="space-y-1">
            <h2 id="delete-dialog-title" className="text-base font-medium text-ink">
              {title}
            </h2>
            <p id="delete-dialog-description" className="text-xs text-ink-muted leading-relaxed">
              {message}
            </p>
            {itemName ? (
              <p className="text-xs font-mono-measured text-bad bg-bad-soft px-2 py-1 rounded border border-bad/30 break-all mt-2">
                &ldquo;{itemName}&rdquo;
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-rule/60">
          <Button
            ref={cancelButtonRef}
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={isDeleting}
            className="text-xs"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={onConfirm}
            disabled={isDeleting}
            className="text-xs gap-1.5 bg-bad text-paper hover:bg-bad/90"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Deleting...</span>
              </>
            ) : (
              <span>{confirmText}</span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
