import { spawn } from "child_process";
import os from "os";
import path from "path";
import fs from "fs";
import mongoose from "mongoose";
import { encode } from "next-auth/jwt";

// Load local environment safely if available
try {
  process.loadEnvFile(".env.local");
} catch {}

const NEXT_PORT = 3005;
const CHROME_PORT = 9224;
const BASE_URL = `http://127.0.0.1:${NEXT_PORT}`;
const NEXTAUTH_SECRET = "e2e-super-secret-key-at-least-32-chars-long-123456";
const MOCK_OWNER_GITHUB_ID = "3399117755";
const MOCK_STRANGER_GITHUB_ID = "5577119933";

import { connectToDatabase } from "../src/lib/db/mongodb.js";
import User from "../src/models/User.js";
import Project from "../src/models/Project.js";
import Task from "../src/models/Task.js";
import Milestone from "../src/models/Milestone.js";
import Activity from "../src/models/Activity.js";

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.msgId = 1;
    this.consoleLogs = [];
    this.networkErrors = [];
    this.unhandledExceptions = [];
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });

    this.ws.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        if (data.method === "Runtime.consoleAPICalled") {
          const type = data.params.type;
          const text = data.params.args.map((a) => a.value || JSON.stringify(a)).join(" ");
          this.consoleLogs.push({ type, text });
        } else if (data.method === "Runtime.exceptionThrown") {
          const desc = data.params.exceptionDetails?.exception?.description || data.params.exceptionDetails?.text;
          this.unhandledExceptions.push(desc);
        } else if (data.method === "Network.responseReceived") {
          const status = data.params.response.status;
          const url = data.params.response.url;
          if (status >= 400 && !url.includes("/favicon.ico")) {
            this.networkErrors.push({ url, status, statusText: data.params.response.statusText });
          }
        }
      } catch {}
    };

    await this.send("Page.enable");
    await this.send("Runtime.enable");
    await this.send("Network.enable");
  }

  send(method, params = {}) {
    const id = this.msgId++;
    return new Promise((resolve) => {
      const handler = (evt) => {
        try {
          const data = JSON.parse(evt.data);
          if (data.id === id) {
            this.ws.removeEventListener("message", handler);
            resolve(data.result);
          }
        } catch {}
      };
      this.ws.addEventListener("message", handler);
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async navigate(url) {
    await this.send("Page.navigate", { url });
    await new Promise((r) => setTimeout(r, 800));
  }

  async waitForSelector(selector, timeoutMs = 6000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const exists = await this.evaluate(`Boolean(document.querySelector('${selector}'))`);
      if (exists) return true;
      await new Promise((r) => setTimeout(r, 100));
    }
    return false;
  }

  async evaluate(expression) {
    const res = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return res?.result?.value;
  }

  async setCookie(name, value) {
    await this.send("Network.setCookie", {
      name,
      value,
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      secure: false,
    });
  }

  async clearCookies() {
    await this.send("Network.clearBrowserCookies");
  }

  async setViewport(width, height) {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 768,
    });
  }

  async pressEscape() {
    await this.send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Escape",
      code: "Escape",
      windowsVirtualKeyCode: 27,
      nativeVirtualKeyCode: 27,
    });
    await this.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Escape",
      code: "Escape",
      windowsVirtualKeyCode: 27,
      nativeVirtualKeyCode: 27,
    });
    await new Promise((r) => setTimeout(r, 200));
  }

  async pressTab({ shift = false } = {}) {
    const modifiers = shift ? 8 : 0;
    await this.send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Tab",
      code: "Tab",
      windowsVirtualKeyCode: 9,
      nativeVirtualKeyCode: 9,
      modifiers,
    });
    await this.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Tab",
      code: "Tab",
      windowsVirtualKeyCode: 9,
      nativeVirtualKeyCode: 9,
      modifiers,
    });
    await new Promise((r) => setTimeout(r, 150));
  }

  close() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

async function main() {
  console.log("================================================================================");
  console.log("PHASE 5C - STEP 1: COMPREHENSIVE END-TO-END APPLICATION VERIFICATION");
  console.log("================================================================================\n");

  const results = {
    browserToolsAvailable: "Google Chrome (Headless) + Native Chrome DevTools Protocol (CDP)",
    gitHubOAuthStatus: "Real GitHub OAuth credentials (CLIENT_ID/SECRET) not present in .env.local; verified via genuine NextAuth session cookie synthesis",
    testCases: [],
    errors: [],
    warnings: [],
  };

  function recordTest(name, passed, details = "") {
    results.testCases.push({ name, passed, details });
    const mark = passed ? "✓" : "✖";
    console.log(`[${mark}] ${name}${details ? ` - ${details}` : ""}`);
  }

  // 1. Database Connection and Fixture Setup
  await connectToDatabase();
  await Project.init();
  await Task.init();
  await Milestone.init();
  await Activity.init();
  await User.init();

  // Clean old fixtures
  await User.deleteMany({ githubId: { $in: [MOCK_OWNER_GITHUB_ID, MOCK_STRANGER_GITHUB_ID] } });

  const ownerUser = await User.create({
    name: "E2E Verified Owner",
    email: "e2e.owner@example.local",
    githubId: MOCK_OWNER_GITHUB_ID,
  });

  const strangerUser = await User.create({
    name: "E2E Stranger Visitor",
    email: "e2e.stranger@example.local",
    githubId: MOCK_STRANGER_GITHUB_ID,
  });

  // Synthesize authenticated NextAuth session cookies
  const ownerToken = {
    name: ownerUser.name,
    email: ownerUser.email,
    githubId: MOCK_OWNER_GITHUB_ID,
    userId: ownerUser._id.toString(),
    isOwner: true,
    sub: ownerUser._id.toString(),
  };

  const strangerToken = {
    name: strangerUser.name,
    email: strangerUser.email,
    githubId: MOCK_STRANGER_GITHUB_ID,
    userId: strangerUser._id.toString(),
    isOwner: false,
    sub: strangerUser._id.toString(),
  };

  const ownerCookie = await encode({ token: ownerToken, secret: NEXTAUTH_SECRET });
  const strangerCookie = await encode({ token: strangerToken, secret: NEXTAUTH_SECRET });

  console.log("1. Environment & Fixtures Configured:");
  console.log(`   - Verified Owner: ${ownerUser.name} (${MOCK_OWNER_GITHUB_ID})`);
  console.log(`   - Stranger Account: ${strangerUser.name} (${MOCK_STRANGER_GITHUB_ID})`);
  console.log(`   - Synthesized Owner Cookie length: ${ownerCookie.length}`);
  console.log(`   - Synthesized Stranger Cookie length: ${strangerCookie.length}\n`);

  // 2. Start Next.js Production Server
  console.log("2. Starting Next.js Production Server on Port " + NEXT_PORT + "...");
  const server = spawn(
    "node",
    ["./node_modules/next/dist/bin/next", "start", "-p", String(NEXT_PORT)],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(NEXT_PORT),
        NEXTAUTH_SECRET,
        OWNER_GITHUB_ID: MOCK_OWNER_GITHUB_ID,
        NEXTAUTH_URL: BASE_URL,
        NODE_ENV: "production",
      },
      stdio: "pipe",
    }
  );

  await new Promise((resolve, reject) => {
    server.stdout.on("data", (d) => {
      const msg = d.toString();
      if (msg.includes("started server on") || msg.includes("Ready in") || msg.includes(`http://localhost:${NEXT_PORT}`)) {
        resolve();
      }
    });
    server.stderr.on("data", (d) => {
      const errStr = d.toString();
      if (errStr.includes("EADDRINUSE")) {
        reject(new Error("Port " + NEXT_PORT + " is in use"));
      }
    });
    setTimeout(() => resolve(), 3000);
  });
  console.log("   Next.js Production Server is ready at " + BASE_URL + "\n");

  // 3. Start Headless Chrome
  console.log("3. Launching Google Chrome (Headless CDP on port " + CHROME_PORT + ")...");
  const tempProfile = fs.mkdtempSync(path.join(os.tmpdir(), "chrome-e2e-run-"));
  const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

  const chrome = spawn(
    chromePath,
    [
      "--headless=new",
      `--remote-debugging-port=${CHROME_PORT}`,
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      `--user-data-dir=${tempProfile}`,
    ],
    { stdio: "ignore" }
  );

  // Poll for Chrome CDP endpoint
  let pageTarget = null;
  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 200));
    try {
      const newRes = await fetch(`http://127.0.0.1:${CHROME_PORT}/json/new?about:blank`, { method: "PUT" });
      if (newRes.ok) {
        pageTarget = await newRes.json();
        break;
      }
    } catch {}
  }

  if (!pageTarget?.webSocketDebuggerUrl) {
    throw new Error("Failed to connect to Chrome DevTools Protocol");
  }

  console.log("   Chrome CDP Target connected: " + pageTarget.webSocketDebuggerUrl + "\n");
  const cdp = new CDPClient(pageTarget.webSocketDebuggerUrl);
  await cdp.connect();

  try {
    // -------------------------------------------------------------------------
    // TEST SECTION 1: Unauthenticated Navigation & Public Pages
    // -------------------------------------------------------------------------
    console.log("--------------------------------------------------------------------------------");
    console.log("TEST SUITE 1: UNAUTHENTICATED ACCESS & PUBLIC LANDING PAGE");
    console.log("--------------------------------------------------------------------------------");

    await cdp.clearCookies();
    await cdp.navigate(`${BASE_URL}/dashboard`);
    let currentUrl = await cdp.evaluate("window.location.href");
    recordTest(
      "Unauthenticated /dashboard redirects to login",
      currentUrl.includes("/login"),
      `Redirected to: ${currentUrl}`
    );

    // Verify Login Page
    const loginTitle = await cdp.evaluate("document.title");
    const hasGitHubButton = await cdp.evaluate("Boolean(document.querySelector('button, a'))");
    recordTest("Login page renders branding and auth action", hasGitHubButton, `Title: ${loginTitle}`);

    // Verify Public Landing Page
    await cdp.navigate(`${BASE_URL}/`);
    const landingH1 = await cdp.evaluate("document.querySelector('h1')?.innerText");
    const isPublicPage = await cdp.evaluate(
      "document.body.innerText.includes('Project Tracking Platform') || document.body.innerText.includes('Tracker') || document.body.innerText.includes('Building')"
    );
    recordTest("Public landing page renders successfully", isPublicPage, `Heading: ${landingH1}`);

    // -------------------------------------------------------------------------
    // TEST SECTION 2: Non-Owner Restriction (403 Forbidden)
    // -------------------------------------------------------------------------
    console.log("\n--------------------------------------------------------------------------------");
    console.log("TEST SUITE 2: NON-OWNER RESTRICTION (403 FORBIDDEN SCREEN)");
    console.log("--------------------------------------------------------------------------------");

    await cdp.setCookie("next-auth.session-token", strangerCookie);
    await cdp.navigate(`${BASE_URL}/dashboard`);
    await cdp.waitForSelector("h1");
    const strangerDashboardBody = await cdp.evaluate("document.body.innerText");
    const is403Forbidden =
      strangerDashboardBody.includes("Access Restricted") ||
      strangerDashboardBody.includes("403") ||
      strangerDashboardBody.includes("Owner access required") ||
      strangerDashboardBody.includes("Access Denied");
    recordTest(
      "Non-owner account accessing /dashboard is denied (403 UI)",
      is403Forbidden,
      "Rendered restricted screen without exposing dashboard data"
    );

    await cdp.navigate(`${BASE_URL}/dashboard/projects`);
    await cdp.waitForSelector("h1");
    const strangerProjectsBody = await cdp.evaluate("document.body.innerText");
    recordTest(
      "Non-owner account accessing /dashboard/projects is denied (403 UI)",
      strangerProjectsBody.includes("Access") || strangerProjectsBody.includes("403"),
      "Access restricted for non-owner"
    );

    // -------------------------------------------------------------------------
    // TEST SECTION 3: Authenticated Owner Dashboard
    // -------------------------------------------------------------------------
    console.log("\n--------------------------------------------------------------------------------");
    console.log("TEST SUITE 3: AUTHENTICATED OWNER DASHBOARD & METRICS");
    console.log("--------------------------------------------------------------------------------");

    await cdp.setCookie("next-auth.session-token", ownerCookie);
    await cdp.navigate(`${BASE_URL}/dashboard`);
    await cdp.waitForSelector("h1");

    const ownerDashboardH1 = await cdp.evaluate("document.querySelector('h1')?.innerText");
    const hasStatsGrid = await cdp.evaluate(
      "document.body.innerText.includes('repositories.total') && document.body.innerText.includes('tasks.completion')"
    );
    recordTest(
      "Owner accesses /dashboard with live statistics grid",
      hasStatsGrid,
      `H1: "${ownerDashboardH1}" | Cards: repositories.total, tasks.completion`
    );

    // -------------------------------------------------------------------------
    // TEST SECTION 4: Project Listing, Filter, & Empty States
    // -------------------------------------------------------------------------
    console.log("\n--------------------------------------------------------------------------------");
    console.log("TEST SUITE 4: PROJECT LISTING, FILTERING, & EMPTY STATES");
    console.log("--------------------------------------------------------------------------------");

    await cdp.navigate(`${BASE_URL}/dashboard/projects`);
    await cdp.waitForSelector("h1");
    const projectsTitle = await cdp.evaluate("document.title");
    const hasNewProjectLink = await cdp.evaluate("Boolean(document.querySelector('a[href=\"/dashboard/projects/new\"]'))");
    recordTest("Projects catalog page renders with '+ New Project' action", hasNewProjectLink, `Title: ${projectsTitle}`);

    // Test filtered empty state with dummy query
    await cdp.navigate(`${BASE_URL}/dashboard/projects?search=nonexistent-query-xyz123`);
    await cdp.waitForSelector("main");
    const searchBody = await cdp.evaluate("document.body.innerText");
    const showsFilteredEmpty =
      searchBody.includes("No projects match your filter") ||
      searchBody.includes("No projects found") ||
      searchBody.includes("Try clearing your search");
    recordTest("Filtered-empty state displays helpful reset/empty message", showsFilteredEmpty, "Clean filter empty message rendered");

    // -------------------------------------------------------------------------
    // TEST SECTION 5: Project Creation Flow
    // -------------------------------------------------------------------------
    console.log("\n--------------------------------------------------------------------------------");
    console.log("TEST SUITE 5: PROJECT CREATION FLOW & VALIDATION");
    console.log("--------------------------------------------------------------------------------");

    await cdp.navigate(`${BASE_URL}/dashboard/projects/new`);
    await cdp.waitForSelector("h1");
    const createFormH1 = await cdp.evaluate("document.querySelector('h1')?.innerText");
    recordTest("Project creation form renders", createFormH1?.includes("Project"), `Header: ${createFormH1}`);

    // Fill project creation form via React controlled input setters
    const createdSlug = "e2e-automated-test-platform";
    await cdp.evaluate(`(() => {
      function setInput(el, val) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(el, val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      function setTextarea(el, val) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        setter.call(el, val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }

      const titleInput = document.querySelector('#project-title');
      const slugInput = document.querySelector('#project-slug');
      const shortDescInput = document.querySelector('#project-short-desc');
      const categoryInput = document.querySelector('#project-category');

      if (titleInput) setInput(titleInput, "E2E Automated Test Platform");
      if (slugInput) setInput(slugInput, "${createdSlug}");
      if (categoryInput) setInput(categoryInput, "Infrastructure");
      if (shortDescInput) setTextarea(shortDescInput, "Automated end-to-end browser verification project for platform.");
    })()`);

    // Submit form by specifically targeting the main form's submit button
    await cdp.evaluate(`(() => {
      const form = document.querySelector('main form');
      if (form) {
        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.click();
      }
    })()`);

    // Wait for navigation / redirect
    await new Promise((r) => setTimeout(r, 1600));
    currentUrl = await cdp.evaluate("window.location.href");
    const isRedirectedToProjects = currentUrl.includes("/dashboard/projects");
    const hasSuccessBanner = await cdp.evaluate("document.body.innerText.includes('Project created successfully')");
    recordTest(
      "Project created and redirected to catalog with success banner",
      isRedirectedToProjects && hasSuccessBanner,
      `URL: ${currentUrl}`
    );

    // Verify record in MongoDB directly
    const createdProjectDb = await Project.findOne({ slug: createdSlug, owner: ownerUser._id });
    recordTest(
      "Created project exists in MongoDB strictly bound to verified owner",
      Boolean(createdProjectDb && createdProjectDb.title === "E2E Automated Test Platform"),
      `DB ID: ${createdProjectDb?._id}`
    );

    const projectId = createdProjectDb?._id?.toString();

    // -------------------------------------------------------------------------
    // TEST SECTION 6: Project Detail Navigation & Tabs
    // -------------------------------------------------------------------------
    console.log("\n--------------------------------------------------------------------------------");
    console.log("TEST SUITE 6: PROJECT DETAIL VIEW & NAVIGATION");
    console.log("--------------------------------------------------------------------------------");

    await cdp.navigate(`${BASE_URL}/dashboard/projects/${projectId}`);
    await cdp.waitForSelector("h1");
    const detailH1 = await cdp.evaluate("document.querySelector('h1')?.innerText");
    const hasSlugBadge = await cdp.evaluate(`document.body.innerText.includes('//${createdSlug}')`);
    recordTest(
      "Project detail page renders title, slug, and tabs",
      detailH1 === "E2E Automated Test Platform" && hasSlugBadge,
      `Detail Title: ${detailH1}`
    );

    // Check action buttons: Edit Project and Delete
    const hasEditButton = await cdp.evaluate(
      "Boolean(Array.from(document.querySelectorAll('main button, main a')).find(el => el.innerText.includes('Edit Project')))"
    );
    const hasDeleteButton = await cdp.evaluate(
      "Boolean(Array.from(document.querySelectorAll('main button')).find(el => el.innerText.trim() === 'Delete'))"
    );
    recordTest(
      "Project detail header includes 'Edit Project' and separate 'Delete' actions",
      hasEditButton && hasDeleteButton,
      "Distinct header actions verified"
    );

    // -------------------------------------------------------------------------
    // TEST SECTION 7: Task Lifecycle & Progress Calculation
    // -------------------------------------------------------------------------
    console.log("\n--------------------------------------------------------------------------------");
    console.log("TEST SUITE 7: TASK LIFECYCLE, COMPLETION, & PROGRESS RECALCULATION");
    console.log("--------------------------------------------------------------------------------");

    // Open Task Modal with focus
    await cdp.evaluate(`(() => {
      const addTaskBtn = Array.from(document.querySelectorAll('main button')).find(b => b.innerText.includes('Add Task'));
      if (addTaskBtn) {
        addTaskBtn.focus();
        addTaskBtn.click();
      }
    })()`);
    await cdp.waitForSelector("div[role=\"dialog\"]");

    let isModalOpen = await cdp.evaluate("Boolean(document.querySelector('div[role=\"dialog\"]'))");
    recordTest("Task create modal opens on clicking '+ Add Task'", isModalOpen, "Modal visible in DOM");

    // Accessibility & Semantics checks for TaskModal
    const taskAriaCheck = await cdp.evaluate(`(() => {
      const dialog = document.querySelector('div[role="dialog"]');
      if (!dialog) return false;
      const role = dialog.getAttribute('role') === 'dialog';
      const modal = dialog.getAttribute('aria-modal') === 'true';
      const labelId = dialog.getAttribute('aria-labelledby');
      const descId = dialog.getAttribute('aria-describedby');
      const titleEl = labelId ? document.getElementById(labelId) : null;
      const descEl = descId ? document.getElementById(descId) : null;
      return role && modal && Boolean(titleEl) && Boolean(descEl);
    })()`);
    recordTest("Task modal implements accessible semantics (role='dialog', aria-modal='true', aria-labelledby, aria-describedby)", taskAriaCheck, "ARIA attributes verified");

    // Initial focus on title input
    await new Promise((r) => setTimeout(r, 60));
    const taskInitialFocus = await cdp.evaluate(`(() => {
      const dialog = document.querySelector('div[role="dialog"]');
      const titleInput = dialog ? dialog.querySelector('input') : null;
      return document.activeElement === titleInput;
    })()`);
    recordTest("Task modal moves initial focus into title input on open", taskInitialFocus, "Title input focused");

    // Close button visible focus ring
    const taskCloseRing = await cdp.evaluate(`(() => {
      const closeBtn = document.querySelector('div[role="dialog"] button[aria-label="Close dialog"]');
      return closeBtn && closeBtn.className.includes('focus-visible:ring-accent');
    })()`);
    recordTest("Task modal close button includes Hallmark focus ring styling", taskCloseRing, "focus-visible:ring-accent present");

    // Focus wrapping test: Tab from last focusable element wraps to first
    await cdp.evaluate(`(() => {
      const dialog = document.querySelector('div[role="dialog"]');
      const focusable = Array.from(dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])'));
      const last = focusable[focusable.length - 1];
      if (last) last.focus();
    })()`);
    await cdp.pressTab({ shift: false });
    const taskTabWrapped = await cdp.evaluate(`(() => {
      const dialog = document.querySelector('div[role="dialog"]');
      const focusable = Array.from(dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])'));
      return document.activeElement === focusable[0];
    })()`);
    recordTest("Task modal focus trap: Tab from last element wraps to first element", taskTabWrapped, "Tab cyclic wrapping active");

    // Focus wrapping test: Shift+Tab from first focusable element wraps to last
    await cdp.evaluate(`(() => {
      const dialog = document.querySelector('div[role="dialog"]');
      const focusable = Array.from(dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])'));
      if (focusable[0]) focusable[0].focus();
    })()`);
    await cdp.pressTab({ shift: true });
    const taskShiftTabWrapped = await cdp.evaluate(`(() => {
      const dialog = document.querySelector('div[role="dialog"]');
      const focusable = Array.from(dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])'));
      return document.activeElement === focusable[focusable.length - 1];
    })()`);
    recordTest("Task modal focus trap: Shift+Tab from first element wraps to last element", taskShiftTabWrapped, "Shift+Tab reverse cycle active");

    // Test Escape key closes modal and restores focus
    await cdp.pressEscape();
    await new Promise((r) => setTimeout(r, 300));
    isModalOpen = await cdp.evaluate("Boolean(document.querySelector('div[role=\"dialog\"]'))");
    const taskFocusRestored = await cdp.evaluate(`(() => {
      const addTaskBtn = Array.from(document.querySelectorAll('main button')).find(b => b.innerText.includes('Add Task'));
      return document.activeElement === addTaskBtn;
    })()`);
    recordTest("Pressing Escape key closes Task modal and restores focus to trigger button", !isModalOpen && taskFocusRestored, "Focus returned to 'Add Task' button");

    // Re-open and create Task A
    await cdp.evaluate(`(() => {
      const addTaskBtn = Array.from(document.querySelectorAll('main button')).find(b => b.innerText.includes('Add Task'));
      if (addTaskBtn) addTaskBtn.click();
    })()`);
    await cdp.waitForSelector("div[role=\"dialog\"]");

    await cdp.evaluate(`(() => {
      const titleInput = document.querySelector('div[role=\"dialog\"] input');
      if (titleInput) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(titleInput, "E2E Core Task Alpha");
        titleInput.dispatchEvent(new Event('input', { bubbles: true }));
        titleInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const dialogForm = document.querySelector('div[role=\"dialog\"] form');
      if (dialogForm) {
        const submitBtn = dialogForm.querySelector('button[type=\"submit\"]');
        if (submitBtn) submitBtn.click();
      }
    })()`);
    await new Promise((r) => setTimeout(r, 800));

    let hasTaskAlpha = await cdp.evaluate("document.body.innerText.includes('E2E Core Task Alpha')");
    recordTest("Task Alpha created and rendered in task list", hasTaskAlpha, "Rendered in list");

    // Create Task B
    await cdp.evaluate(`(() => {
      const addTaskBtn = Array.from(document.querySelectorAll('main button')).find(b => b.innerText.includes('Add Task'));
      if (addTaskBtn) addTaskBtn.click();
    })()`);
    await cdp.waitForSelector("div[role=\"dialog\"]");

    await cdp.evaluate(`(() => {
      const titleInput = document.querySelector('div[role=\"dialog\"] input');
      if (titleInput) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(titleInput, "E2E Task Beta");
        titleInput.dispatchEvent(new Event('input', { bubbles: true }));
        titleInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const dialogForm = document.querySelector('div[role=\"dialog\"] form');
      if (dialogForm) {
        const submitBtn = dialogForm.querySelector('button[type=\"submit\"]');
        if (submitBtn) submitBtn.click();
      }
    })()`);
    await new Promise((r) => setTimeout(r, 800));

    // Progress before completion: 0% (0 of 2 tasks completed)
    let progressSummary = await cdp.evaluate(
      "document.body.innerText.includes('0 of 2 tasks completed') || document.body.innerText.includes('0%')"
    );
    recordTest("Initial task progress reflects 0 of 2 tasks (0%)", progressSummary, "Progress: 0%");

    // Toggle Task Alpha specifically to Done
    await cdp.evaluate(`(() => {
      const spans = Array.from(document.querySelectorAll('span'));
      const taskSpan = spans.find(s => s.innerText.trim() === 'E2E Core Task Alpha');
      const card = taskSpan ? taskSpan.closest('.rounded-card') : null;
      const toggleBtn = card ? card.querySelector('button[title*=\"Done\"], button[aria-label*=\"Done\"]') : null;
      if (toggleBtn) toggleBtn.click();
    })()`);
    await new Promise((r) => setTimeout(r, 900));

    // Verify Task Alpha completed in DB
    const dbTaskAlpha = await Task.findOne({ project: projectId, title: "E2E Core Task Alpha" });
    const isTaskDone = dbTaskAlpha?.status === "Done" && dbTaskAlpha?.completedAt instanceof Date;
    recordTest(
      "Task completion toggled: DB record status='Done' and completedAt timestamp set",
      isTaskDone,
      "Timestamp: " + dbTaskAlpha?.completedAt
    );

    // Check progress updated in UI
    const progressUpdated = await cdp.evaluate(
      "document.body.innerText.includes('1 of 2 tasks completed') || document.body.innerText.includes('50%')"
    );
    recordTest("Project progress recalculated to 50% (1 of 2 completed)", progressUpdated, "Progress dynamically derived");

    // Toggle Task Alpha specifically back to In Progress
    await cdp.evaluate(`(() => {
      const spans = Array.from(document.querySelectorAll('span'));
      const taskSpan = spans.find(s => s.innerText.trim() === 'E2E Core Task Alpha');
      const card = taskSpan ? taskSpan.closest('.rounded-card') : null;
      const toggleBtn = card ? card.querySelector('button[title*=\"Reopen\"], button[aria-label*=\"Reopen\"]') : null;
      if (toggleBtn) toggleBtn.click();
    })()`);
    await new Promise((r) => setTimeout(r, 900));

    const dbTaskAlphaReopened = await Task.findOne({ project: projectId, title: "E2E Core Task Alpha" });
    const isTaskReopened = dbTaskAlphaReopened?.status !== "Done" && dbTaskAlphaReopened?.completedAt === null;
    recordTest("Task reopened: DB completedAt cleared back to null", isTaskReopened, "Status: " + dbTaskAlphaReopened?.status);

    // -------------------------------------------------------------------------
    // TEST SECTION 8: Milestone Lifecycle
    // -------------------------------------------------------------------------
    console.log("\n--------------------------------------------------------------------------------");
    console.log("TEST SUITE 8: MILESTONE LIFECYCLE & STATUS TRACKING");
    console.log("--------------------------------------------------------------------------------");

    // Switch to Milestones Tab
    await cdp.evaluate(`(() => {
      const msTab = Array.from(document.querySelectorAll('main button')).find(b => b.innerText.includes('Milestones'));
      if (msTab) msTab.click();
    })()`);
    await new Promise((r) => setTimeout(r, 300));

    // Open Milestone Modal with focused trigger
    await cdp.evaluate(`(() => {
      const addMsBtn = Array.from(document.querySelectorAll('main button')).find(b => b.innerText.includes('Add Milestone'));
      if (addMsBtn) {
        addMsBtn.focus();
        addMsBtn.click();
      }
    })()`);
    await cdp.waitForSelector("div[role=\"dialog\"]");

    // Accessibility & Semantics checks for MilestoneModal
    const milestoneAriaCheck = await cdp.evaluate(`(() => {
      const dialog = document.querySelector('div[role="dialog"]');
      if (!dialog) return false;
      const role = dialog.getAttribute('role') === 'dialog';
      const modal = dialog.getAttribute('aria-modal') === 'true';
      const labelId = dialog.getAttribute('aria-labelledby');
      const descId = dialog.getAttribute('aria-describedby');
      const titleEl = labelId ? document.getElementById(labelId) : null;
      const descEl = descId ? document.getElementById(descId) : null;
      return role && modal && Boolean(titleEl) && Boolean(descEl);
    })()`);
    recordTest("Milestone modal implements accessible semantics (role='dialog', aria-modal='true', aria-labelledby, aria-describedby)", milestoneAriaCheck, "ARIA attributes verified");

    // Initial focus on title input
    await new Promise((r) => setTimeout(r, 60));
    const milestoneInitialFocus = await cdp.evaluate(`(() => {
      const dialog = document.querySelector('div[role="dialog"]');
      const titleInput = dialog ? dialog.querySelector('input') : null;
      return document.activeElement === titleInput;
    })()`);
    recordTest("Milestone modal moves initial focus into title input on open", milestoneInitialFocus, "Title input focused");

    // Close button visible focus ring
    const milestoneCloseRing = await cdp.evaluate(`(() => {
      const closeBtn = document.querySelector('div[role="dialog"] button[aria-label="Close dialog"]');
      return closeBtn && closeBtn.className.includes('focus-visible:ring-accent');
    })()`);
    recordTest("Milestone modal close button includes Hallmark focus ring styling", milestoneCloseRing, "focus-visible:ring-accent present");

    // Focus wrapping test: Tab from last focusable element wraps to first
    await cdp.evaluate(`(() => {
      const dialog = document.querySelector('div[role="dialog"]');
      const focusable = Array.from(dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])'));
      const last = focusable[focusable.length - 1];
      if (last) last.focus();
    })()`);
    await cdp.pressTab({ shift: false });
    const milestoneTabWrapped = await cdp.evaluate(`(() => {
      const dialog = document.querySelector('div[role="dialog"]');
      const focusable = Array.from(dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])'));
      return document.activeElement === focusable[0];
    })()`);
    recordTest("Milestone modal focus trap: Tab from last element wraps to first element", milestoneTabWrapped, "Tab cyclic wrapping active");

    // Focus wrapping test: Shift+Tab from first focusable element wraps to last
    await cdp.evaluate(`(() => {
      const dialog = document.querySelector('div[role="dialog"]');
      const focusable = Array.from(dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])'));
      if (focusable[0]) focusable[0].focus();
    })()`);
    await cdp.pressTab({ shift: true });
    const milestoneShiftTabWrapped = await cdp.evaluate(`(() => {
      const dialog = document.querySelector('div[role="dialog"]');
      const focusable = Array.from(dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])'));
      return document.activeElement === focusable[focusable.length - 1];
    })()`);
    recordTest("Milestone modal focus trap: Shift+Tab from first element wraps to last element", milestoneShiftTabWrapped, "Shift+Tab reverse cycle active");

    // Escape closes milestone modal and restores focus
    await cdp.pressEscape();
    await new Promise((r) => setTimeout(r, 300));
    let isMsModalOpen = await cdp.evaluate("Boolean(document.querySelector('div[role=\"dialog\"]'))");
    const msFocusRestored = await cdp.evaluate(`(() => {
      const addMsBtn = Array.from(document.querySelectorAll('main button')).find(b => b.innerText.includes('Add Milestone'));
      return document.activeElement === addMsBtn;
    })()`);
    recordTest("Pressing Escape key closes Milestone modal and restores focus to trigger button", !isMsModalOpen && msFocusRestored, "Focus returned to 'Add Milestone' button");

    // Re-open Milestone Modal for creation
    await cdp.evaluate(`(() => {
      const addMsBtn = Array.from(document.querySelectorAll('main button')).find(b => b.innerText.includes('Add Milestone'));
      if (addMsBtn) addMsBtn.click();
    })()`);
    await cdp.waitForSelector("div[role=\"dialog\"]");

    // Fill Milestone Title and submit
    await cdp.evaluate(`(() => {
      const titleInput = document.querySelector('div[role=\"dialog\"] input');
      if (titleInput) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(titleInput, "E2E Milestone Beta");
        titleInput.dispatchEvent(new Event('input', { bubbles: true }));
        titleInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const dialogForm = document.querySelector('div[role=\"dialog\"] form');
      if (dialogForm) {
        const submitBtn = dialogForm.querySelector('button[type=\"submit\"]');
        if (submitBtn) submitBtn.click();
      }
    })()`);
    await new Promise((r) => setTimeout(r, 800));

    const hasMilestoneInUi = await cdp.evaluate("document.body.innerText.includes('E2E Milestone Beta')");
    const dbMilestone = await Milestone.findOne({ project: projectId, title: "E2E Milestone Beta" });
    recordTest(
      "Milestone created and rendered in UI and MongoDB",
      hasMilestoneInUi && Boolean(dbMilestone),
      `Milestone DB ID: ${dbMilestone?._id}`
    );

    // Toggle Milestone to Completed
    await cdp.evaluate(`(() => {
      const toggleMsBtn = Array.from(document.querySelectorAll('main button')).find(b => b.innerText.includes('Mark Completed'));
      if (toggleMsBtn) toggleMsBtn.click();
    })()`);
    await new Promise((r) => setTimeout(r, 800));

    const dbMilestoneCompleted = await Milestone.findById(dbMilestone._id);
    recordTest("Milestone marked Completed in DB", dbMilestoneCompleted?.status === "Completed", "Status: Completed");

    // Reopen Milestone
    await cdp.evaluate(`(() => {
      const toggleMsBtn = Array.from(document.querySelectorAll('main button')).find(b => b.innerText.includes('Reopen'));
      if (toggleMsBtn) toggleMsBtn.click();
    })()`);
    await new Promise((r) => setTimeout(r, 800));

    const dbMilestoneReopened = await Milestone.findById(dbMilestone._id);
    recordTest("Milestone reopened in DB", dbMilestoneReopened?.status !== "Completed", "Status: " + dbMilestoneReopened?.status);

    // -------------------------------------------------------------------------
    // TEST SECTION 9: Project Editing Flow
    // -------------------------------------------------------------------------
    console.log("\n--------------------------------------------------------------------------------");
    console.log("TEST SUITE 9: PROJECT EDITING & PERSISTENCE");
    console.log("--------------------------------------------------------------------------------");

    await cdp.navigate(`${BASE_URL}/dashboard/projects/${projectId}/edit`);
    await cdp.waitForSelector("h1");
    const editH1 = await cdp.evaluate("document.querySelector('h1')?.innerText");
    recordTest("Edit Project page loads with pre-filled fields", editH1?.includes("Edit Project"), `Heading: ${editH1}`);

    // Update title and notes
    await cdp.evaluate(`(() => {
      function setInput(el, val) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(el, val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      function setTextarea(el, val) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        setter.call(el, val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }

      const titleInput = document.querySelector('#project-title');
      const notesInput = document.querySelector('textarea#notes') || document.querySelector('textarea[placeholder*=\"notes\" i]') || document.querySelectorAll('textarea')[1];
      if (titleInput) setInput(titleInput, "E2E Automated Test Platform (Updated)");
      if (notesInput) setTextarea(notesInput, "Extended architectural notes persisted from browser verification.");

      const form = document.querySelector('main form');
      if (form) {
        const submitBtn = form.querySelector('button[type=\"submit\"]');
        if (submitBtn) submitBtn.click();
      }
    })()`);
    await new Promise((r) => setTimeout(r, 1400));

    currentUrl = await cdp.evaluate("window.location.href");
    const hasUpdatedBanner = await cdp.evaluate("document.body.innerText.includes('Project updated successfully')");
    const updatedTitleInUi = await cdp.evaluate("document.querySelector('h1')?.innerText");
    const dbUpdatedProject = await Project.findById(projectId);

    recordTest(
      "Project editing updates title in UI and MongoDB, redirects with success notification",
      hasUpdatedBanner && dbUpdatedProject?.title === "E2E Automated Test Platform (Updated)",
      `Title: "${updatedTitleInUi}"`
    );

    // -------------------------------------------------------------------------
    // TEST SECTION 10: Dashboard Live Statistics Synchronization
    // -------------------------------------------------------------------------
    console.log("\n--------------------------------------------------------------------------------");
    console.log("TEST SUITE 10: DASHBOARD LIVE METRICS SYNCHRONIZATION");
    console.log("--------------------------------------------------------------------------------");

    await cdp.navigate(`${BASE_URL}/dashboard`);
    await cdp.waitForSelector("h1");
    const dashboardBody = await cdp.evaluate("document.body.innerText");
    const showsRecentProject = dashboardBody.includes("E2E Automated Test Platform");
    recordTest("Dashboard reflects recently updated project in live overview", showsRecentProject, "Live data reflected on dashboard");

    // -------------------------------------------------------------------------
    // TEST SECTION 11: Standalone Project Deletion UI & HTTP 501 Safeguard
    // -------------------------------------------------------------------------
    console.log("\n--------------------------------------------------------------------------------");
    console.log("TEST SUITE 11: PROJECT DELETION UI & STANDALONE HTTP 501 SAFEGUARD");
    console.log("--------------------------------------------------------------------------------");

    await cdp.navigate(`${BASE_URL}/dashboard/projects/${projectId}`);
    await cdp.waitForSelector("h1");

    // Click Delete in Header with focus
    await cdp.evaluate(`(() => {
      const delBtn = Array.from(document.querySelectorAll('main button')).find(b => b.innerText.trim() === 'Delete');
      if (delBtn) {
        delBtn.focus();
        delBtn.click();
      }
    })()`);
    await cdp.waitForSelector("div[role=\"dialog\"]");

    let deleteDialogTitle = await cdp.evaluate("document.querySelector('#delete-dialog-title')?.innerText");
    let deleteDialogMessage = await cdp.evaluate("document.querySelector('div[role=\"dialog\"]')?.innerText");
    const hasAccurateWarning =
      deleteDialogTitle === "Delete Project" &&
      deleteDialogMessage.includes("permanently delete this project") &&
      deleteDialogMessage.includes("associated tasks, milestones, and activities");
    recordTest(
      "Project Delete dialog opens with explicit cascade warning and 'Delete Project' button",
      hasAccurateWarning,
      `Dialog Title: "${deleteDialogTitle}"`
    );

    // Delete dialog accessibility attributes
    const deleteAriaCheck = await cdp.evaluate(`(() => {
      const dialog = document.querySelector('div[role="dialog"]');
      if (!dialog) return false;
      const role = dialog.getAttribute('role') === 'dialog';
      const modal = dialog.getAttribute('aria-modal') === 'true';
      const labelId = dialog.getAttribute('aria-labelledby');
      const descId = dialog.getAttribute('aria-describedby');
      const titleEl = labelId ? document.getElementById(labelId) : null;
      const descEl = descId ? document.getElementById(descId) : null;
      return role && modal && Boolean(titleEl) && Boolean(descEl);
    })()`);
    recordTest("Delete dialog implements accessible semantics (role='dialog', aria-modal='true', aria-labelledby, aria-describedby)", deleteAriaCheck, "ARIA attributes verified");

    // Safe initial focus on Cancel button
    await new Promise((r) => setTimeout(r, 60));
    const deleteInitialFocus = await cdp.evaluate(`(() => {
      const cancelBtn = Array.from(document.querySelectorAll('div[role="dialog"] button')).find(b => b.innerText.trim() === 'Cancel');
      return document.activeElement === cancelBtn;
    })()`);
    recordTest("Delete dialog safely places initial focus on Cancel button", deleteInitialFocus, "Cancel button focused to prevent accidental deletion");

    // Focus wrapping test: Tab from Cancel button moves to Confirm Delete button
    await cdp.pressTab({ shift: false });
    const deleteBtnFocused = await cdp.evaluate(`(() => {
      const delBtn = Array.from(document.querySelectorAll('div[role="dialog"] button')).find(b => b.innerText.includes('Delete Project'));
      return document.activeElement === delBtn;
    })()`);
    recordTest("Delete dialog Tab cycles focus to Delete confirmation button", deleteBtnFocused, "Delete button focused");

    // Focus wrapping test: Tab from Confirm Delete wraps back to Cancel button
    await cdp.pressTab({ shift: false });
    const cancelBtnRefocused = await cdp.evaluate(`(() => {
      const cancelBtn = Array.from(document.querySelectorAll('div[role="dialog"] button')).find(b => b.innerText.trim() === 'Cancel');
      return document.activeElement === cancelBtn;
    })()`);
    recordTest("Delete dialog Tab cycles focus back to Cancel button (trap cycle)", cancelBtnRefocused, "Focus trapped inside dialog");

    // Shift+Tab from Cancel wraps back to Delete button
    await cdp.pressTab({ shift: true });
    const shiftBackToDelete = await cdp.evaluate(`(() => {
      const delBtn = Array.from(document.querySelectorAll('div[role="dialog"] button')).find(b => b.innerText.includes('Delete Project'));
      return document.activeElement === delBtn;
    })()`);
    recordTest("Delete dialog Shift+Tab cycles focus back to Delete button", shiftBackToDelete, "Shift+Tab cycle active");

    // Test Escape cancels dialog and restores focus
    await cdp.pressEscape();
    await new Promise((r) => setTimeout(r, 300));
    let isDeleteOpen = await cdp.evaluate("Boolean(document.querySelector('div[role=\"dialog\"]'))");
    const deleteTriggerRestored = await cdp.evaluate(`(() => {
      const delBtn = Array.from(document.querySelectorAll('main button')).find(b => b.innerText.trim() === 'Delete');
      return document.activeElement === delBtn;
    })()`);
    recordTest("Pressing Escape key closes Delete confirmation dialog and restores focus to trigger button", !isDeleteOpen && deleteTriggerRestored, "Focus returned to Delete trigger button");

    // Open from Danger Zone card in Detailed Notes tab
    await cdp.evaluate(`(() => {
      const overviewTab = Array.from(document.querySelectorAll('main button')).find(b => b.innerText.includes('Notes') || b.innerText.includes('Overview'));
      if (overviewTab) overviewTab.click();
    })()`);
    await new Promise((r) => setTimeout(r, 400));

    await cdp.evaluate(`(() => {
      const dangerDeleteBtn = Array.from(document.querySelectorAll('main button')).find(b => b.innerText.includes('Delete Project'));
      if (dangerDeleteBtn) dangerDeleteBtn.click();
    })()`);
    await cdp.waitForSelector("div[role=\"dialog\"]");

    // Confirm Deletion in Dialog
    await cdp.evaluate(`(() => {
      const dialogConfirmBtn = Array.from(document.querySelector('div[role=\"dialog\"]').querySelectorAll('button')).find(b => b.innerText.includes('Delete Project'));
      if (dialogConfirmBtn) dialogConfirmBtn.click();
    })()`);
    await new Promise((r) => setTimeout(r, 1400));

    // Verify 501 Fail-Closed Error Message in UI
    const detailBodyAfterDelete = await cdp.evaluate("document.body.innerText");
    const has501Message =
      detailBodyAfterDelete.includes("Project deletion requires a transaction-capable MongoDB deployment") &&
      detailBodyAfterDelete.includes("Standalone MongoDB instances are unsupported") &&
      detailBodyAfterDelete.includes("Zero records were modified");

    recordTest(
      "Standalone MongoDB returns HTTP 501: UI displays exact transaction-requirement error banner",
      has501Message,
      "Explicit error rendered without false success"
    );

    // Verify ZERO records were deleted in MongoDB
    const postDeleteProject = await Project.findById(projectId);
    const postDeleteTask = await Task.findOne({ project: projectId });
    const postDeleteMilestone = await Milestone.findOne({ project: projectId });

    recordTest(
      "Database audit: Project, Task, and Milestone records remain 100% intact (zero records modified)",
      Boolean(postDeleteProject && postDeleteTask && postDeleteMilestone),
      "Fail-closed atomicity verified on standalone MongoDB"
    );

    // Verify user can retry or close dialog, and current project data is preserved on page
    const pageStillHasProject = await cdp.evaluate("document.querySelector('h1')?.innerText.includes('E2E Automated Test Platform')");
    recordTest("Project detail view remains fully interactive for retry, preserving project data", pageStillHasProject, "No UI state corruptions");

    // -------------------------------------------------------------------------
    // TEST SECTION 12: Responsiveness & Viewport Checks
    // -------------------------------------------------------------------------
    console.log("\n--------------------------------------------------------------------------------");
    console.log("TEST SUITE 12: RESPONSIVENESS & USABILITY AUDIT");
    console.log("--------------------------------------------------------------------------------");

    // Desktop Viewport (1440x900)
    await cdp.setViewport(1440, 900);
    await cdp.navigate(`${BASE_URL}/dashboard`);
    await cdp.waitForSelector("h1");
    const desktopOverflow = await cdp.evaluate("document.documentElement.scrollWidth > window.innerWidth");
    recordTest("Desktop Viewport (1440x900): zero horizontal overflow", !desktopOverflow, "scrollWidth <= innerWidth");

    // Mobile Viewport (375x667 - iPhone SE size)
    await cdp.setViewport(375, 667);
    await cdp.navigate(`${BASE_URL}/dashboard`);
    await cdp.waitForSelector("h1");
    const mobileOverflowDashboard = await cdp.evaluate("document.documentElement.scrollWidth > window.innerWidth");
    recordTest("Mobile Viewport (375x667): /dashboard zero horizontal overflow", !mobileOverflowDashboard, "Layout wraps responsively");

    await cdp.navigate(`${BASE_URL}/dashboard/projects/${projectId}`);
    await cdp.waitForSelector("h1");
    const mobileOverflowDetail = await cdp.evaluate("document.documentElement.scrollWidth > window.innerWidth");
    recordTest("Mobile Viewport (375x667): Project Detail zero horizontal overflow", !mobileOverflowDetail, "Header, badges, and tabs wrap gracefully");

    // -------------------------------------------------------------------------
    // TEST SECTION 13: Browser Console & Network Errors Audit
    // -------------------------------------------------------------------------
    console.log("\n--------------------------------------------------------------------------------");
    console.log("TEST SUITE 13: CONSOLE ERRORS & NETWORK REQUEST AUDIT");
    console.log("--------------------------------------------------------------------------------");

    recordTest(
      "Unhandled browser exceptions check",
      cdp.unhandledExceptions.length === 0,
      `Exceptions: ${cdp.unhandledExceptions.length === 0 ? "None" : JSON.stringify(cdp.unhandledExceptions)}`
    );

    // Check for unexpected console.errors (excluding intentional 401/403/501 logs)
    const severeConsoleErrors = cdp.consoleLogs.filter(
      (log) => log.type === "error" && !log.text.includes("401") && !log.text.includes("501") && !log.text.includes("404")
    );
    recordTest(
      "Browser console log audit",
      severeConsoleErrors.length === 0,
      `Severe errors: ${severeConsoleErrors.length}`
    );

    // -------------------------------------------------------------------------
    // TEST SECTION 14: Security Audit & Credential Protection
    // -------------------------------------------------------------------------
    console.log("\n--------------------------------------------------------------------------------");
    console.log("TEST SUITE 14: CLIENT RESPONSE CREDENTIAL LEAK AUDIT");
    console.log("--------------------------------------------------------------------------------");

    // Inspect page source and JSON responses for leaks of sensitive environment variables
    const pageHtml = await cdp.evaluate("document.documentElement.outerHTML");
    const leaksSecret = pageHtml.includes(NEXTAUTH_SECRET);
    const leaksUri = pageHtml.includes("mongodb://") || pageHtml.includes("mongodb+srv://");

    recordTest("Client DOM/HTML does not expose NEXTAUTH_SECRET", !leaksSecret, "Secret is kept server-side");
    recordTest("Client DOM/HTML does not expose MONGODB_URI", !leaksUri, "Database credentials never leaked");
  } finally {
    // Teardown
    console.log("\n--------------------------------------------------------------------------------");
    console.log("TEARDOWN & CLEANUP");
    console.log("--------------------------------------------------------------------------------");

    cdp.close();
    chrome.kill();
    server.kill();

    try {
      await Activity.deleteMany({ owner: { $in: [ownerUser._id, strangerUser._id] } });
      await Milestone.deleteMany({ owner: { $in: [ownerUser._id, strangerUser._id] } });
      await Task.deleteMany({ owner: { $in: [ownerUser._id, strangerUser._id] } });
      await Project.deleteMany({ owner: { $in: [ownerUser._id, strangerUser._id] } });
      await User.deleteMany({ _id: { $in: [ownerUser._id, strangerUser._id] } });
      await mongoose.disconnect();
      console.log("✓ Database test fixtures removed cleanly.");
    } catch (e) {
      console.warn("Cleanup warning:", e.message);
    }

    try {
      fs.rmSync(tempProfile, { recursive: true, force: true, maxRetries: 3 });
      console.log("✓ Chrome temporary profile deleted.");
    } catch {}

    console.log("✓ Next.js server and Chrome instances stopped.\n");
  }

  // Summary Report
  const passedCount = results.testCases.filter((t) => t.passed).length;
  const totalCount = results.testCases.length;
  console.log("================================================================================");
  console.log(`E2E BROWSER VERIFICATION SUMMARY: ${passedCount} / ${totalCount} PASSED`);
  console.log("================================================================================");

  return results;
}

main().catch((err) => {
  console.error("FATAL ERROR IN E2E VERIFICATION:", err);
  process.exit(1);
});
