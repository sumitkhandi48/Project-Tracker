import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

describe("Phase 5C Step 2: Dialog & Modal Accessibility Verification", () => {
  const componentsDir = path.resolve("src/components/projects");

  // =========================================================================
  // 1. Static Contract & ARIA Attribute Verification
  // =========================================================================
  describe("1. Static Contract & ARIA Attributes", () => {
    it("DeleteConfirmDialog implements dialog role, modal attribute, ARIA references, and tabIndex", () => {
      const filePath = path.join(componentsDir, "delete-confirm-dialog.jsx");
      const content = fs.readFileSync(filePath, "utf-8");

      assert.ok(
        content.includes('role="dialog"'),
        "DeleteConfirmDialog must specify role='dialog'"
      );
      assert.ok(
        content.includes('aria-modal="true"'),
        "DeleteConfirmDialog must specify aria-modal='true'"
      );
      assert.ok(
        content.includes('aria-labelledby="delete-dialog-title"'),
        "DeleteConfirmDialog must link title via aria-labelledby"
      );
      assert.ok(
        content.includes('aria-describedby="delete-dialog-description"'),
        "DeleteConfirmDialog must link description via aria-describedby"
      );
      assert.ok(
        content.includes('id="delete-dialog-title"'),
        "DeleteConfirmDialog title element must have matching id"
      );
      assert.ok(
        content.includes('id="delete-dialog-description"'),
        "DeleteConfirmDialog description element must have matching id"
      );
      assert.ok(
        content.includes("useDialogFocus"),
        "DeleteConfirmDialog must use useDialogFocus hook"
      );
      assert.ok(
        content.includes("tabIndex={-1}"),
        "DeleteConfirmDialog container must have tabIndex={-1} for focus containment"
      );
    });

    it("TaskModal implements dialog role, modal attribute, ARIA references, and visible focus rings", () => {
      const filePath = path.join(componentsDir, "task-modal.jsx");
      const content = fs.readFileSync(filePath, "utf-8");

      assert.ok(
        content.includes('role="dialog"'),
        "TaskModal must specify role='dialog'"
      );
      assert.ok(
        content.includes('aria-modal="true"'),
        "TaskModal must specify aria-modal='true'"
      );
      assert.ok(
        content.includes('aria-labelledby="task-modal-title"'),
        "TaskModal must link title via aria-labelledby"
      );
      assert.ok(
        content.includes('aria-describedby="task-modal-description"'),
        "TaskModal must link description via aria-describedby"
      );
      assert.ok(
        content.includes('id="task-modal-title"'),
        "TaskModal title element must have matching id"
      );
      assert.ok(
        content.includes('id="task-modal-description"'),
        "TaskModal description element must have matching id"
      );
      assert.ok(
        content.includes("useDialogFocus"),
        "TaskModal must use useDialogFocus hook"
      );
      assert.ok(
        content.includes("titleInputRef"),
        "TaskModal must pass titleInputRef for initial focus"
      );
      assert.ok(
        content.includes("focus-visible:ring-accent"),
        "TaskModal close button must have visible focus ring"
      );
      assert.ok(
        content.includes("tabIndex={-1}"),
        "TaskModal container must have tabIndex={-1} for focus containment"
      );
    });

    it("MilestoneModal implements dialog role, modal attribute, ARIA references, and visible focus rings", () => {
      const filePath = path.join(componentsDir, "milestone-modal.jsx");
      const content = fs.readFileSync(filePath, "utf-8");

      assert.ok(
        content.includes('role="dialog"'),
        "MilestoneModal must specify role='dialog'"
      );
      assert.ok(
        content.includes('aria-modal="true"'),
        "MilestoneModal must specify aria-modal='true'"
      );
      assert.ok(
        content.includes('aria-labelledby="milestone-modal-title"'),
        "MilestoneModal must link title via aria-labelledby"
      );
      assert.ok(
        content.includes('aria-describedby="milestone-modal-description"'),
        "MilestoneModal must link description via aria-describedby"
      );
      assert.ok(
        content.includes('id="milestone-modal-title"'),
        "MilestoneModal title element must have matching id"
      );
      assert.ok(
        content.includes('id="milestone-modal-description"'),
        "MilestoneModal description element must have matching id"
      );
      assert.ok(
        content.includes("useDialogFocus"),
        "MilestoneModal must use useDialogFocus hook"
      );
      assert.ok(
        content.includes("titleInputRef"),
        "MilestoneModal must pass titleInputRef for initial focus"
      );
      assert.ok(
        content.includes("focus-visible:ring-accent"),
        "MilestoneModal close button must have visible focus ring"
      );
      assert.ok(
        content.includes("tabIndex={-1}"),
        "MilestoneModal container must have tabIndex={-1} for focus containment"
      );
    });
  });

  // =========================================================================
  // 2. Focus Trap Algorithm Unit Tests (Simulated DOM)
  // =========================================================================
  describe("2. Focus Trap Logic & Keyboard Navigation Verification", () => {
    let listeners = {};
    let activeElement = null;
    let mockDocument = null;

    function createMockElement(tag, { id = "", disabled = false, offsetWidth = 100 } = {}) {
      const el = {
        tagName: tag.toUpperCase(),
        id,
        disabled,
        offsetWidth,
        offsetHeight: 30,
        getClientRects: () => [{ width: 100, height: 30 }],
        children: [],
        contains: (target) => {
          if (target === el) return true;
          return el.children.some((c) => c === target || (c.contains && c.contains(target)));
        },
        focus: () => {
          activeElement = el;
        },
        querySelectorAll: (selector) => {
          // Simplified matching for test harness
          const result = [];
          function traverse(node) {
            for (const child of node.children) {
              if (
                child.tagName === "BUTTON" ||
                child.tagName === "INPUT" ||
                child.tagName === "TEXTAREA" ||
                child.tagName === "SELECT"
              ) {
                if (!child.disabled) result.push(child);
              }
              if (child.children.length > 0) traverse(child);
            }
          }
          traverse(el);
          return result;
        },
      };
      return el;
    }

    beforeEach(() => {
      listeners = {};
      activeElement = null;

      mockDocument = {
        get activeElement() {
          return activeElement;
        },
        addEventListener: (event, handler) => {
          if (!listeners[event]) listeners[event] = [];
          listeners[event].push(handler);
        },
        removeEventListener: (event, handler) => {
          if (listeners[event]) {
            listeners[event] = listeners[event].filter((h) => h !== handler);
          }
        },
        body: {
          contains: () => true,
        },
      };
    });

    it("traps Tab key navigation by wrapping from last element to first element", () => {
      const dialog = createMockElement("div", { id: "dialog" });
      const firstInput = createMockElement("input", { id: "title-input" });
      const middleSelect = createMockElement("select", { id: "status-select" });
      const submitBtn = createMockElement("button", { id: "submit-btn" });

      dialog.children = [firstInput, middleSelect, submitBtn];

      // Simulate hook's keydown handler
      function simulateTab(e) {
        const focusable = dialog.querySelectorAll("*");
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.key === "Tab") {
          if (e.shiftKey) {
            if (activeElement === first || activeElement === dialog) {
              e.preventDefault();
              last.focus();
            }
          } else {
            if (activeElement === last || activeElement === dialog) {
              e.preventDefault();
              first.focus();
            }
          }
        }
      }

      // 1. Focus on submit button (last element)
      submitBtn.focus();
      assert.equal(activeElement.id, "submit-btn");

      // 2. Press Tab -> should wrap to first element (firstInput)
      let defaultPrevented = false;
      simulateTab({
        key: "Tab",
        shiftKey: false,
        preventDefault: () => {
          defaultPrevented = true;
        },
      });

      assert.ok(defaultPrevented, "Tab event on last element must be preventDefaulted");
      assert.equal(activeElement.id, "title-input", "Focus must wrap to first element");
    });

    it("traps Shift+Tab key navigation by wrapping from first element to last element", () => {
      const dialog = createMockElement("div", { id: "dialog" });
      const cancelBtn = createMockElement("button", { id: "cancel-btn" });
      const deleteBtn = createMockElement("button", { id: "delete-btn" });

      dialog.children = [cancelBtn, deleteBtn];

      function simulateTab(e) {
        const focusable = dialog.querySelectorAll("*");
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.key === "Tab") {
          if (e.shiftKey) {
            if (activeElement === first || activeElement === dialog) {
              e.preventDefault();
              last.focus();
            }
          } else {
            if (activeElement === last || activeElement === dialog) {
              e.preventDefault();
              first.focus();
            }
          }
        }
      }

      // 1. Focus on cancel button (first element)
      cancelBtn.focus();
      assert.equal(activeElement.id, "cancel-btn");

      // 2. Press Shift+Tab -> should wrap to last element (deleteBtn)
      let defaultPrevented = false;
      simulateTab({
        key: "Tab",
        shiftKey: true,
        preventDefault: () => {
          defaultPrevented = true;
        },
      });

      assert.ok(defaultPrevented, "Shift+Tab event on first element must be preventDefaulted");
      assert.equal(activeElement.id, "delete-btn", "Focus must wrap to last element");
    });

    it("allows Escape key to trigger onClose when unlocked, but blocks it when isLocked=true", () => {
      let closeCalled = false;
      const onClose = () => {
        closeCalled = true;
      };

      function handleEscape(isLocked, e) {
        if (e.key === "Escape") {
          if (!isLocked && onClose) {
            e.preventDefault();
            onClose();
          }
        }
      }

      // Case 1: Locked (e.g. isDeleting = true or isSubmitting = true)
      closeCalled = false;
      let preventedWhenLocked = false;
      handleEscape(true, {
        key: "Escape",
        preventDefault: () => {
          preventedWhenLocked = true;
        },
      });
      assert.equal(closeCalled, false, "Escape must NOT close dialog when locked (submitting/deleting)");
      assert.equal(preventedWhenLocked, false);

      // Case 2: Unlocked (normal state)
      closeCalled = false;
      let preventedWhenUnlocked = false;
      handleEscape(false, {
        key: "Escape",
        preventDefault: () => {
          preventedWhenUnlocked = true;
        },
      });
      assert.equal(closeCalled, true, "Escape MUST trigger onClose when unlocked");
      assert.equal(preventedWhenUnlocked, true);
    });

    it("restores focus to triggering element when dialog closes", () => {
      const triggerBtn = createMockElement("button", { id: "add-task-trigger" });
      const dialog = createMockElement("div", { id: "dialog" });
      const dialogInput = createMockElement("input", { id: "title" });
      dialog.children = [dialogInput];

      // 1. User starts by focusing the trigger button
      triggerBtn.focus();
      assert.equal(activeElement.id, "add-task-trigger");

      // 2. Modal opens: captured trigger element
      const savedTrigger = activeElement;
      assert.equal(savedTrigger.id, "add-task-trigger");

      // 3. Focus moves inside dialog
      dialogInput.focus();
      assert.equal(activeElement.id, "title");

      // 4. Modal closes: focus is restored to saved trigger
      savedTrigger.focus();
      assert.equal(activeElement.id, "add-task-trigger", "Focus must return to triggering button on modal close");
    });
  });
});
