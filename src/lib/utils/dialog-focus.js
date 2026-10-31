"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR = [
  'a[href]:not([tabindex="-1"])',
  'button:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  'input:not([disabled]):not([type="hidden"]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"]):not([disabled])',
].join(", ");

/**
 * Reusable React hook providing accessible focus management for modal dialogs:
 * - Traps keyboard focus inside the dialog (Tab / Shift+Tab wrapping)
 * - Captures and sets initial focus into the dialog upon opening
 * - Restores focus to the triggering element upon closing (if still present)
 * - Listens for Escape key to dismiss dialog (respects lock states like isDeleting/isSubmitting)
 * - Ensures focus containment if focus shifts outside the dialog
 *
 * @param {object} options
 * @param {boolean} options.isOpen Whether the dialog is visible
 * @param {boolean} [options.isLocked=false] When true, prevents Escape key from closing the dialog
 * @param {function} [options.onClose] Callback executed when Escape key is pressed
 * @param {React.RefObject} [options.initialFocusRef] Optional ref to focus first
 * @returns {React.RefObject} Ref to attach to the dialog root container (role="dialog")
 */
export function useDialogFocus({
  isOpen,
  isLocked = false,
  onClose,
  initialFocusRef,
}) {
  const dialogRef = useRef(null);
  const triggerElementRef = useRef(null);

  // Keep mutable references so effect doesn't tear down when lock state changes
  const isLockedRef = useRef(isLocked);
  isLockedRef.current = isLocked;

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const initialFocusRefHolder = useRef(initialFocusRef);
  initialFocusRefHolder.current = initialFocusRef;

  useEffect(() => {
    if (!isOpen) return;

    // 1. Capture the currently focused element that triggered opening
    if (
      typeof document !== "undefined" &&
      document.activeElement &&
      document.activeElement !== document.body
    ) {
      triggerElementRef.current = document.activeElement;
    }

    const dialogNode = dialogRef.current;
    if (!dialogNode) return;

    // Helper to retrieve visible, non-disabled focusable elements inside dialog
    function getFocusableElements() {
      if (!dialogNode) return [];
      const nodes = Array.from(dialogNode.querySelectorAll(FOCUSABLE_SELECTOR));
      return nodes.filter((node) => {
        return Boolean(
          node.offsetWidth ||
          node.offsetHeight ||
          node.getClientRects().length
        );
      });
    }

    // 2. Set initial focus into the dialog
    const focusTarget = () => {
      const targetRef = initialFocusRefHolder.current;
      if (targetRef) {
        if (targetRef.current && typeof targetRef.current.focus === "function") {
          targetRef.current.focus();
          return;
        }
        // If initialFocusRef is specified, wait for it to mount
        return;
      }

      const focusable = getFocusableElements();
      if (focusable.length > 0) {
        focusable[0].focus();
      } else if (dialogNode && typeof dialogNode.focus === "function") {
        dialogNode.focus();
      }
    };

    // Execute immediately and after a short tick to handle mounting/transitions
    focusTarget();
    const timer = setTimeout(focusTarget, 30);

    // 3. Complete Tab key focus trapping & Escape key handling
    function handleKeyDown(e) {
      if (e.key === "Escape") {
        if (!isLockedRef.current && typeof onCloseRef.current === "function") {
          e.preventDefault();
          e.stopPropagation();
          onCloseRef.current();
        }
        return;
      }

      if (e.key === "Tab") {
        e.preventDefault();

        const focusable = getFocusableElements();
        if (focusable.length === 0) {
          if (dialogNode && typeof dialogNode.focus === "function") {
            dialogNode.focus();
          }
          return;
        }

        const currentIndex = focusable.indexOf(document.activeElement);

        let nextIndex;
        if (e.shiftKey) {
          // Shift + Tab: reverse cycle
          if (currentIndex <= 0) {
            nextIndex = focusable.length - 1;
          } else {
            nextIndex = currentIndex - 1;
          }
        } else {
          // Tab: forward cycle
          if (currentIndex === -1 || currentIndex >= focusable.length - 1) {
            nextIndex = 0;
          } else {
            nextIndex = currentIndex + 1;
          }
        }

        const target = focusable[nextIndex];
        if (target && typeof target.focus === "function") {
          target.focus();
        }
      }
    }

    // 4. Focus containment for external clicks / focus shifts
    function handleFocusIn(e) {
      if (dialogNode && !dialogNode.contains(e.target)) {
        const focusable = getFocusableElements();
        if (focusable.length > 0) {
          focusable[0].focus();
        } else if (dialogNode) {
          dialogNode.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("focusin", handleFocusIn);

    // 5. Cleanup on close or unmount: restore focus to trigger element
    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("focusin", handleFocusIn);

      const trigger = triggerElementRef.current;
      if (
        trigger &&
        trigger !== document.body &&
        typeof trigger.focus === "function"
      ) {
        setTimeout(() => {
          if (document.body.contains(trigger)) {
            trigger.focus();
          }
        }, 0);
      }
    };
  }, [isOpen]);

  return dialogRef;
}

export default useDialogFocus;
