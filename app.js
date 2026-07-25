"use strict";

function updateDeviceUiClasses() {
  const touchCapable =
    navigator.maxTouchPoints > 0 ||
    "ontouchstart" in window ||
    window.matchMedia("(pointer: coarse)").matches;

  const tabletMode = touchCapable && window.innerWidth > 680;

  document.documentElement.classList.toggle("touch-ui", touchCapable);
  document.documentElement.classList.toggle("tablet-ui", tabletMode);
}

updateDeviceUiClasses();

const STORAGE = {
  tasks: "theBoxOS4Tasks",
  events: "theBoxOS4Events",
  notes: "theBoxOS4Notes",
  finance: "theBoxOS4Finance",
  theme: "theBoxOS4Theme",
  timerMinutes: "theBoxOS4TimerMinutes",
  focusTotal: "theBoxOS4FocusTotal",
  windowLayouts: "theBoxOSWindowLayouts",
  documentView: "theBoxOSDocumentView",
  lastBackupAt: "theBoxOSLastBackupAt",
  safetyBackup: "theBoxOSSafetyBackup",
  honorPadUiFix: "theBoxOSHonorPadUiFixV1"
};

const DAVAO = {
  latitude: 7.0731,
  longitude: 125.6128
};

const DAILY_QUOTES = [
  "Start where you are. Make the next move count.",
  "Progress grows from the work you repeat.",
  "Clear priorities create calmer days.",
  "Small wins are still wins.",
  "Do the important thing before the urgent noise.",
  "Consistency turns plans into outcomes.",
  "Protect your focus; it shapes your future.",
  "One completed step is better than ten delayed plans.",
  "Make today useful, not perfect.",
  "Momentum begins with one honest action.",
  "Your systems should make hard days easier.",
  "Rest is part of sustainable progress.",
  "Finish what matters, then let the rest wait.",
  "Good work grows from clear attention.",
  "A calm plan can carry a demanding day.",
  "Choose progress over pressure.",
  "Build the day you want, one decision at a time.",
  "Your next action matters more than your last delay.",
  "Keep moving, even when the step is small.",
  "Direction matters more than speed.",
  "Make room for the work that changes things.",
  "Discipline is how goals survive busy days.",
  "Focus on what you can finish today.",
  "Reliable habits create remarkable results.",
  "Today does not need to be perfect to be meaningful.",
  "Plan clearly. Act steadily. Adjust wisely.",
  "Work with purpose, then rest without guilt.",
  "Let your priorities decide where your energy goes.",
  "Progress is easier when the next step is visible.",
  "Use the day; do not let the day use you.",
  "Begin with clarity and end with peace."
];

function getDailyQuote(date = new Date()) {
  const startOfYear = new Date(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((date - startOfYear) / 86400000);
  return DAILY_QUOTES[dayOfYear % DAILY_QUOTES.length];
}

const WEATHER_CODES = {
  0: ["Clear sky", "☀"],
  1: ["Mainly clear", "🌤"],
  2: ["Partly cloudy", "⛅"],
  3: ["Overcast", "☁"],
  45: ["Fog", "🌫"],
  48: ["Rime fog", "🌫"],
  51: ["Light drizzle", "🌦"],
  53: ["Drizzle", "🌦"],
  55: ["Heavy drizzle", "🌧"],
  61: ["Light rain", "🌦"],
  63: ["Rain", "🌧"],
  65: ["Heavy rain", "🌧"],
  80: ["Rain showers", "🌦"],
  81: ["Rain showers", "🌧"],
  82: ["Heavy showers", "⛈"],
  95: ["Thunderstorm", "⛈"],
  96: ["Thunderstorm with hail", "⛈"],
  99: ["Severe thunderstorm", "⛈"]
};

const $ = (id) => document.getElementById(id);

let tasks = loadJSON(STORAGE.tasks, []);
let events = loadJSON(STORAGE.events, []);
let financeEntries = loadJSON(STORAGE.finance, []);

let activeFilter = "all";
let activeWorkspaceFilter = "all";
let searchTerm = "";
let shownMonth = new Date().getMonth();
let shownYear = new Date().getFullYear();

let selectedTimerMinutes = Number(localStorage.getItem(STORAGE.timerMinutes) || 25);
let timerSeconds = selectedTimerMinutes * 60;
let timerRunning = false;
let timerInterval = null;

let topWindowZ = 20;
let toastTimer = null;

const DEFAULT_DOCUMENT_FOLDERS = [
  "FDA",
  "PhilHealth",
  "Suppliers",
  "SK",
  "HR",
  "Finance",
  "Legal",
  "Personal"
];

let documents = [];
let documentFolders = [];
let activeDocumentFolder = "all";
let documentSearchTerm = "";
let documentComplianceFilter = "all";
let documentsLoading = false;
let complianceReminderShown = false;
let currentDocumentUserId = null;
let documentViewMode = localStorage.getItem(STORAGE.documentView) === "list" ? "list" : "grid";
let previewDocumentItem = null;
let previewDocumentSignedUrl = "";
let activeDocumentLinkFilter = null;
let versionDocumentItem = null;
let documentVersions = [];
let documentVersionsLoading = false;
let pendingBackupImport = null;
let backupBusy = false;

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.error(`Could not read ${key}:`, error);
    return fallback;
  }
}

function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));

  if (window.BoxCloud?.isReady()) {
    const cloudCollections = {
      [STORAGE.tasks]: "tasks",
      [STORAGE.events]: "events",
      [STORAGE.finance]: "finance_entries"
    };

    const table = cloudCollections[key];
    if (table) {
      window.BoxCloud.queueCollectionSync(table, value);
    }
  }
}

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2400);
}

function normalizeTask(task = {}) {
  const createdAt = task.createdAt || new Date().toISOString();

  return {
    id: task.id || Date.now() + Math.random(),
    text: task.text || "Untitled task",
    details: typeof task.details === "string"
      ? task.details
      : (typeof task.notes === "string" ? task.notes : ""),
    dueDate: /^\d{4}-\d{2}-\d{2}$/.test(task.dueDate || "")
      ? task.dueDate
      : "",
    workspace: task.workspace || "personal",
    priority: task.priority || "normal",
    completed: Boolean(task.completed),
    createdAt,
    updatedAt: task.updatedAt || createdAt
  };
}

function normalizeData() {
  tasks = tasks.map(normalizeTask);

  events = events.map((event) => ({
    id: event.id || Date.now() + Math.random(),
    title: event.title || "Untitled event",
    date: event.date || new Date().toISOString().slice(0, 10),
    workspace: event.workspace || "personal"
  }));

  financeEntries = financeEntries.map((entry) => ({
    id: entry.id || Date.now() + Math.random(),
    description: entry.description || "Untitled entry",
    amount: Number(entry.amount) || 0,
    type: entry.type || "expense",
    workspace: entry.workspace || "personal",
    createdAt: entry.createdAt || new Date().toISOString()
  }));

  saveJSON(STORAGE.tasks, tasks);
  saveJSON(STORAGE.events, events);
  saveJSON(STORAGE.finance, financeEntries);
}

function updateClock() {
  const now = new Date();
  const hour = now.getHours();

  const greeting =
    hour < 12 ? "Good morning, Lance" :
    hour < 18 ? "Good afternoon, Lance" :
    "Good evening, Lance";

  const dailyQuote = getDailyQuote(now);

  $("greeting").textContent = greeting;
  $("welcomeMessage").textContent = `“${dailyQuote}”`;
  $("welcomeDate").textContent = now.toLocaleDateString("en-PH", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  });

  $("systemTime").textContent = now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  });

  $("systemDate").textContent = now.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric"
  });
}

function openApp(appName) {
  const windowElement = document.querySelector(`[data-app-window="${appName}"]`);
  if (!windowElement) return;

  windowElement.classList.add("open");
  windowElement.classList.remove("minimized");
  updateWindowResponsiveState(windowElement);
  focusWindow(windowElement);

  $("activeAppLabel").textContent =
    appName.charAt(0).toUpperCase() + appName.slice(1);

  document.querySelectorAll(".dock-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.openApp === appName);
  });

  closeLauncher();

  if (appName === "documents" && window.BoxCloud?.isReady()) {
    loadDocuments({ silent: documents.length > 0 });
  }

  if (appName === "backup") {
    renderBackupCenter();
  }
}

function closeApp(windowElement) {
  windowElement.classList.remove("open", "maximized", "minimized");
  updateMaximizeButton(windowElement);
}

function focusWindow(windowElement) {
  topWindowZ += 1;
  windowElement.style.zIndex = topWindowZ;

  document.querySelectorAll(".app-window").forEach((item) => {
    item.classList.toggle("active-window", item === windowElement);
  });
}

function isCompactWindowMode() {
  return window.matchMedia("(max-width: 680px)").matches;
}

function isTabletUiMode() {
  return document.documentElement.classList.contains("tablet-ui");
}

function prepareTabletUiLayoutMigration() {
  if (!isTabletUiMode()) return;
  if (localStorage.getItem(STORAGE.honorPadUiFix) === "1") return;

  // Older desktop-sized defaults look too small on Android tablets.
  // Reset only the saved window geometry once; no user data is removed.
  localStorage.removeItem(STORAGE.windowLayouts);
  localStorage.setItem(STORAGE.honorPadUiFix, "1");
}

function applyTabletDefaultWindowLayout(windowElement) {
  if (!isTabletUiMode() || isCompactWindowMode()) return;
  if (windowElement.classList.contains("maximized")) return;

  const appName = windowElement.dataset.appWindow;
  if (!appName || readWindowLayouts()[appName]) return;

  const desktopRect = $("desktop").getBoundingClientRect();
  if (!desktopRect.width || !desktopRect.height) return;

  const width = Math.min(desktopRect.width - 24, desktopRect.width * 0.92);
  const height = Math.min(desktopRect.height - 20, desktopRect.height * 0.91);
  const left = Math.max(0, (desktopRect.width - width) / 2);
  const top = Math.max(0, (desktopRect.height - height) / 2);

  windowElement.style.left = `${left}px`;
  windowElement.style.top = `${top}px`;
  windowElement.style.width = `${width}px`;
  windowElement.style.height = `${height}px`;
}

const WINDOW_LAYOUT_BREAKPOINTS = {
  medium: 900,
  narrow: 700,
  compact: 500,
  short: 520,
  veryShort: 380
};

function updateWindowResponsiveState(windowElement, observedSize = null) {
  if (!windowElement) return;

  const rect = observedSize || windowElement.getBoundingClientRect();
  const width = Number(rect.width) || 0;
  const height = Number(rect.height) || 0;

  windowElement.classList.toggle(
    "window-medium",
    width > 0 && width <= WINDOW_LAYOUT_BREAKPOINTS.medium
  );
  windowElement.classList.toggle(
    "window-narrow",
    width > 0 && width <= WINDOW_LAYOUT_BREAKPOINTS.narrow
  );
  windowElement.classList.toggle(
    "window-compact",
    width > 0 && width <= WINDOW_LAYOUT_BREAKPOINTS.compact
  );
  windowElement.classList.toggle(
    "window-short",
    height > 0 && height <= WINDOW_LAYOUT_BREAKPOINTS.short
  );
  windowElement.classList.toggle(
    "window-very-short",
    height > 0 && height <= WINDOW_LAYOUT_BREAKPOINTS.veryShort
  );

  windowElement.style.setProperty("--current-window-width", `${Math.round(width)}px`);
  windowElement.style.setProperty("--current-window-height", `${Math.round(height)}px`);
}

function observeWindowResponsiveState(windowElement) {
  updateWindowResponsiveState(windowElement);

  if (!("ResizeObserver" in window)) return;

  const observer = new ResizeObserver((entries) => {
    const entry = entries[0];
    if (!entry) return;
    updateWindowResponsiveState(windowElement, entry.contentRect);
  });

  observer.observe(windowElement);
  windowElement._boxResponsiveObserver = observer;
}

function readWindowLayouts() {
  return loadJSON(STORAGE.windowLayouts, {});
}

function writeWindowLayouts(layouts) {
  try {
    localStorage.setItem(STORAGE.windowLayouts, JSON.stringify(layouts));
  } catch (error) {
    console.error("Could not save window layouts:", error);
  }
}

function saveWindowLayout(windowElement) {
  if (isCompactWindowMode() || windowElement.classList.contains("maximized")) return;

  const desktopRect = $("desktop").getBoundingClientRect();
  const rect = windowElement.getBoundingClientRect();
  const appName = windowElement.dataset.appWindow;
  if (!appName || !desktopRect.width || !desktopRect.height) return;

  const layouts = readWindowLayouts();
  layouts[appName] = {
    left: Math.max(0, rect.left - desktopRect.left),
    top: Math.max(0, rect.top - desktopRect.top),
    width: rect.width,
    height: rect.height
  };
  writeWindowLayouts(layouts);
}

function applyStoredWindowLayout(windowElement) {
  if (isCompactWindowMode()) return;

  const appName = windowElement.dataset.appWindow;
  const layout = readWindowLayouts()[appName];
  if (!layout) return;

  const values = [layout.left, layout.top, layout.width, layout.height];
  if (!values.every(Number.isFinite)) return;

  windowElement.style.left = `${layout.left}px`;
  windowElement.style.top = `${layout.top}px`;
  windowElement.style.width = `${layout.width}px`;
  windowElement.style.height = `${layout.height}px`;
  clampWindowToDesktop(windowElement);
}

function clampWindowToDesktop(windowElement) {
  if (isCompactWindowMode() || windowElement.classList.contains("maximized")) return;

  const desktopRect = $("desktop").getBoundingClientRect();
  const rect = windowElement.getBoundingClientRect();
  if (!desktopRect.width || !desktopRect.height) return;

  const minWidth = Math.min(300, desktopRect.width);
  const minHeight = Math.min(230, desktopRect.height);
  const width = Math.min(Math.max(rect.width, minWidth), desktopRect.width);
  const height = Math.min(Math.max(rect.height, minHeight), desktopRect.height);
  const currentLeft = rect.left - desktopRect.left;
  const currentTop = rect.top - desktopRect.top;
  const left = Math.max(0, Math.min(currentLeft, desktopRect.width - width));
  const top = Math.max(0, Math.min(currentTop, desktopRect.height - height));

  windowElement.style.left = `${left}px`;
  windowElement.style.top = `${top}px`;
  windowElement.style.width = `${width}px`;
  windowElement.style.height = `${height}px`;
  updateWindowResponsiveState(windowElement);
}

function updateMaximizeButton(windowElement) {
  const button = windowElement.querySelector(".maximize-button");
  if (!button) return;

  const maximized = windowElement.classList.contains("maximized");
  button.textContent = maximized ? "❐" : "□";
  button.title = maximized ? "Restore window" : "Maximize window";
  button.setAttribute("aria-label", button.title);
}

function toggleMaximize(windowElement) {
  if (windowElement.classList.contains("maximized")) {
    windowElement.classList.remove("maximized");
    applyStoredWindowLayout(windowElement);
    clampWindowToDesktop(windowElement);
  } else {
    saveWindowLayout(windowElement);
    windowElement.classList.add("maximized");
  }

  updateMaximizeButton(windowElement);
  requestAnimationFrame(() => updateWindowResponsiveState(windowElement));
  focusWindow(windowElement);
}

function minimizeWindow(windowElement) {
  windowElement.classList.add("minimized");
}

function openLauncher() {
  $("launcher").classList.add("open");
}

function closeLauncher() {
  $("launcher").classList.remove("open");
}

function initializeWindowControls() {
  prepareTabletUiLayoutMigration();

  document.querySelectorAll(".app-window").forEach((windowElement) => {
    windowElement.addEventListener("pointerdown", () => focusWindow(windowElement));

    windowElement.querySelector(".close-button").addEventListener("click", () => {
      closeApp(windowElement);
    });

    windowElement.querySelector(".minimize-button").addEventListener("click", () => {
      minimizeWindow(windowElement);
    });

    windowElement.querySelector(".maximize-button").addEventListener("click", () => {
      toggleMaximize(windowElement);
    });

    const resizeHandle = document.createElement("div");
    resizeHandle.className = "window-resize-handle";
    resizeHandle.setAttribute("role", "button");
    resizeHandle.setAttribute("aria-label", "Resize window");
    resizeHandle.title = "Drag to resize";
    windowElement.appendChild(resizeHandle);

    applyTabletDefaultWindowLayout(windowElement);
    applyStoredWindowLayout(windowElement);
    updateMaximizeButton(windowElement);
    observeWindowResponsiveState(windowElement);
    enableDragging(windowElement);
    enableResizing(windowElement, resizeHandle);
  });
}

function enableDragging(windowElement) {
  const titlebar = windowElement.querySelector(".window-titlebar");
  let dragging = false;
  let moved = false;
  let offsetX = 0;
  let offsetY = 0;
  let startX = 0;
  let startY = 0;
  let lastTouchTap = 0;

  titlebar.addEventListener("dblclick", (event) => {
    if (event.target.closest("button")) return;
    event.preventDefault();
    toggleMaximize(windowElement);
  });

  titlebar.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button") || windowElement.classList.contains("maximized")) return;

    dragging = true;
    moved = false;
    startX = event.clientX;
    startY = event.clientY;
    const rect = windowElement.getBoundingClientRect();
    offsetX = event.clientX - rect.left;
    offsetY = event.clientY - rect.top;
    titlebar.setPointerCapture(event.pointerId);
    focusWindow(windowElement);
  });

  titlebar.addEventListener("pointermove", (event) => {
    if (!dragging) return;

    if (Math.abs(event.clientX - startX) > 4 || Math.abs(event.clientY - startY) > 4) {
      moved = true;
    }

    const desktopRect = $("desktop").getBoundingClientRect();
    const windowRect = windowElement.getBoundingClientRect();

    let nextLeft = event.clientX - desktopRect.left - offsetX;
    let nextTop = event.clientY - desktopRect.top - offsetY;

    nextLeft = Math.max(0, Math.min(nextLeft, desktopRect.width - windowRect.width));
    nextTop = Math.max(0, Math.min(nextTop, desktopRect.height - windowRect.height));

    windowElement.style.left = `${nextLeft}px`;
    windowElement.style.top = `${nextTop}px`;
  });

  const finishDrag = (event) => {
    if (!dragging) return;
    dragging = false;

    if (titlebar.hasPointerCapture?.(event.pointerId)) {
      titlebar.releasePointerCapture(event.pointerId);
    }

    if (moved) {
      saveWindowLayout(windowElement);
      return;
    }

    if (event.pointerType !== "mouse") {
      const now = Date.now();
      if (now - lastTouchTap < 360) {
        lastTouchTap = 0;
        toggleMaximize(windowElement);
      } else {
        lastTouchTap = now;
      }
    }
  };

  titlebar.addEventListener("pointerup", finishDrag);
  titlebar.addEventListener("pointercancel", finishDrag);
}

function enableResizing(windowElement, resizeHandle) {
  let resizing = false;
  let startX = 0;
  let startY = 0;
  let startWidth = 0;
  let startHeight = 0;
  let startLeft = 0;
  let startTop = 0;

  resizeHandle.addEventListener("pointerdown", (event) => {
    if (isCompactWindowMode() || windowElement.classList.contains("maximized")) return;

    event.preventDefault();
    event.stopPropagation();
    clampWindowToDesktop(windowElement);

    const desktopRect = $("desktop").getBoundingClientRect();
    const rect = windowElement.getBoundingClientRect();
    resizing = true;
    startX = event.clientX;
    startY = event.clientY;
    startWidth = rect.width;
    startHeight = rect.height;
    startLeft = rect.left - desktopRect.left;
    startTop = rect.top - desktopRect.top;

    windowElement.classList.add("resizing");
    resizeHandle.setPointerCapture(event.pointerId);
    focusWindow(windowElement);
  });

  resizeHandle.addEventListener("pointermove", (event) => {
    if (!resizing) return;

    const desktopRect = $("desktop").getBoundingClientRect();
    const minWidth = Math.min(300, desktopRect.width);
    const minHeight = Math.min(230, desktopRect.height);
    const maxWidth = Math.max(minWidth, desktopRect.width - startLeft);
    const maxHeight = Math.max(minHeight, desktopRect.height - startTop);
    const width = Math.max(minWidth, Math.min(startWidth + event.clientX - startX, maxWidth));
    const height = Math.max(minHeight, Math.min(startHeight + event.clientY - startY, maxHeight));

    windowElement.style.width = `${width}px`;
    windowElement.style.height = `${height}px`;
    updateWindowResponsiveState(windowElement, { width, height });
  });

  const finishResize = (event) => {
    if (!resizing) return;
    resizing = false;
    windowElement.classList.remove("resizing");

    if (resizeHandle.hasPointerCapture?.(event.pointerId)) {
      resizeHandle.releasePointerCapture(event.pointerId);
    }

    clampWindowToDesktop(windowElement);
    saveWindowLayout(windowElement);
  };

  resizeHandle.addEventListener("pointerup", finishResize);
  resizeHandle.addEventListener("pointercancel", finishResize);
}

window.addEventListener("resize", () => {
  updateDeviceUiClasses();

  document.querySelectorAll(".app-window").forEach((windowElement) => {
    if (!isCompactWindowMode()) {
      applyTabletDefaultWindowLayout(windowElement);
      applyStoredWindowLayout(windowElement);
      clampWindowToDesktop(windowElement);
    }
    updateWindowResponsiveState(windowElement);
  });
});

let editingTaskId = null;
let pendingTaskSource = null;

function createTask({ text, workspace, priority, details = "", dueDate = "" }) {
  const cleanText = text.trim();
  if (!cleanText) return false;

  const timestamp = new Date().toISOString();

  tasks.unshift({
    id: Date.now() + Math.random(),
    text: cleanText,
    details: details.trim(),
    dueDate,
    workspace,
    priority,
    completed: false,
    createdAt: timestamp,
    updatedAt: timestamp
  });

  saveJSON(STORAGE.tasks, tasks);
  renderAll();
  return true;
}

function updateTask(taskId, values) {
  const task = tasks.find((item) => String(item.id) === String(taskId));
  if (!task) return false;

  const cleanText = values.text.trim();
  if (!cleanText) return false;

  task.text = cleanText;
  task.details = values.details.trim();
  task.dueDate = values.dueDate;
  task.workspace = values.workspace;
  task.priority = values.priority;
  task.updatedAt = new Date().toISOString();

  saveJSON(STORAGE.tasks, tasks);
  renderAll();
  return true;
}

function openTaskModal(defaults = {}, source = null, taskId = null) {
  editingTaskId = taskId;
  pendingTaskSource = source;

  $("taskModalTitle").value = defaults.text || "";
  $("taskModalWorkspace").value = defaults.workspace || "personal";
  $("taskModalPriority").value = defaults.priority || "normal";
  $("taskModalDueDate").value = defaults.dueDate || "";
  $("taskModalDetails").value = defaults.details || "";

  $("taskModalHeading").textContent = taskId ? "Edit task" : "Create task";
  $("saveTaskModalButton").textContent = taskId ? "Save changes" : "Create task";

  const modal = $("taskModal");
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");

  setTimeout(() => {
    $("taskModalTitle").focus();
    $("taskModalTitle").select();
  }, 30);
}

function closeTaskModal() {
  const modal = $("taskModal");
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  editingTaskId = null;
  pendingTaskSource = null;
}

function formatTaskDate(dateString) {
  if (!dateString) return "";

  return new Date(`${dateString}T00:00:00`).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function getDueDateInfo(task) {
  if (!task.dueDate) return null;

  const due = new Date(`${task.dueDate}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const daysAway = Math.round((due - today) / 86400000);

  if (task.completed) {
    return { className: "completed", label: `Due ${formatTaskDate(task.dueDate)}` };
  }

  if (daysAway < 0) {
    return { className: "overdue", label: `Overdue · ${formatTaskDate(task.dueDate)}` };
  }

  if (daysAway === 0) {
    return { className: "today", label: "Due today" };
  }

  if (daysAway === 1) {
    return { className: "tomorrow", label: "Due tomorrow" };
  }

  return { className: "upcoming", label: `Due ${formatTaskDate(task.dueDate)}` };
}

function formatTaskTimestamp(timestamp) {
  if (!timestamp) return "";

  return new Date(timestamp).toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function getVisibleTasks() {
  return tasks.filter((task) => {
    const matchesStatus =
      activeFilter === "all" ||
      (activeFilter === "open" && !task.completed) ||
      (activeFilter === "done" && task.completed);

    const matchesWorkspace =
      activeWorkspaceFilter === "all" ||
      task.workspace === activeWorkspaceFilter;

    const searchableText = `${task.text} ${task.details || ""}`.toLowerCase();
    const matchesSearch = searchableText.includes(searchTerm.toLowerCase());

    return matchesStatus && matchesWorkspace && matchesSearch;
  });
}

function buildTaskRow(task) {
  const dueInfo = getDueDateInfo(task);
  const row = document.createElement("div");
  row.className = [
    "task-item",
    task.completed ? "done" : "",
    dueInfo ? `due-${dueInfo.className}` : ""
  ].filter(Boolean).join(" ");

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = task.completed;
  checkbox.setAttribute("aria-label", `Mark ${task.text} as ${task.completed ? "open" : "complete"}`);

  checkbox.addEventListener("change", () => {
    task.completed = checkbox.checked;
    task.updatedAt = new Date().toISOString();
    saveJSON(STORAGE.tasks, tasks);
    renderAll();
  });

  const content = document.createElement("div");
  content.className = "task-content";

  const title = document.createElement("strong");
  title.className = "task-title";
  title.textContent = task.text;

  const meta = document.createElement("div");
  meta.className = "task-meta";

  const workspaceBadge = document.createElement("span");
  workspaceBadge.className = `task-badge workspace-${task.workspace}`;
  workspaceBadge.textContent = task.workspace;

  const priorityBadge = document.createElement("span");
  priorityBadge.className = `task-badge priority-${task.priority}`;
  priorityBadge.textContent = task.priority;

  meta.append(workspaceBadge, priorityBadge);

  if (dueInfo) {
    const dueBadge = document.createElement("span");
    dueBadge.className = `task-badge due-badge ${dueInfo.className}`;
    dueBadge.textContent = dueInfo.label;
    meta.appendChild(dueBadge);
  }

  content.append(title, meta);

  if (task.details) {
    const details = document.createElement("details");
    details.className = "task-details-block";

    const summary = document.createElement("summary");
    summary.textContent = "View notes/details";

    const detailsText = document.createElement("p");
    detailsText.textContent = task.details;

    const timestamps = document.createElement("small");
    timestamps.className = "task-timestamps";
    timestamps.textContent = `Created ${formatTaskTimestamp(task.createdAt)} · Updated ${formatTaskTimestamp(task.updatedAt || task.createdAt)}`;

    details.append(summary, detailsText, timestamps);
    content.appendChild(details);
  }

  const actions = document.createElement("div");
  actions.className = "task-actions";

  const editButton = document.createElement("button");
  editButton.className = "edit-button";
  editButton.type = "button";
  editButton.textContent = "✎";
  editButton.title = "Edit task";
  editButton.setAttribute("aria-label", `Edit ${task.text}`);

  editButton.addEventListener("click", () => {
    openTaskModal(task, null, task.id);
  });

  const linkedDocuments = getLinkedDocuments("task", task.id);
  if (linkedDocuments.length) {
    const documentsButton = document.createElement("button");
    documentsButton.className = "linked-documents-button";
    documentsButton.type = "button";
    documentsButton.textContent = `▣ ${linkedDocuments.length}`;
    documentsButton.title = `${linkedDocuments.length} linked document${linkedDocuments.length === 1 ? "" : "s"}`;
    documentsButton.setAttribute("aria-label", `Open documents linked to ${task.text}`);
    documentsButton.addEventListener("click", () => openDocumentsForLinkedItem("task", task));
    actions.appendChild(documentsButton);
  }

  const deleteButton = document.createElement("button");
  deleteButton.className = "delete-button";
  deleteButton.type = "button";
  deleteButton.textContent = "✕";
  deleteButton.title = "Delete task";
  deleteButton.setAttribute("aria-label", `Delete ${task.text}`);

  deleteButton.addEventListener("click", () => {
    tasks = tasks.filter((item) => item.id !== task.id);
    saveJSON(STORAGE.tasks, tasks);
    renderAll();
    showToast("Task deleted");
  });

  actions.append(editButton, deleteButton);
  row.append(checkbox, content, actions);
  return row;
}

function renderTasks() {
  const list = $("taskList");
  const visible = getVisibleTasks();
  list.innerHTML = "";

  visible.forEach((task) => list.appendChild(buildTaskRow(task)));
  $("emptyTasks").style.display = visible.length ? "none" : "block";

  renderWorkspaceTaskList("pharmacy", $("pharmacyTaskList"));
  renderWorkspaceTaskList("clinic", $("clinicTaskList"));
  renderWorkspaceTaskList("sk", $("skTaskList"));
}

function renderWorkspaceTaskList(workspace, container) {
  const workspaceTasks = tasks
    .filter((task) => task.workspace === workspace)
    .slice(0, 8);

  container.innerHTML = "";

  if (!workspaceTasks.length) {
    const message = document.createElement("p");
    message.className = "empty-state";
    message.textContent = "No tasks in this workspace.";
    container.appendChild(message);
    return;
  }

  workspaceTasks.forEach((task) => container.appendChild(buildTaskRow(task)));
}

function renderDashboard() {
  const open = tasks.filter((task) => !task.completed);
  const done = tasks.filter((task) => task.completed);
  const urgent = open.filter((task) => task.priority === "urgent");
  const percent = tasks.length ? Math.round((done.length / tasks.length) * 100) : 0;
  const topPriority =
    urgent[0] ||
    open.find((task) => task.priority === "important") ||
    open[0];

  $("desktopOpenTasks").textContent = open.length;
  $("desktopUrgentTasks").textContent = urgent.length;
  $("dashboardOpen").textContent = open.length;
  $("dashboardUrgent").textContent = urgent.length;
  $("dashboardFocus").textContent = Number(localStorage.getItem(STORAGE.focusTotal) || 0);

  $("topPriority").textContent = topPriority ? topPriority.text : "Everything is complete";
  $("completionText").textContent = `${percent}% of your tasks are complete.`;
  $("completionPercent").textContent = `${percent}%`;
  $("progressRing").style.background =
    `conic-gradient(var(--accent) ${percent * 3.6}deg, var(--surface-soft) 0deg)`;

  $("pharmacyOpenCount").textContent =
    `${open.filter((task) => task.workspace === "pharmacy").length} open`;
  $("clinicOpenCount").textContent =
    `${open.filter((task) => task.workspace === "clinic").length} open`;
  $("skOpenCount").textContent =
    `${open.filter((task) => task.workspace === "sk").length} open`;

  const upcoming = getUpcomingEvents();
  const nextEvent = upcoming[0];

  $("desktopNextEvent").textContent = nextEvent ? nextEvent.title : "None";
  $("desktopNextEventDate").textContent = nextEvent
    ? formatEventDate(nextEvent.date)
    : "No upcoming date";
}

function renderCalendar() {
  const calendarDays = $("calendarDays");
  calendarDays.innerHTML = "";

  const firstDay = new Date(shownYear, shownMonth, 1).getDay();
  const numberOfDays = new Date(shownYear, shownMonth + 1, 0).getDate();
  const today = new Date();

  $("calendarTitle").textContent =
    new Date(shownYear, shownMonth).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric"
    });

  for (let index = 0; index < firstDay; index += 1) {
    calendarDays.appendChild(document.createElement("div"));
  }

  for (let day = 1; day <= numberOfDays; day += 1) {
    const element = document.createElement("div");
    element.className = "calendar-day";
    element.textContent = day;

    const isToday =
      day === today.getDate() &&
      shownMonth === today.getMonth() &&
      shownYear === today.getFullYear();

    if (isToday) element.classList.add("today");

    const dateKey =
      `${shownYear}-${String(shownMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    if (events.some((event) => event.date === dateKey)) {
      element.classList.add("has-event");
    }

    if (tasks.some((task) => !task.completed && task.dueDate === dateKey)) {
      element.classList.add("has-task-due");
    }

    calendarDays.appendChild(element);
  }
}

function formatEventDate(dateString) {
  if (!dateString) return "";

  return new Date(`${dateString}T00:00:00`).toLocaleDateString("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function getUpcomingEvents() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return [...events]
    .filter((event) => new Date(`${event.date}T00:00:00`) >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function renderEvents() {
  const list = $("eventList");
  const upcoming = getUpcomingEvents();
  list.innerHTML = "";

  upcoming.slice(0, 10).forEach((event) => {
    const date = new Date(`${event.date}T00:00:00`);

    const row = document.createElement("div");
    row.className = "event-item";

    const dateBox = document.createElement("div");
    dateBox.className = "event-date";

    const day = document.createElement("strong");
    day.textContent = date.getDate();

    const month = document.createElement("span");
    month.textContent = date.toLocaleDateString("en-US", { month: "short" });

    dateBox.append(day, month);

    const content = document.createElement("div");

    const title = document.createElement("strong");
    title.textContent = event.title;

    const meta = document.createElement("span");
    meta.className = "task-meta";
    meta.textContent = event.workspace;

    content.append(title, meta);

    const actions = document.createElement("div");
    actions.className = "event-actions";
    const linkedDocuments = getLinkedDocuments("event", event.id);
    if (linkedDocuments.length) {
      const documentsButton = document.createElement("button");
      documentsButton.className = "linked-documents-button";
      documentsButton.type = "button";
      documentsButton.textContent = `▣ ${linkedDocuments.length}`;
      documentsButton.title = `${linkedDocuments.length} linked document${linkedDocuments.length === 1 ? "" : "s"}`;
      documentsButton.addEventListener("click", () => openDocumentsForLinkedItem("event", event));
      actions.appendChild(documentsButton);
    }

    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-button";
    deleteButton.textContent = "✕";

    deleteButton.addEventListener("click", () => {
      events = events.filter((item) => item.id !== event.id);
      saveJSON(STORAGE.events, events);
      renderAll();
      showToast("Event deleted");
    });

    actions.appendChild(deleteButton);
    row.append(dateBox, content, actions);
    list.appendChild(row);
  });

  $("emptyEvents").style.display = upcoming.length ? "none" : "block";
}

function formatMoney(amount) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP"
  }).format(amount);
}

function renderFinance() {
  const income = financeEntries
    .filter((entry) => entry.type === "income")
    .reduce((sum, entry) => sum + entry.amount, 0);

  const expenses = financeEntries
    .filter((entry) => entry.type === "expense")
    .reduce((sum, entry) => sum + entry.amount, 0);

  $("financeIncome").textContent = formatMoney(income);
  $("financeExpenses").textContent = formatMoney(expenses);
  $("financeBalance").textContent = formatMoney(income - expenses);

  const list = $("financeList");
  list.innerHTML = "";

  financeEntries.slice(0, 20).forEach((entry) => {
    const row = document.createElement("div");
    row.className = `finance-item ${entry.type}`;

    const content = document.createElement("div");

    const title = document.createElement("strong");
    title.textContent = entry.description;

    const meta = document.createElement("span");
    meta.className = "task-meta";
    meta.textContent = `${entry.workspace} · ${entry.type}`;

    content.append(title, meta);

    const amount = document.createElement("strong");
    amount.textContent = formatMoney(entry.amount);

    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-button";
    deleteButton.textContent = "✕";

    deleteButton.addEventListener("click", () => {
      financeEntries = financeEntries.filter((item) => item.id !== entry.id);
      saveJSON(STORAGE.finance, financeEntries);
      renderFinance();
      showToast("Finance entry deleted");
    });

    row.append(content, amount, deleteButton);
    list.appendChild(row);
  });

  $("emptyFinance").style.display = financeEntries.length ? "none" : "block";
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;

  const units = ["KB", "MB", "GB", "TB"];
  let size = value / 1024;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const digits = size >= 10 ? 0 : 1;
  return `${size.toFixed(digits)} ${units[unitIndex]}`;
}

function getDocumentTypeLabel(documentItem) {
  const name = String(documentItem.name || "");
  const extension = name.includes(".")
    ? name.split(".").pop().toUpperCase().slice(0, 4)
    : "FILE";

  if ((documentItem.mime_type || "").startsWith("image/")) return "IMG";
  return extension || "FILE";
}

function formatDocumentDate(timestamp) {
  if (!timestamp) return "Unknown date";

  return new Date(timestamp).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function parseDocumentExpiryDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function getDocumentTags(documentItem) {
  const source = Array.isArray(documentItem.tags)
    ? documentItem.tags
    : String(documentItem.tags || "").split(",");
  const seen = new Set();
  return source
    .map((tag) => String(tag || "").trim().replace(/\s+/g, " ").slice(0, 40))
    .filter((tag) => {
      if (!tag) return false;
      const key = tag.toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 20);
}

function getDocumentCompliance(documentItem) {
  const expiry = parseDocumentExpiryDate(documentItem.expiry_date);
  const reminderValue = Number(documentItem.reminder_days ?? 30);
  const reminderDays = Number.isFinite(reminderValue) ? Math.max(0, reminderValue) : 30;
  if (!expiry) return { key: "no-expiry", label: "No expiry date", days: null, expiry: null, reminderDays };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((expiry.getTime() - today.getTime()) / 86400000);
  if (days < 0) return { key: "expired", label: `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago`, days, expiry, reminderDays };
  if (days <= reminderDays) {
    const label = days === 0 ? "Expires today" : `Expires in ${days} day${days === 1 ? "" : "s"}`;
    return { key: "expiring", label, days, expiry, reminderDays };
  }
  return { key: "active", label: "Active", days, expiry, reminderDays };
}

function formatDocumentExpiryDate(value) {
  const date = parseDocumentExpiryDate(value);
  if (!date) return "Not set";
  return date.toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function normalizeDocumentTagInput(value) {
  return getDocumentTags({ tags: value });
}

function normalizeDocumentLinkIds(value) {
  const raw = Array.isArray(value) ? value : [];
  const seen = new Set();
  return raw
    .map((item) => String(item ?? "").trim())
    .filter((item) => {
      if (!item || seen.has(item)) return false;
      seen.add(item);
      return true;
    });
}

function getDocumentLinkedTaskIds(documentItem) {
  return normalizeDocumentLinkIds(documentItem?.linked_task_ids);
}

function getDocumentLinkedEventIds(documentItem) {
  return normalizeDocumentLinkIds(documentItem?.linked_event_ids);
}

function getLinkedDocuments(type, itemId) {
  const id = String(itemId);
  return documents.filter((documentItem) => {
    if (documentItem.deleted_at) return false;
    const ids = type === "task"
      ? getDocumentLinkedTaskIds(documentItem)
      : getDocumentLinkedEventIds(documentItem);
    return ids.includes(id);
  });
}

function openDocumentsForLinkedItem(type, item) {
  activeDocumentLinkFilter = {
    type,
    id: String(item.id),
    label: type === "task" ? item.text : item.title
  };
  activeDocumentFolder = "all";
  documentSearchTerm = "";
  documentComplianceFilter = "all";
  if ($("documentSearch")) $("documentSearch").value = "";
  if ($("documentComplianceFilter")) $("documentComplianceFilter").value = "all";
  openApp("documents");
  renderDocuments();
}

function clearDocumentLinkFilter() {
  activeDocumentLinkFilter = null;
  renderDocuments();
}

function getSelectedOptionValues(selectElement) {
  return Array.from(selectElement?.selectedOptions || []).map((option) => option.value);
}

function populateDocumentLinkSelectors(documentItem) {
  const taskSelect = $("documentDetailsTaskLinks");
  const eventSelect = $("documentDetailsEventLinks");
  if (!taskSelect || !eventSelect) return;

  const linkedTaskIds = new Set(getDocumentLinkedTaskIds(documentItem));
  const linkedEventIds = new Set(getDocumentLinkedEventIds(documentItem));

  taskSelect.innerHTML = "";
  [...tasks]
    .sort((first, second) => Number(first.completed) - Number(second.completed) || String(first.text).localeCompare(String(second.text)))
    .forEach((task) => {
      const option = document.createElement("option");
      option.value = String(task.id);
      option.textContent = `${task.completed ? "✓" : "○"} ${task.text} · ${task.workspace}`;
      option.selected = linkedTaskIds.has(option.value);
      taskSelect.appendChild(option);
    });

  eventSelect.innerHTML = "";
  [...events]
    .sort((first, second) => String(first.date).localeCompare(String(second.date)))
    .forEach((event) => {
      const option = document.createElement("option");
      option.value = String(event.id);
      option.textContent = `${formatEventDate(event.date)} · ${event.title}`;
      option.selected = linkedEventIds.has(option.value);
      eventSelect.appendChild(option);
    });

  if (!tasks.length) {
    const option = document.createElement("option");
    option.disabled = true;
    option.textContent = "No tasks available";
    taskSelect.appendChild(option);
  }

  if (!events.length) {
    const option = document.createElement("option");
    option.disabled = true;
    option.textContent = "No calendar events available";
    eventSelect.appendChild(option);
  }
}

function renderDocumentLinkFilterBanner() {
  const banner = $("documentLinkFilterBanner");
  if (!banner) return;
  banner.classList.toggle("hidden", !activeDocumentLinkFilter);
  if (activeDocumentLinkFilter) {
    const typeLabel = activeDocumentLinkFilter.type === "task" ? "task" : "event";
    $("documentLinkFilterText").textContent = `Showing documents linked to ${typeLabel}: ${activeDocumentLinkFilter.label}`;
  }
}

function buildDocumentRelatedItems(documentItem, container, { interactive = true } = {}) {
  container.innerHTML = "";
  const taskIds = new Set(getDocumentLinkedTaskIds(documentItem));
  const eventIds = new Set(getDocumentLinkedEventIds(documentItem));
  const linkedTasks = tasks.filter((task) => taskIds.has(String(task.id)));
  const linkedEvents = events.filter((event) => eventIds.has(String(event.id)));

  if (!linkedTasks.length && !linkedEvents.length) {
    const empty = document.createElement("em");
    empty.textContent = "No linked tasks or events.";
    container.appendChild(empty);
    return;
  }

  linkedTasks.forEach((task) => {
    const chip = document.createElement(interactive ? "button" : "span");
    if (interactive) chip.type = "button";
    chip.className = "document-related-chip task-link";
    chip.textContent = `Task · ${task.text}`;
    if (interactive) chip.addEventListener("click", () => {
      closeDocumentPreview();
      activeFilter = "all";
      activeWorkspaceFilter = "all";
      document.querySelectorAll(".filter").forEach((button) => {
        button.classList.toggle("active", button.dataset.filter === "all");
      });
      $("workspaceFilter").value = "all";
      openApp("tasks");
      searchTerm = task.text;
      $("globalSearch").value = task.text;
      renderTasks();
    });
    container.appendChild(chip);
  });

  linkedEvents.forEach((eventItem) => {
    const chip = document.createElement(interactive ? "button" : "span");
    if (interactive) chip.type = "button";
    chip.className = "document-related-chip event-link";
    chip.textContent = `Event · ${eventItem.title}`;
    if (interactive) chip.addEventListener("click", () => {
      closeDocumentPreview();
      shownMonth = new Date(`${eventItem.date}T00:00:00`).getMonth();
      shownYear = new Date(`${eventItem.date}T00:00:00`).getFullYear();
      openApp("calendar");
      renderCalendar();
    });
    container.appendChild(chip);
  });
}

function normalizeFolderName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function getCustomDocumentFolderNames() {
  return documentFolders
    .map((folder) => normalizeFolderName(folder.name))
    .filter(Boolean)
    .sort((first, second) =>
      first.localeCompare(second, undefined, { sensitivity: "base" })
    );
}

function getAllDocumentFolderNames() {
  const names = [...DEFAULT_DOCUMENT_FOLDERS, ...getCustomDocumentFolderNames()];
  const seen = new Set();

  return names.filter((name) => {
    const key = name.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getFolderIcon(folderName) {
  const defaultIcons = {
    FDA: "F",
    PhilHealth: "P",
    Suppliers: "S",
    SK: "K",
    HR: "H",
    Finance: "₱",
    Legal: "§",
    Personal: "L"
  };

  return defaultIcons[folderName] || normalizeFolderName(folderName).charAt(0).toUpperCase() || "◆";
}

function selectDocumentFolder(folderName) {
  activeDocumentFolder = folderName;
  activeDocumentLinkFilter = null;
  renderDocuments();
}

function renderDocumentFolderControls() {
  const list = $("documentFolderList");
  const select = $("documentUploadFolder");
  if (!list || !select) return;

  const previousSelection = select.value;
  const folderNames = getAllDocumentFolderNames();

  list.innerHTML = "";
  folderNames.forEach((folderName) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "document-folder";
    button.dataset.documentFolder = folderName;

    const icon = document.createElement("span");
    icon.textContent = getFolderIcon(folderName);

    const label = document.createElement("strong");
    label.textContent = folderName;

    const count = document.createElement("small");
    count.dataset.documentCount = folderName;
    count.textContent = documents.filter(
      (documentItem) => !documentItem.deleted_at && documentItem.folder === folderName
    ).length;

    button.append(icon, label, count);
    button.addEventListener("click", () => selectDocumentFolder(folderName));
    list.appendChild(button);
  });

  select.innerHTML = "";
  folderNames.forEach((folderName) => {
    const option = document.createElement("option");
    option.value = folderName;
    option.textContent = folderName;
    select.appendChild(option);
  });

  const preferredSelection = folderNames.includes(previousSelection)
    ? previousSelection
    : folderNames.includes(activeDocumentFolder)
      ? activeDocumentFolder
      : folderNames.includes("Personal")
        ? "Personal"
        : folderNames[0] || "";

  select.value = preferredSelection;
}

function getVisibleDocuments() {
  const normalizedSearch = documentSearchTerm.toLocaleLowerCase();

  const filtered = documents.filter((documentItem) => {
    const isDeleted = Boolean(documentItem.deleted_at);
    const matchesFolder = activeDocumentFolder === "trash"
      ? isDeleted
      : !isDeleted && (
          activeDocumentFolder === "all" ||
          (activeDocumentFolder === "favorites" && documentItem.is_favorite) ||
          documentItem.folder === activeDocumentFolder
        );

    const searchableText = [
      documentItem.name,
      documentItem.folder,
      documentItem.details,
      ...getDocumentTags(documentItem)
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase();

    const compliance = getDocumentCompliance(documentItem);
    const matchesCompliance = documentComplianceFilter === "all" ||
      compliance.key === documentComplianceFilter ||
      (documentComplianceFilter === "attention" && ["expiring", "expired"].includes(compliance.key));

    const linkedIds = activeDocumentLinkFilter?.type === "task"
      ? getDocumentLinkedTaskIds(documentItem)
      : getDocumentLinkedEventIds(documentItem);
    const matchesLinkedItem = !activeDocumentLinkFilter || linkedIds.includes(activeDocumentLinkFilter.id);

    return matchesFolder && matchesCompliance && matchesLinkedItem && searchableText.includes(normalizedSearch);
  });

  const sortMode = $("documentSort")?.value || "newest";

  return [...filtered].sort((first, second) => {
    if (sortMode === "oldest") {
      return String(first.created_at).localeCompare(String(second.created_at));
    }

    if (sortMode === "name") {
      return String(first.name).localeCompare(String(second.name), undefined, {
        sensitivity: "base"
      });
    }

    if (sortMode === "size") {
      return Number(second.size_bytes || 0) - Number(first.size_bytes || 0);
    }

    if (sortMode === "expirySoon" || sortMode === "expiryLatest") {
      const firstTime = parseDocumentExpiryDate(first.expiry_date)?.getTime();
      const secondTime = parseDocumentExpiryDate(second.expiry_date)?.getTime();
      if (firstTime == null && secondTime == null) return String(first.name).localeCompare(String(second.name));
      if (firstTime == null) return 1;
      if (secondTime == null) return -1;
      return sortMode === "expirySoon" ? firstTime - secondTime : secondTime - firstTime;
    }

    return String(second.created_at).localeCompare(String(first.created_at));
  });
}

function setDocumentUploadStatus(message = "", type = "") {
  const element = $("documentUploadStatus");
  if (!element) return;

  element.textContent = message;
  element.className = `document-upload-status ${type}`.trim();
}

function updateDocumentAccessUI() {
  const ready = Boolean(window.BoxCloud?.isReady());
  const notice = $("documentAuthNotice");
  if (!notice) return;

  notice.classList.toggle("hidden", ready);

  [
    "chooseDocumentFilesButton",
    "documentUploadFolder",
    "documentUploadDetails",
    "documentUploadExpiryDate",
    "documentUploadReminderDays",
    "documentUploadTags",
    "documentComplianceFilter",
    "refreshDocumentsButton",
    "addDocumentFolderButton"
  ].forEach((id) => {
    const element = $(id);
    if (element) element.disabled = !ready || documentsLoading;
  });

  const uploadButton = $("uploadDocumentsButton");
  const selectedFiles = $("documentFiles")?.files?.length || 0;
  if (uploadButton) {
    uploadButton.disabled = !ready || documentsLoading || selectedFiles === 0;
  }
}

function renderDocumentCounts() {
  const activeDocuments = documents.filter((documentItem) => !documentItem.deleted_at);
  const trashedDocuments = documents.filter((documentItem) => documentItem.deleted_at);
  const totalSize = activeDocuments.reduce(
    (sum, documentItem) => sum + Number(documentItem.size_bytes || 0),
    0
  );
  const favorites = activeDocuments.filter((documentItem) => documentItem.is_favorite).length;

  $("documentTotalCount").textContent = activeDocuments.length;
  $("documentFavoriteCount").textContent = favorites;
  $("documentStorageUsed").textContent = formatBytes(totalSize);
  $("documentAllFolderCount").textContent = activeDocuments.length;
  $("documentFavoritesFolderCount").textContent = favorites;
  $("documentTrashFolderCount").textContent = trashedDocuments.length;

  const complianceItems = activeDocuments.map((documentItem) => ({
    documentItem,
    compliance: getDocumentCompliance(documentItem)
  }));
  const tracked = complianceItems.filter((item) => item.compliance.expiry).length;
  const expiring = complianceItems.filter((item) => item.compliance.key === "expiring").length;
  const expired = complianceItems.filter((item) => item.compliance.key === "expired").length;
  $("documentTrackedExpiryCount").textContent = tracked;
  $("documentExpiringCount").textContent = expiring;
  $("documentExpiredCount").textContent = expired;

  const notice = $("documentComplianceNotice");
  const noticeText = $("documentComplianceNoticeText");
  const attention = expiring + expired;
  notice.classList.toggle("hidden", attention === 0 || !window.BoxCloud?.isReady());
  if (attention) {
    const parts = [];
    if (expired) parts.push(`${expired} expired`);
    if (expiring) parts.push(`${expiring} expiring soon`);
    noticeText.textContent = `${parts.join(" and ")} document${attention === 1 ? "" : "s"} need attention.`;
    if (!complianceReminderShown && !documentsLoading) {
      complianceReminderShown = true;
      setTimeout(() => showToast(`${attention} document deadline${attention === 1 ? "" : "s"} need attention`), 250);
    }
  }

  document.querySelectorAll("[data-document-count]").forEach((element) => {
    const folder = element.dataset.documentCount;
    element.textContent = activeDocuments.filter(
      (documentItem) => documentItem.folder === folder
    ).length;
  });
}

function openDocumentFolderModal() {
  if (!window.BoxCloud?.isReady()) {
    openAuthOverlay();
    return;
  }

  $("documentFolderName").value = "";
  $("documentFolderModal").classList.add("open");
  $("documentFolderModal").setAttribute("aria-hidden", "false");
  setTimeout(() => $("documentFolderName").focus(), 40);
}

function closeDocumentFolderModal() {
  $("documentFolderModal").classList.remove("open");
  $("documentFolderModal").setAttribute("aria-hidden", "true");
}

function updateDocumentDetailsCharacterCount() {
  const value = $("documentDetailsInput")?.value || "";
  $("documentDetailsCharacterCount").textContent = value.length;
}

function openDocumentDetailsModal(documentItem) {
  $("documentDetailsId").value = documentItem.id;
  $("documentDetailsFileName").textContent = documentItem.name;
  $("documentDetailsInput").value = documentItem.details || "";
  $("documentDetailsExpiryDate").value = documentItem.expiry_date || "";
  $("documentDetailsReminderDays").value = String(documentItem.reminder_days ?? 30);
  $("documentDetailsTags").value = getDocumentTags(documentItem).join(", ");
  populateDocumentLinkSelectors(documentItem);
  updateDocumentDetailsCharacterCount();
  $("documentDetailsModal").classList.add("open");
  $("documentDetailsModal").setAttribute("aria-hidden", "false");
  setTimeout(() => $("documentDetailsInput").focus(), 40);
}

function closeDocumentDetailsModal() {
  $("documentDetailsModal").classList.remove("open");
  $("documentDetailsModal").setAttribute("aria-hidden", "true");
}

async function openDocumentPreview(documentItem) {
  if (!window.BoxCloud?.isReady()) {
    openAuthOverlay();
    return;
  }

  previewDocumentItem = documentItem;
  previewDocumentSignedUrl = "";
  $("documentPreviewHeading").textContent = documentItem.name;
  $("documentPreviewFileName").textContent = documentItem.name;
  $("documentPreviewType").textContent = getDocumentTypeLabel(documentItem);
  $("documentPreviewFolder").textContent = documentItem.folder || "Personal";
  $("documentPreviewMime").textContent = documentItem.mime_type || "Unknown file type";
  $("documentPreviewSize").textContent = formatBytes(documentItem.size_bytes);
  $("documentPreviewUploaded").textContent = formatDocumentDate(documentItem.created_at);
  const compliance = getDocumentCompliance(documentItem);
  $("documentPreviewExpiry").textContent = formatDocumentExpiryDate(documentItem.expiry_date);
  $("documentPreviewStatus").textContent = compliance.label;
  $("documentPreviewStatus").className = `document-preview-status ${compliance.key}`;
  $("documentPreviewReminder").textContent = documentItem.expiry_date
    ? `${compliance.reminderDays} day${compliance.reminderDays === 1 ? "" : "s"} before`
    : "Not applicable";
  $("documentPreviewVersion").textContent = `Version ${Math.max(1, Number(documentItem.current_version || 1))}`;
  buildDocumentRelatedItems(documentItem, $("documentPreviewRelated"));
  const previewTags = $("documentPreviewTags");
  previewTags.innerHTML = "";
  const tags = getDocumentTags(documentItem);
  if (tags.length) {
    tags.forEach((tag) => {
      const chip = document.createElement("span");
      chip.textContent = tag;
      previewTags.appendChild(chip);
    });
  } else {
    const empty = document.createElement("em");
    empty.textContent = "No tags added.";
    previewTags.appendChild(empty);
  }
  $("documentPreviewDetails").textContent = String(documentItem.details || "").trim() || "No details added.";
  $("documentPreviewStage").innerHTML = '<div class="document-preview-loading">Preparing private preview…</div>';
  $("documentPreviewModal").classList.add("open");
  $("documentPreviewModal").setAttribute("aria-hidden", "false");

  const result = await window.BoxCloud.createDocumentUrl(documentItem.storage_path, 600);
  const signedUrl = result.data?.signedUrl || result.data?.signedURL;

  if (result.error || !signedUrl) {
    $("documentPreviewStage").innerHTML = '<div class="document-preview-empty"><strong>Preview unavailable</strong><span>The private file link could not be created.</span></div>';
    setDocumentUploadStatus(result.error?.message || "Could not preview this document.", "error");
    return;
  }

  previewDocumentSignedUrl = signedUrl;
  const stage = $("documentPreviewStage");
  stage.innerHTML = "";
  const mime = String(documentItem.mime_type || "").toLowerCase();
  const name = String(documentItem.name || "").toLowerCase();
  const isImage = mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(name);
  const isPdf = mime === "application/pdf" || name.endsWith(".pdf");

  if (isImage) {
    const image = document.createElement("img");
    image.className = "document-preview-image";
    image.src = signedUrl;
    image.alt = documentItem.name;
    stage.appendChild(image);
  } else if (isPdf) {
    const frame = document.createElement("iframe");
    frame.className = "document-preview-frame";
    frame.src = signedUrl;
    frame.title = `Preview of ${documentItem.name}`;
    stage.appendChild(frame);
  } else {
    const empty = document.createElement("div");
    empty.className = "document-preview-empty";
    empty.innerHTML = `<strong>${getDocumentTypeLabel(documentItem)} file</strong><span>Built-in preview is available for PDFs and images. Use Open separately or Download for this file.</span>`;
    stage.appendChild(empty);
  }
}

function closeDocumentPreview() {
  $("documentPreviewModal").classList.remove("open");
  $("documentPreviewModal").setAttribute("aria-hidden", "true");
  $("documentPreviewStage").innerHTML = "";
  previewDocumentItem = null;
  previewDocumentSignedUrl = "";
}

function updateVersionDocumentFromCloud(updatedDocument) {
  if (!updatedDocument?.id) return;
  const index = documents.findIndex((item) => String(item.id) === String(updatedDocument.id));
  if (index >= 0) documents[index] = { ...documents[index], ...updatedDocument };
  if (versionDocumentItem && String(versionDocumentItem.id) === String(updatedDocument.id)) {
    versionDocumentItem = documents[index] || updatedDocument;
  }
  if (previewDocumentItem && String(previewDocumentItem.id) === String(updatedDocument.id)) {
    previewDocumentItem = documents[index] || updatedDocument;
  }
}

function openDocumentVersionModal(documentItem) {
  if (!window.BoxCloud?.isReady()) {
    openAuthOverlay();
    return;
  }

  versionDocumentItem = documentItem;
  documentVersions = [];
  $("documentVersionHeading").textContent = "Document versions";
  $("documentVersionFileName").textContent = documentItem.name;
  $("documentVersionFile").value = "";
  $("documentVersionNote").value = "";
  $("documentVersionSelection").textContent = "Choose one replacement file, up to 25 MB.";
  $("uploadDocumentVersionButton").disabled = true;
  $("documentVersionModal").classList.add("open");
  $("documentVersionModal").setAttribute("aria-hidden", "false");
  renderDocumentVersions();
  loadDocumentVersions();
}

function closeDocumentVersionModal() {
  $("documentVersionModal").classList.remove("open");
  $("documentVersionModal").setAttribute("aria-hidden", "true");
  $("documentVersionFile").value = "";
  versionDocumentItem = null;
  documentVersions = [];
  documentVersionsLoading = false;
}

async function loadDocumentVersions() {
  if (!versionDocumentItem || documentVersionsLoading) return;
  documentVersionsLoading = true;
  renderDocumentVersions();
  const result = await window.BoxCloud.listDocumentVersions(versionDocumentItem.id);
  documentVersionsLoading = false;
  if (result.error) {
    setDocumentUploadStatus(result.error.message, "error");
    documentVersions = [];
  } else {
    documentVersions = result.data || [];
  }
  renderDocumentVersions();
}

function renderDocumentVersions() {
  const list = $("documentVersionList");
  if (!list || !versionDocumentItem) return;

  const currentVersion = Math.max(1, Number(versionDocumentItem.current_version || 1));
  $("documentCurrentVersionLabel").textContent = `Version ${currentVersion}`;
  $("documentCurrentVersionMeta").textContent = `${versionDocumentItem.name} · ${formatBytes(versionDocumentItem.size_bytes)} · Updated ${formatDocumentDate(versionDocumentItem.updated_at || versionDocumentItem.created_at)}${versionDocumentItem.current_version_note ? ` · ${versionDocumentItem.current_version_note}` : ""}`;
  list.innerHTML = "";

  if (documentVersionsLoading) {
    const loading = document.createElement("div");
    loading.className = "document-version-loading";
    loading.textContent = "Loading version history…";
    list.appendChild(loading);
    $("emptyDocumentVersions").style.display = "none";
    return;
  }

  documentVersions.forEach((versionItem) => {
    const row = document.createElement("article");
    row.className = "document-version-item";

    const number = document.createElement("div");
    number.className = "document-version-number";
    number.textContent = `v${versionItem.version_number}`;

    const content = document.createElement("div");
    content.className = "document-version-content";
    const title = document.createElement("strong");
    title.textContent = versionItem.name;
    const meta = document.createElement("span");
    meta.textContent = `${formatBytes(versionItem.size_bytes)} · ${formatDocumentDate(versionItem.created_at)}`;
    content.append(title, meta);
    if (versionItem.notes) {
      const note = document.createElement("p");
      note.textContent = versionItem.notes;
      content.appendChild(note);
    }

    const actions = document.createElement("div");
    actions.className = "document-version-actions";

    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.textContent = "Open";
    openButton.addEventListener("click", async () => {
      openButton.disabled = true;
      const result = await window.BoxCloud.createDocumentUrl(versionItem.storage_path, 600);
      openButton.disabled = false;
      const signedUrl = result.data?.signedUrl || result.data?.signedURL;
      if (signedUrl) window.open(signedUrl, "_blank", "noopener");
      else setDocumentUploadStatus(result.error?.message || "Could not open this version.", "error");
    });

    const downloadButton = document.createElement("button");
    downloadButton.type = "button";
    downloadButton.textContent = "Download";
    downloadButton.addEventListener("click", () => downloadStoredDocument({
      storage_path: versionItem.storage_path,
      name: versionItem.name
    }, downloadButton));

    const restoreButton = document.createElement("button");
    restoreButton.type = "button";
    restoreButton.className = "document-version-restore";
    restoreButton.textContent = "Restore as latest";
    restoreButton.addEventListener("click", async () => {
      const confirmed = window.confirm(`Restore version ${versionItem.version_number} as the newest version of “${versionDocumentItem.name}”? The current file will be preserved in history.`);
      if (!confirmed) return;
      restoreButton.disabled = true;
      restoreButton.textContent = "Restoring…";
      const result = await window.BoxCloud.restoreDocumentVersion(versionDocumentItem, versionItem);
      restoreButton.disabled = false;
      restoreButton.textContent = "Restore as latest";
      if (result.error) {
        setDocumentUploadStatus(result.error.message, "error");
        return;
      }
      updateVersionDocumentFromCloud(result.data.document);
      setDocumentUploadStatus("Previous version restored as the latest file.", "success");
      showToast("Version restored");
      await loadDocumentVersions();
      renderTasks();
      renderEvents();
      renderDocuments();
    });

    actions.append(openButton, downloadButton, restoreButton);
    row.append(number, content, actions);
    list.appendChild(row);
  });

  $("emptyDocumentVersions").style.display = documentVersions.length ? "none" : "block";
}

async function uploadNewDocumentVersion() {
  const file = $("documentVersionFile").files?.[0];
  if (!versionDocumentItem || !file) return;
  if (file.size > 25 * 1024 * 1024) {
    setDocumentUploadStatus(`${file.name} is larger than the 25 MB limit.`, "error");
    return;
  }

  const button = $("uploadDocumentVersionButton");
  button.disabled = true;
  button.textContent = "Uploading…";
  const result = await window.BoxCloud.createDocumentVersion(
    versionDocumentItem,
    file,
    $("documentVersionNote").value.trim()
  );
  button.textContent = "Upload new version";

  if (result.error) {
    button.disabled = false;
    setDocumentUploadStatus(result.error.message, "error");
    return;
  }

  updateVersionDocumentFromCloud(result.data.document);
  $("documentVersionFile").value = "";
  $("documentVersionNote").value = "";
  $("documentVersionSelection").textContent = "Choose one replacement file, up to 25 MB.";
  button.disabled = true;
  $("documentVersionFileName").textContent = versionDocumentItem.name;
  setDocumentUploadStatus("New document version uploaded.", "success");
  showToast("New version uploaded");
  await loadDocumentVersions();
  renderTasks();
  renderEvents();
  renderDocuments();
}

async function downloadStoredDocument(documentItem, button) {
  button.disabled = true;
  const previousText = button.textContent;
  button.textContent = "Loading…";

  const result = await window.BoxCloud.downloadDocument(documentItem.storage_path);

  button.disabled = false;
  button.textContent = previousText;

  if (result.error || !result.data) {
    setDocumentUploadStatus(
      result.error?.message || "Could not download this document.",
      "error"
    );
    return;
  }

  const objectUrl = URL.createObjectURL(result.data);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = documentItem.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
}

async function toggleDocumentFavorite(documentItem, button) {
  button.disabled = true;
  const nextValue = !documentItem.is_favorite;
  const result = await window.BoxCloud.setDocumentFavorite(
    documentItem.id,
    nextValue
  );
  button.disabled = false;

  if (result.error) {
    setDocumentUploadStatus(result.error.message, "error");
    return;
  }

  documentItem.is_favorite = nextValue;
  documentItem.updated_at = result.data?.updated_at || new Date().toISOString();
  renderDocuments();
  showToast(nextValue ? "Added to favorites" : "Removed from favorites");
}

async function moveStoredDocumentToTrash(documentItem, button) {
  const confirmed = window.confirm(`Move “${documentItem.name}” to the Recycle Bin?`);
  if (!confirmed) return;

  button.disabled = true;
  const result = await window.BoxCloud.moveDocumentToTrash(documentItem.id);
  button.disabled = false;

  if (result.error) {
    setDocumentUploadStatus(result.error.message, "error");
    return;
  }

  documentItem.deleted_at = result.data?.deleted_at || new Date().toISOString();
  documentItem.updated_at = result.data?.updated_at || documentItem.deleted_at;
  renderTasks();
  renderEvents();
  renderDocuments();
  showToast("Moved to Recycle Bin");
}

async function restoreStoredDocument(documentItem, button) {
  button.disabled = true;
  const result = await window.BoxCloud.restoreDocument(documentItem.id);
  button.disabled = false;

  if (result.error) {
    setDocumentUploadStatus(result.error.message, "error");
    return;
  }

  documentItem.deleted_at = null;
  documentItem.updated_at = result.data?.updated_at || new Date().toISOString();
  renderTasks();
  renderEvents();
  renderDocuments();
  showToast("Document restored");
}

async function permanentlyDeleteStoredDocument(documentItem, button) {
  const confirmed = window.confirm(`Permanently delete “${documentItem.name}”? This cannot be undone.`);
  if (!confirmed) return;

  button.disabled = true;
  const result = await window.BoxCloud.permanentlyDeleteDocument(
    documentItem.id,
    documentItem.storage_path
  );

  if (result.error) {
    button.disabled = false;
    setDocumentUploadStatus(result.error.message, "error");
    return;
  }

  documents = documents.filter((item) => item.id !== documentItem.id);
  renderTasks();
  renderEvents();
  renderDocuments();
  showToast("Document permanently deleted");
}

function buildDocumentCard(documentItem) {
  const card = document.createElement("article");
  const isDeleted = Boolean(documentItem.deleted_at);
  card.className = `document-card ${isDeleted ? "document-card-trashed" : ""}`.trim();
  card.addEventListener("dblclick", () => openDocumentPreview(documentItem));

  const top = document.createElement("div");
  top.className = "document-card-top";

  const icon = document.createElement("div");
  icon.className = "document-type-icon";
  icon.textContent = getDocumentTypeLabel(documentItem);

  const titleBlock = document.createElement("div");
  titleBlock.className = "document-card-title";

  const title = document.createElement("strong");
  title.textContent = documentItem.name;
  title.title = documentItem.name;

  const date = document.createElement("span");
  date.textContent = isDeleted
    ? `Deleted ${formatDocumentDate(documentItem.deleted_at)}`
    : `Uploaded ${formatDocumentDate(documentItem.created_at)}`;

  titleBlock.append(title, date);

  const favoriteButton = document.createElement("button");
  favoriteButton.type = "button";
  favoriteButton.className = `document-favorite-button ${documentItem.is_favorite ? "active" : ""}`;
  favoriteButton.textContent = documentItem.is_favorite ? "★" : "☆";
  favoriteButton.title = documentItem.is_favorite ? "Remove from favorites" : "Add to favorites";
  favoriteButton.disabled = isDeleted;
  favoriteButton.addEventListener("click", () => toggleDocumentFavorite(documentItem, favoriteButton));

  top.append(icon, titleBlock, favoriteButton);

  const meta = document.createElement("div");
  meta.className = "document-card-meta";
  [documentItem.folder || "Personal", getDocumentTypeLabel(documentItem), formatBytes(documentItem.size_bytes)].forEach((value) => {
    const chip = document.createElement("span");
    chip.className = "document-chip";
    chip.textContent = value;
    meta.appendChild(chip);
  });

  const compliance = getDocumentCompliance(documentItem);
  const statusChip = document.createElement("span");
  statusChip.className = `document-compliance-badge ${compliance.key}`;
  statusChip.textContent = compliance.label;
  meta.appendChild(statusChip);

  if (documentItem.expiry_date) {
    const expiryChip = document.createElement("span");
    expiryChip.className = "document-chip document-expiry-chip";
    expiryChip.textContent = formatDocumentExpiryDate(documentItem.expiry_date);
    meta.appendChild(expiryChip);
  }

  const versionChip = document.createElement("span");
  versionChip.className = "document-chip document-version-chip";
  versionChip.textContent = `v${Math.max(1, Number(documentItem.current_version || 1))}`;
  meta.appendChild(versionChip);

  const linkedTaskIdSet = new Set(getDocumentLinkedTaskIds(documentItem));
  const linkedEventIdSet = new Set(getDocumentLinkedEventIds(documentItem));
  const taskLinkCount = tasks.filter((task) => linkedTaskIdSet.has(String(task.id))).length;
  const eventLinkCount = events.filter((eventItem) => linkedEventIdSet.has(String(eventItem.id))).length;
  if (taskLinkCount) {
    const chip = document.createElement("span");
    chip.className = "document-chip document-link-chip";
    chip.textContent = `${taskLinkCount} task${taskLinkCount === 1 ? "" : "s"}`;
    meta.appendChild(chip);
  }
  if (eventLinkCount) {
    const chip = document.createElement("span");
    chip.className = "document-chip document-link-chip";
    chip.textContent = `${eventLinkCount} event${eventLinkCount === 1 ? "" : "s"}`;
    meta.appendChild(chip);
  }

  const tags = getDocumentTags(documentItem);
  let tagsBlock = null;
  if (tags.length) {
    tagsBlock = document.createElement("div");
    tagsBlock.className = "document-card-tags";
    tags.forEach((tag) => {
      const tagChip = document.createElement("span");
      tagChip.textContent = tag;
      tagsBlock.appendChild(tagChip);
    });
  }

  const details = String(documentItem.details || "").trim();
  let detailsBlock = null;
  if (details) {
    detailsBlock = document.createElement("p");
    detailsBlock.className = "document-card-details";
    detailsBlock.textContent = details;
    detailsBlock.title = details;
  }

  const actions = document.createElement("div");
  actions.className = "document-card-actions";

  if (isDeleted) {
    const restoreButton = document.createElement("button");
    restoreButton.type = "button";
    restoreButton.textContent = "Restore";
    restoreButton.addEventListener("click", () => restoreStoredDocument(documentItem, restoreButton));

    const deleteForeverButton = document.createElement("button");
    deleteForeverButton.type = "button";
    deleteForeverButton.className = "document-delete-forever-button";
    deleteForeverButton.textContent = "Delete forever";
    deleteForeverButton.addEventListener("click", () => permanentlyDeleteStoredDocument(documentItem, deleteForeverButton));

    actions.append(restoreButton, deleteForeverButton);
  } else {
    const previewButton = document.createElement("button");
    previewButton.type = "button";
    previewButton.textContent = "Preview";
    previewButton.addEventListener("click", () => openDocumentPreview(documentItem));

    const downloadButton = document.createElement("button");
    downloadButton.type = "button";
    downloadButton.textContent = "Download";
    downloadButton.addEventListener("click", () => downloadStoredDocument(documentItem, downloadButton));

    const versionButton = document.createElement("button");
    versionButton.type = "button";
    versionButton.textContent = `Versions · ${Math.max(1, Number(documentItem.current_version || 1))}`;
    versionButton.addEventListener("click", () => openDocumentVersionModal(documentItem));

    const detailsButton = document.createElement("button");
    detailsButton.type = "button";
    detailsButton.textContent = "Edit info";
    detailsButton.addEventListener("click", () => openDocumentDetailsModal(documentItem));

    const trashButton = document.createElement("button");
    trashButton.type = "button";
    trashButton.className = "document-delete-button";
    trashButton.textContent = "♲";
    trashButton.title = "Move to Recycle Bin";
    trashButton.setAttribute("aria-label", `Move ${documentItem.name} to Recycle Bin`);
    trashButton.addEventListener("click", () => moveStoredDocumentToTrash(documentItem, trashButton));

    actions.append(previewButton, downloadButton, versionButton, detailsButton, trashButton);
  }

  card.append(top, meta);
  if (tagsBlock) card.appendChild(tagsBlock);
  if (detailsBlock) card.appendChild(detailsBlock);
  card.appendChild(actions);
  return card;
}

function renderDocuments() {
  const list = $("documentList");
  if (!list) return;

  renderDocumentFolderControls();
  updateDocumentAccessUI();
  renderDocumentCounts();
  renderDocumentLinkFilterBanner();

  document.querySelectorAll(".document-folder").forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.documentFolder === activeDocumentFolder
    );
  });

  const folderTitle =
    activeDocumentFolder === "all"
      ? "All files"
      : activeDocumentFolder === "favorites"
        ? "Favorites"
        : activeDocumentFolder === "trash"
          ? "Recycle Bin"
          : activeDocumentFolder;

  $("documentFolderTitle").textContent = folderTitle;
  $("documentFolderEyebrow").textContent = folderTitle.toUpperCase();

  list.innerHTML = "";
  list.classList.toggle("document-list-view", documentViewMode === "list");
  $("documentGridViewButton").classList.toggle("active", documentViewMode === "grid");
  $("documentListViewButton").classList.toggle("active", documentViewMode === "list");

  if (documentsLoading) {
    const loading = document.createElement("div");
    loading.className = "document-loading";
    loading.textContent = "Loading your private documents…";
    list.appendChild(loading);
    $("emptyDocuments").style.display = "none";
    $("documentResultCount").textContent = "Loading";
    return;
  }

  if (!window.BoxCloud?.isReady()) {
    $("emptyDocuments").textContent = "Sign in to view and upload private documents.";
    $("emptyDocuments").style.display = "block";
    $("documentResultCount").textContent = "0 documents";
    return;
  }

  const visibleDocuments = getVisibleDocuments();
  visibleDocuments.forEach((documentItem) => {
    list.appendChild(buildDocumentCard(documentItem));
  });

  $("emptyDocuments").textContent = activeDocumentFolder === "trash"
    ? "The Recycle Bin is empty."
    : "No documents found in this view.";
  $("emptyDocuments").style.display = visibleDocuments.length ? "none" : "block";
  $("documentResultCount").textContent =
    `${visibleDocuments.length} document${visibleDocuments.length === 1 ? "" : "s"}`;
}

async function loadDocuments({ silent = false } = {}) {
  if (!window.BoxCloud?.isReady() || documentsLoading) {
    renderDocuments();
    return;
  }

  documentsLoading = true;
  if (!silent) setDocumentUploadStatus("Loading documents and folders…");
  renderDocuments();

  const [documentResult, folderResult] = await Promise.all([
    window.BoxCloud.listDocuments(),
    window.BoxCloud.listDocumentFolders()
  ]);
  documentsLoading = false;

  const firstError = documentResult.error || folderResult.error;
  if (firstError) {
    documents = [];
    documentFolders = [];
    setDocumentUploadStatus(
      `Document Vault unavailable: ${firstError.message}. Run the Phase 6B.3 Supabase migration SQL before using document links and version history.`,
      "error"
    );
    renderTasks();
    renderEvents();
    renderDocuments();
    return;
  }

  documents = documentResult.data || [];
  documentFolders = folderResult.data || [];
  if (!silent) setDocumentUploadStatus("Vault is up to date.", "success");
  renderTasks();
  renderEvents();
  renderDocuments();
}

async function uploadSelectedDocuments() {
  const input = $("documentFiles");
  const files = Array.from(input.files || []);

  if (!window.BoxCloud?.isReady()) {
    openAuthOverlay();
    return;
  }

  if (!files.length) {
    input.click();
    return;
  }

  const oversizedFile = files.find((file) => file.size > 25 * 1024 * 1024);
  if (oversizedFile) {
    setDocumentUploadStatus(
      `${oversizedFile.name} is larger than the 25 MB limit.`,
      "error"
    );
    return;
  }

  const folder = $("documentUploadFolder").value;
  const details = $("documentUploadDetails").value.trim();
  const compliance = {
    expiryDate: $("documentUploadExpiryDate").value,
    reminderDays: Number($("documentUploadReminderDays").value || 30),
    tags: normalizeDocumentTagInput($("documentUploadTags").value)
  };
  const uploadButton = $("uploadDocumentsButton");
  uploadButton.disabled = true;
  $("chooseDocumentFilesButton").disabled = true;

  let uploaded = 0;

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    setDocumentUploadStatus(
      `Uploading ${index + 1} of ${files.length}: ${file.name}`
    );

    const result = await window.BoxCloud.uploadDocument(file, folder, details, compliance);

    if (result.error) {
      setDocumentUploadStatus(
        `Upload stopped at ${file.name}: ${result.error.message}`,
        "error"
      );
      break;
    }

    documents.unshift(result.data);
    uploaded += 1;
  }

  input.value = "";
  $("documentUploadDetails").value = "";
  $("documentUploadExpiryDate").value = "";
  $("documentUploadReminderDays").value = "30";
  $("documentUploadTags").value = "";
  $("documentFileSelection").textContent =
    "Choose one or more files, up to 25 MB each.";
  $("chooseDocumentFilesButton").disabled = false;
  updateDocumentAccessUI();
  renderDocuments();

  if (uploaded) {
    setDocumentUploadStatus(
      `${uploaded} file${uploaded === 1 ? "" : "s"} uploaded to ${folder}.`,
      "success"
    );
    showToast(`${uploaded} document${uploaded === 1 ? "" : "s"} uploaded`);
  }
}


const BACKUP_FORMAT = "the-box-os-backup";
const BACKUP_FORMAT_VERSION = 1;
const BACKUP_APP_VERSION = "6B.4";
const MAX_BACKUP_IMPORT_SIZE = 12 * 1024 * 1024;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function cleanFileNameSegment(value) {
  return String(value || "backup")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "backup";
}

function downloadTextFile(fileName, text, type = "application/json") {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function sha256Text(text) {
  if (!window.crypto?.subtle || typeof TextEncoder === "undefined") return null;
  const bytes = new TextEncoder().encode(text);
  const digest = await window.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function buildLocalBackupData() {
  return {
    tasks: tasks.map((task) => ({ ...task })),
    events: events.map((event) => ({ ...event })),
    financeEntries: financeEntries.map((entry) => ({ ...entry })),
    notes: $("quickNotes")?.value ?? localStorage.getItem(STORAGE.notes) ?? "",
    preferences: {
      theme: localStorage.getItem(STORAGE.theme) || "dark",
      timerMinutes: Number(localStorage.getItem(STORAGE.timerMinutes) || 25),
      focusTotal: Number(localStorage.getItem(STORAGE.focusTotal) || 0),
      windowLayouts: readWindowLayouts(),
      documentView: localStorage.getItem(STORAGE.documentView) || "grid"
    }
  };
}

async function createBackupPackage({ includeCloudInventory = true } = {}) {
  let cloudInventory = null;
  let cloudInventoryError = null;

  if (includeCloudInventory && window.BoxCloud?.isReady()) {
    const result = await window.BoxCloud.createBackupSnapshot();
    if (result.error) {
      cloudInventoryError = result.error.message || "Cloud inventory could not be loaded.";
    } else {
      cloudInventory = result.data;
    }
  }

  const packageWithoutIntegrity = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    appVersion: BACKUP_APP_VERSION,
    createdAt: new Date().toISOString(),
    source: {
      host: window.location.host || "local",
      cloudConnected: Boolean(window.BoxCloud?.isReady()),
      cloudInventoryRequested: Boolean(includeCloudInventory),
      cloudInventoryIncluded: Boolean(cloudInventory),
      cloudInventoryError
    },
    data: {
      ...buildLocalBackupData(),
      documentInventory: cloudInventory
    }
  };

  const payloadText = JSON.stringify(packageWithoutIntegrity);
  const checksum = await sha256Text(payloadText);

  return {
    ...packageWithoutIntegrity,
    integrity: checksum
      ? { algorithm: "SHA-256", value: checksum }
      : null
  };
}

function formatBackupTime(value) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function setBackupStatus(message, state = "neutral") {
  const notice = $("backupStatusNotice");
  if (!notice) return;
  notice.textContent = message;
  notice.className = `backup-status-notice ${state}`;
}

function updateBackupCloudControls() {
  const connected = Boolean(window.BoxCloud?.isReady());
  const includeCloud = $("backupIncludeCloudInventory");
  const restoreCloud = $("restoreBackupCloudSync");
  const badge = $("backupCloudBadge");

  if (includeCloud) {
    includeCloud.disabled = !connected;
    if (!connected) includeCloud.checked = false;
  }
  if (restoreCloud) {
    restoreCloud.disabled = !connected;
    if (!connected) restoreCloud.checked = false;
  }

  if ($("backupCloudInventoryHint")) {
    $("backupCloudInventoryHint").textContent = connected
      ? "Includes folders, metadata, links, expiry data, and version records."
      : "Sign in to include folders, metadata, and version records.";
  }
  if ($("restoreCloudSyncHint")) {
    $("restoreCloudSyncHint").textContent = connected
      ? "Restored tasks, events, finance entries, and notes will be synced."
      : "Sign in to enable cloud sync after restore.";
  }
  if (badge) {
    badge.textContent = connected ? "Cloud connected" : "Local backup";
    badge.className = `backup-cloud-badge ${connected ? "connected" : "local"}`;
  }
}

function renderBackupCenter() {
  if (!$("backupTaskCount")) return;

  $("backupTaskCount").textContent = String(tasks.length);
  $("backupEventCount").textContent = String(events.length);
  $("backupDocumentCount").textContent = String(documents.filter((item) => !item.deleted_at).length);
  $("backupLastExport").textContent = formatBackupTime(localStorage.getItem(STORAGE.lastBackupAt));

  const safetyText = localStorage.getItem(STORAGE.safetyBackup);
  $("downloadSafetyBackupButton").disabled = !safetyText;
  updateBackupCloudControls();
}

async function downloadWorkspaceBackup() {
  if (backupBusy) return;
  backupBusy = true;
  const button = $("downloadBackupButton");
  button.disabled = true;
  button.textContent = "Preparing…";
  setBackupStatus("Preparing your workspace backup…", "working");

  try {
    const backup = await createBackupPackage({
      includeCloudInventory: $("backupIncludeCloudInventory").checked
    });
    const formatted = JSON.stringify(backup, null, 2);
    const date = new Date();
    const stamp = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
      String(date.getHours()).padStart(2, "0") + String(date.getMinutes()).padStart(2, "0")
    ].join("-");

    downloadTextFile(`the-box-backup-${cleanFileNameSegment(stamp)}.json`, formatted);
    localStorage.setItem(STORAGE.lastBackupAt, backup.createdAt);
    renderBackupCenter();

    const cloudNote = backup.data.documentInventory
      ? ` Cloud inventory: ${backup.data.documentInventory.documents.length} document records.`
      : backup.source.cloudInventoryError
        ? ` Local data exported; cloud inventory was unavailable: ${backup.source.cloudInventoryError}`
        : " Local workspace data exported.";

    setBackupStatus(`Backup downloaded successfully.${cloudNote}`, "success");
    showToast("Backup downloaded");
  } catch (error) {
    console.error(error);
    setBackupStatus(error.message || "Backup could not be created.", "error");
  } finally {
    backupBusy = false;
    button.disabled = false;
    button.textContent = "Download backup";
  }
}

function validateBackupShape(backup) {
  if (!backup || typeof backup !== "object") {
    throw new Error("This file does not contain a valid backup object.");
  }
  if (backup.format !== BACKUP_FORMAT) {
    throw new Error("This is not a The Box OS backup file.");
  }
  if (Number(backup.formatVersion) !== BACKUP_FORMAT_VERSION) {
    throw new Error(`Backup format ${backup.formatVersion} is not supported by this app version.`);
  }
  if (!backup.data || typeof backup.data !== "object") {
    throw new Error("The backup data section is missing.");
  }

  const arrayFields = ["tasks", "events", "financeEntries"];
  arrayFields.forEach((field) => {
    if (!Array.isArray(backup.data[field])) {
      throw new Error(`The backup is missing a valid ${field} list.`);
    }
  });
  if (typeof backup.data.notes !== "string") {
    throw new Error("The backup notes field is invalid.");
  }
  return backup;
}

async function verifyBackupIntegrity(backup) {
  if (!backup.integrity?.value) return { verified: false, reason: "No checksum" };
  if (backup.integrity.algorithm !== "SHA-256") {
    return { verified: false, reason: "Unsupported checksum" };
  }

  const { integrity, ...payload } = backup;
  const calculated = await sha256Text(JSON.stringify(payload));
  if (!calculated) return { verified: false, reason: "Checksum unavailable" };
  if (calculated !== integrity.value) {
    throw new Error("Backup integrity check failed. The file may be incomplete or modified.");
  }
  return { verified: true, reason: "Checksum verified" };
}

function renderBackupImportPreview(backup, integrityResult) {
  const preview = $("backupImportPreview");
  const inventory = backup.data.documentInventory;
  const created = formatBackupTime(backup.createdAt);
  const integrityLabel = integrityResult.verified ? "Verified" : integrityResult.reason;

  preview.className = "backup-import-preview ready";
  preview.innerHTML = `
    <strong>Backup ready</strong>
    <span>${created} · App ${escapeHtml(backup.appVersion || "Unknown")}</span>
    <div class="backup-preview-counts">
      <small>${backup.data.tasks.length} tasks</small>
      <small>${backup.data.events.length} events</small>
      <small>${backup.data.financeEntries.length} finance entries</small>
      <small>${inventory?.documents?.length || 0} document records</small>
    </div>
    <em>${escapeHtml(integrityLabel)}</em>
  `;
}

async function loadBackupImportFile(file) {
  pendingBackupImport = null;
  $("restoreBackupButton").disabled = true;

  if (!(file instanceof File)) return;
  if (file.size > MAX_BACKUP_IMPORT_SIZE) {
    setBackupStatus("The selected backup is larger than 12 MB.", "error");
    return;
  }

  setBackupStatus("Reading and validating the backup…", "working");
  try {
    const parsed = validateBackupShape(JSON.parse(await file.text()));
    const integrityResult = await verifyBackupIntegrity(parsed);
    pendingBackupImport = parsed;
    renderBackupImportPreview(parsed, integrityResult);
    $("restoreBackupButton").disabled = false;
    setBackupStatus("Backup validated. Choose what to restore.", "success");
  } catch (error) {
    console.error(error);
    $("backupImportPreview").className = "backup-import-preview error";
    $("backupImportPreview").innerHTML = `<strong>Backup not accepted</strong><span>${escapeHtml(error.message)}</span>`;
    setBackupStatus(error.message || "The backup could not be read.", "error");
  }
}

function normalizeBackupEvents(value) {
  return value.map((event, index) => ({
    id: event.id || Date.now() + index + Math.random(),
    title: String(event.title || "Untitled event").slice(0, 300),
    date: /^\d{4}-\d{2}-\d{2}$/.test(event.date || "")
      ? event.date
      : new Date().toISOString().slice(0, 10),
    workspace: event.workspace || "personal"
  }));
}

function normalizeBackupFinance(value) {
  return value.map((entry, index) => ({
    id: entry.id || Date.now() + index + Math.random(),
    description: String(entry.description || "Untitled entry").slice(0, 300),
    amount: Number(entry.amount) || 0,
    type: entry.type === "income" ? "income" : "expense",
    workspace: entry.workspace || "personal",
    createdAt: entry.createdAt || new Date().toISOString()
  }));
}

function restoreBackupPreferences(preferences = {}) {
  const theme = preferences.theme === "light" ? "light" : "dark";
  localStorage.setItem(STORAGE.theme, theme);

  const minutes = Math.min(180, Math.max(1, Number(preferences.timerMinutes) || 25));
  localStorage.setItem(STORAGE.timerMinutes, String(minutes));
  selectedTimerMinutes = minutes;
  timerSeconds = minutes * 60;

  const focusTotal = Math.max(0, Number(preferences.focusTotal) || 0);
  localStorage.setItem(STORAGE.focusTotal, String(focusTotal));

  if (preferences.windowLayouts && typeof preferences.windowLayouts === "object" && !Array.isArray(preferences.windowLayouts)) {
    localStorage.setItem(STORAGE.windowLayouts, JSON.stringify(preferences.windowLayouts));
  }

  const view = preferences.documentView === "list" ? "list" : "grid";
  localStorage.setItem(STORAGE.documentView, view);
  documentViewMode = view;

  document.body.classList.toggle("light-theme", theme === "light");
  $("themeButton").textContent = theme === "light" ? "☀" : "☾";
  updateTimerDisplay();
}

async function restoreSelectedBackup() {
  if (!pendingBackupImport || backupBusy) return;

  const selected = {
    tasks: $("restoreBackupTasks").checked,
    events: $("restoreBackupEvents").checked,
    finance: $("restoreBackupFinance").checked,
    notes: $("restoreBackupNotes").checked,
    preferences: $("restoreBackupPreferences").checked
  };

  if (!Object.values(selected).some(Boolean)) {
    setBackupStatus("Select at least one data category to restore.", "error");
    return;
  }

  const shouldSync = $("restoreBackupCloudSync").checked && window.BoxCloud?.isReady();
  const warning = shouldSync
    ? "This will replace the selected local data and then sync the restored workspace to Supabase. Continue?"
    : "This will replace the selected local data on this device. Continue?";
  if (!window.confirm(warning)) return;

  backupBusy = true;
  const button = $("restoreBackupButton");
  button.disabled = true;
  button.textContent = "Restoring…";
  setBackupStatus("Creating a safety copy of the current workspace…", "working");

  try {
    const safetyBackup = await createBackupPackage({ includeCloudInventory: false });
    localStorage.setItem(STORAGE.safetyBackup, JSON.stringify(safetyBackup, null, 2));

    const data = pendingBackupImport.data;
    if (selected.tasks) {
      tasks = data.tasks.map(normalizeTask);
      localStorage.setItem(STORAGE.tasks, JSON.stringify(tasks));
    }
    if (selected.events) {
      events = normalizeBackupEvents(data.events);
      localStorage.setItem(STORAGE.events, JSON.stringify(events));
    }
    if (selected.finance) {
      financeEntries = normalizeBackupFinance(data.financeEntries);
      localStorage.setItem(STORAGE.finance, JSON.stringify(financeEntries));
    }
    if (selected.notes) {
      const notes = String(data.notes || "").slice(0, 1000000);
      localStorage.setItem(STORAGE.notes, notes);
      $("quickNotes").value = notes;
      $("noteStatus").textContent = "Saved";
    }
    if (selected.preferences) {
      restoreBackupPreferences(data.preferences || {});
    }

    renderAll();

    if (shouldSync) {
      setBackupStatus("Local restore complete. Syncing restored data to cloud…", "working");
      const syncResult = await window.BoxCloud.syncNow();
      if (syncResult.error) throw syncResult.error;
    }

    renderBackupCenter();
    setBackupStatus(
      shouldSync
        ? "Restore complete and synced. A safety backup of the previous local data is available."
        : "Restore complete. A safety backup of the previous local data is available.",
      "success"
    );
    showToast("Backup restored");
  } catch (error) {
    console.error(error);
    setBackupStatus(error.message || "Restore failed.", "error");
  } finally {
    backupBusy = false;
    button.disabled = !pendingBackupImport;
    button.textContent = "Restore selected data";
  }
}

function downloadSafetyBackup() {
  const safetyText = localStorage.getItem(STORAGE.safetyBackup);
  if (!safetyText) {
    setBackupStatus("No safety backup is available yet.", "error");
    return;
  }
  downloadTextFile(`the-box-safety-backup-${Date.now()}.json`, safetyText);
  setBackupStatus("Safety backup downloaded.", "success");
}

function resetSavedWindowLayouts() {
  if (!window.confirm("Reset all saved window sizes and positions? Your data will not be deleted.")) return;
  localStorage.removeItem(STORAGE.windowLayouts);
  setBackupStatus("Window layouts reset. Reloading the app…", "success");
  setTimeout(() => window.location.reload(), 500);
}

async function refreshAppFiles() {
  const button = $("refreshAppFilesButton");
  button.disabled = true;
  button.textContent = "Checking…";
  setBackupStatus("Checking the service worker for updated app files…", "working");

  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.update()));
    }
    setBackupStatus("Update check complete. Reloading the app…", "success");
    setTimeout(() => window.location.reload(), 700);
  } catch (error) {
    console.error(error);
    setBackupStatus(error.message || "The app update check failed.", "error");
    button.disabled = false;
    button.textContent = "Check for app update";
  }
}

function renderAll() {
  renderTasks();
  renderDashboard();
  renderCalendar();
  renderEvents();
  renderFinance();
  renderDocuments();
  renderBackupCenter();
}

async function loadWeather() {
  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${DAVAO.latitude}` +
    `&longitude=${DAVAO.longitude}` +
    "&current=temperature_2m,weather_code" +
    "&timezone=Asia%2FManila";

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Weather error: ${response.status}`);

    const data = await response.json();
    const current = data.current;
    const weather = WEATHER_CODES[current.weather_code] || ["Weather", "☁"];

    $("dashboardWeather").textContent = `${Math.round(current.temperature_2m)}°`;
    $("dashboardWeatherText").textContent = weather[0];
  } catch (error) {
    console.error(error);
    $("dashboardWeatherText").textContent = "Unavailable";
  }
}

function restoreTheme() {
  if (localStorage.getItem(STORAGE.theme) === "light") {
    document.body.classList.add("light-theme");
  }
  $("themeButton").textContent =
    document.body.classList.contains("light-theme") ? "☀" : "☾";
}

function setTimer(minutes) {
  clearInterval(timerInterval);
  timerInterval = null;
  timerRunning = false;
  selectedTimerMinutes = minutes;
  timerSeconds = minutes * 60;
  localStorage.setItem(STORAGE.timerMinutes, String(minutes));
  $("timerStartButton").textContent = "Start";
  $("timerStatus").textContent = "Ready when you are.";
  updateTimerDisplay();
}

function updateTimerDisplay() {
  const minutes = Math.floor(timerSeconds / 60);
  const seconds = timerSeconds % 60;
  $("timerDisplay").textContent =
    `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function toggleTimer() {
  if (timerRunning) {
    clearInterval(timerInterval);
    timerInterval = null;
    timerRunning = false;
    $("timerStartButton").textContent = "Resume";
    $("timerStatus").textContent = "Paused.";
    return;
  }

  timerRunning = true;
  $("timerStartButton").textContent = "Pause";
  $("timerStatus").textContent = "Focus session in progress.";

  timerInterval = setInterval(() => {
    timerSeconds -= 1;
    updateTimerDisplay();

    if (timerSeconds <= 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      timerRunning = false;
      $("timerStartButton").textContent = "Start";
      $("timerStatus").textContent = "Session complete.";

      if (selectedTimerMinutes >= 20) {
        const total =
          Number(localStorage.getItem(STORAGE.focusTotal) || 0) +
          selectedTimerMinutes;
        localStorage.setItem(STORAGE.focusTotal, String(total));
      }

      timerSeconds = selectedTimerMinutes * 60;
      updateTimerDisplay();
      renderDashboard();
      showToast("Focus session complete");
    }
  }, 1000);
}

function runAssistant(action) {
  const response = $("assistantResponse");
  const open = tasks.filter((task) => !task.completed);
  const urgent = open.filter((task) => task.priority === "urgent");

  if (action === "summary") {
    const nextEvent = getUpcomingEvents()[0];
    response.textContent =
      `You have ${open.length} open task${open.length === 1 ? "" : "s"}, ` +
      `${urgent.length} urgent, and ${tasks.filter((task) => task.completed).length} completed.\n\n` +
      `Next event: ${nextEvent ? `${nextEvent.title} on ${nextEvent.date}` : "Nothing scheduled."}`;
  }

  if (action === "urgent") {
    response.textContent = urgent.length
      ? `Urgent tasks:\n${urgent.map((task) => `• ${task.text} — ${task.workspace}`).join("\n")}`
      : "You have no urgent open tasks.";
  }

  if (action === "workspace") {
    const lines = ["pharmacy", "clinic", "sk", "personal"].map((workspace) => {
      const workspaceOpen = open.filter((task) => task.workspace === workspace).length;
      return `• ${workspace}: ${workspaceOpen} open`;
    });

    response.textContent = `Workspace overview:\n${lines.join("\n")}`;
  }

  if (action === "notes") {
    const lines = $("quickNotes").value
      .split("\n")
      .map((line) => line.replace(/^[-•*]\s*/, "").trim())
      .filter((line) => line.length >= 4)
      .slice(0, 8);

    if (!lines.length) {
      response.textContent = "Write one possible task per line in Notes, then try again.";
      return;
    }

    let added = 0;

    lines.forEach((line) => {
      const duplicate = tasks.some(
        (task) => task.text.toLowerCase() === line.toLowerCase()
      );

      if (!duplicate) {
        const timestamp = new Date().toISOString();
        tasks.unshift({
          id: Date.now() + Math.random(),
          text: line,
          details: "",
          dueDate: "",
          workspace: "personal",
          priority: "normal",
          completed: false,
          createdAt: timestamp,
          updatedAt: timestamp
        });
        added += 1;
      }
    });

    saveJSON(STORAGE.tasks, tasks);
    renderAll();
    response.textContent = added
      ? `Created ${added} task${added === 1 ? "" : "s"} from your notes.`
      : "Those note lines already exist as tasks.";
  }
}

document.querySelectorAll("[data-open-app]").forEach((button) => {
  button.addEventListener("click", () => openApp(button.dataset.openApp));
});

$("launcherButton").addEventListener("click", () => {
  $("launcher").classList.toggle("open");
});

$("closeLauncherButton").addEventListener("click", closeLauncher);

$("themeButton").addEventListener("click", () => {
  document.body.classList.toggle("light-theme");
  localStorage.setItem(
    STORAGE.theme,
    document.body.classList.contains("light-theme") ? "light" : "dark"
  );
  restoreTheme();
});

$("quickTaskForm").addEventListener("submit", (event) => {
  event.preventDefault();

  const text = $("quickTaskInput").value.trim();
  if (!text) {
    $("quickTaskInput").focus();
    return;
  }

  openTaskModal({
    text,
    workspace: $("quickTaskWorkspace").value,
    priority: $("quickTaskPriority").value
  }, "quick");
});

$("taskForm").addEventListener("submit", (event) => {
  event.preventDefault();

  const text = $("taskInput").value.trim();
  if (!text) {
    $("taskInput").focus();
    return;
  }

  openTaskModal({
    text,
    workspace: $("taskWorkspace").value,
    priority: $("taskPriority").value
  }, "tasks");
});

document.querySelectorAll("[data-template-task]").forEach((button) => {
  button.addEventListener("click", () => {
    openTaskModal({
      text: button.dataset.templateTask,
      workspace: button.dataset.templateWorkspace,
      priority: "important"
    }, "template");
  });
});

$("taskModalForm").addEventListener("submit", (event) => {
  event.preventDefault();

  const values = {
    text: $("taskModalTitle").value,
    details: $("taskModalDetails").value,
    dueDate: $("taskModalDueDate").value,
    workspace: $("taskModalWorkspace").value,
    priority: $("taskModalPriority").value
  };

  const wasEditing = editingTaskId !== null;
  const saved = wasEditing
    ? updateTask(editingTaskId, values)
    : createTask(values);

  if (!saved) return;

  if (!wasEditing && pendingTaskSource === "quick") {
    $("quickTaskInput").value = "";
  }

  if (!wasEditing && pendingTaskSource === "tasks") {
    $("taskInput").value = "";
  }

  closeTaskModal();
  showToast(wasEditing ? "Task updated" : "Task added");
});

$("closeTaskModalButton").addEventListener("click", closeTaskModal);
$("cancelTaskModalButton").addEventListener("click", closeTaskModal);

$("taskModal").addEventListener("pointerdown", (event) => {
  if (event.target === $("taskModal")) closeTaskModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && $("taskModal").classList.contains("open")) {
    closeTaskModal();
  }
});

document.querySelectorAll(".filter").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".filter").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    activeFilter = button.dataset.filter;
    renderTasks();
  });
});

$("workspaceFilter").addEventListener("change", (event) => {
  activeWorkspaceFilter = event.target.value;
  renderTasks();
});

$("globalSearch").addEventListener("input", (event) => {
  searchTerm = event.target.value.trim();
  renderTasks();

  if (searchTerm) openApp("tasks");
});

$("previousMonth").addEventListener("click", () => {
  shownMonth -= 1;
  if (shownMonth < 0) {
    shownMonth = 11;
    shownYear -= 1;
  }
  renderCalendar();
});

$("nextMonth").addEventListener("click", () => {
  shownMonth += 1;
  if (shownMonth > 11) {
    shownMonth = 0;
    shownYear += 1;
  }
  renderCalendar();
});

$("eventForm").addEventListener("submit", (event) => {
  event.preventDefault();

  events.push({
    id: Date.now() + Math.random(),
    title: $("eventTitle").value.trim(),
    date: $("eventDate").value,
    workspace: $("eventWorkspace").value
  });

  saveJSON(STORAGE.events, events);
  $("eventTitle").value = "";
  $("eventDate").value = "";
  renderAll();
  showToast("Event saved");
});

let noteTimer = null;

$("quickNotes").value = localStorage.getItem(STORAGE.notes) || "";

$("quickNotes").addEventListener("input", () => {
  $("noteStatus").textContent = "Saving…";
  clearTimeout(noteTimer);

  noteTimer = setTimeout(() => {
    localStorage.setItem(STORAGE.notes, $("quickNotes").value);

    if (window.BoxCloud?.isReady()) {
      window.BoxCloud.queueNoteSync($("quickNotes").value);
    }

    $("noteStatus").textContent = "Saved";
  }, 450);
});

$("financeForm").addEventListener("submit", (event) => {
  event.preventDefault();

  financeEntries.unshift({
    id: Date.now() + Math.random(),
    description: $("financeDescription").value.trim(),
    amount: Number($("financeAmount").value),
    type: $("financeType").value,
    workspace: $("financeWorkspace").value,
    createdAt: new Date().toISOString()
  });

  saveJSON(STORAGE.finance, financeEntries);
  $("financeDescription").value = "";
  $("financeAmount").value = "";
  renderFinance();
  showToast("Finance entry saved");
});

document.querySelectorAll(".preset").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".preset").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    setTimer(Number(button.dataset.minutes));
  });
});

$("timerStartButton").addEventListener("click", toggleTimer);
$("timerResetButton").addEventListener("click", () => setTimer(selectedTimerMinutes));

document.querySelectorAll("[data-assistant-action]").forEach((button) => {
  button.addEventListener("click", () => runAssistant(button.dataset.assistantAction));
});


document.querySelectorAll(".document-sidebar > .document-folder").forEach((button) => {
  button.addEventListener("click", () => {
    selectDocumentFolder(button.dataset.documentFolder);
  });
});

$("addDocumentFolderButton").addEventListener("click", openDocumentFolderModal);
$("closeDocumentFolderModalButton").addEventListener("click", closeDocumentFolderModal);
$("cancelDocumentFolderButton").addEventListener("click", closeDocumentFolderModal);

$("documentFolderModal").addEventListener("pointerdown", (event) => {
  if (event.target === $("documentFolderModal")) closeDocumentFolderModal();
});

$("documentFolderForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const folderName = normalizeFolderName($("documentFolderName").value);
  const saveButton = $("saveDocumentFolderButton");
  const duplicate = getAllDocumentFolderNames().some(
    (name) => name.toLocaleLowerCase() === folderName.toLocaleLowerCase()
  );

  if (!folderName) {
    setDocumentUploadStatus("Enter a folder name.", "error");
    $("documentFolderName").focus();
    return;
  }

  if (duplicate) {
    setDocumentUploadStatus(`A folder named “${folderName}” already exists.`, "error");
    $("documentFolderName").focus();
    return;
  }

  saveButton.disabled = true;
  saveButton.textContent = "Creating…";
  const result = await window.BoxCloud.createDocumentFolder(folderName);
  saveButton.disabled = false;
  saveButton.textContent = "Create folder";

  if (result.error) {
    setDocumentUploadStatus(result.error.message, "error");
    return;
  }

  documentFolders.push(result.data);
  activeDocumentFolder = result.data.name;
  closeDocumentFolderModal();
  renderDocuments();
  $("documentUploadFolder").value = result.data.name;
  setDocumentUploadStatus(`Folder “${result.data.name}” created.`, "success");
  showToast("Folder created");
});

$("closeDocumentDetailsModalButton").addEventListener("click", closeDocumentDetailsModal);
$("cancelDocumentDetailsButton").addEventListener("click", closeDocumentDetailsModal);

$("documentDetailsModal").addEventListener("pointerdown", (event) => {
  if (event.target === $("documentDetailsModal")) closeDocumentDetailsModal();
});

$("documentDetailsInput").addEventListener("input", updateDocumentDetailsCharacterCount);

$("documentDetailsForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const documentId = $("documentDetailsId").value;
  const documentItem = documents.find((item) => String(item.id) === String(documentId));
  if (!documentItem) {
    closeDocumentDetailsModal();
    setDocumentUploadStatus("The selected document could not be found.", "error");
    return;
  }

  const metadata = {
    details: $("documentDetailsInput").value.trim(),
    expiryDate: $("documentDetailsExpiryDate").value,
    reminderDays: Number($("documentDetailsReminderDays").value || 30),
    tags: normalizeDocumentTagInput($("documentDetailsTags").value),
    linkedTaskIds: getSelectedOptionValues($("documentDetailsTaskLinks")),
    linkedEventIds: getSelectedOptionValues($("documentDetailsEventLinks"))
  };
  const saveButton = $("saveDocumentDetailsButton");
  saveButton.disabled = true;
  saveButton.textContent = "Saving…";

  const result = await window.BoxCloud.updateDocumentMetadata(documentId, metadata);

  saveButton.disabled = false;
  saveButton.textContent = "Save changes";

  if (result.error) {
    setDocumentUploadStatus(result.error.message, "error");
    return;
  }

  documentItem.details = result.data?.details || "";
  documentItem.expiry_date = result.data?.expiry_date || null;
  documentItem.reminder_days = result.data?.reminder_days ?? 30;
  documentItem.tags = result.data?.tags || [];
  documentItem.linked_task_ids = result.data?.linked_task_ids || [];
  documentItem.linked_event_ids = result.data?.linked_event_ids || [];
  documentItem.updated_at = result.data?.updated_at || new Date().toISOString();
  closeDocumentDetailsModal();
  renderTasks();
  renderEvents();
  renderDocuments();
  setDocumentUploadStatus("Document information saved.", "success");
  showToast("Document information saved");
});

$("closeDocumentPreviewButton").addEventListener("click", closeDocumentPreview);
$("documentPreviewModal").addEventListener("pointerdown", (event) => {
  if (event.target === $("documentPreviewModal")) closeDocumentPreview();
});
$("openDocumentExternallyButton").addEventListener("click", async () => {
  if (!previewDocumentItem) return;
  if (!previewDocumentSignedUrl) {
    const result = await window.BoxCloud.createDocumentUrl(previewDocumentItem.storage_path, 600);
    previewDocumentSignedUrl = result.data?.signedUrl || result.data?.signedURL || "";
  }
  if (previewDocumentSignedUrl) window.open(previewDocumentSignedUrl, "_blank", "noopener");
});
$("downloadPreviewDocumentButton").addEventListener("click", () => {
  if (previewDocumentItem) {
    downloadStoredDocument(previewDocumentItem, $("downloadPreviewDocumentButton"));
  }
});
$("previewDocumentVersionsButton").addEventListener("click", () => {
  if (previewDocumentItem) {
    const documentItem = previewDocumentItem;
    closeDocumentPreview();
    openDocumentVersionModal(documentItem);
  }
});
$("clearDocumentLinkFilterButton").addEventListener("click", clearDocumentLinkFilter);

$("closeDocumentVersionModalButton").addEventListener("click", closeDocumentVersionModal);
$("documentVersionModal").addEventListener("pointerdown", (event) => {
  if (event.target === $("documentVersionModal")) closeDocumentVersionModal();
});
$("chooseDocumentVersionButton").addEventListener("click", () => $("documentVersionFile").click());
$("documentVersionFile").addEventListener("change", () => {
  const file = $("documentVersionFile").files?.[0];
  $("documentVersionSelection").textContent = file
    ? `${file.name} · ${formatBytes(file.size)}`
    : "Choose one replacement file, up to 25 MB.";
  $("uploadDocumentVersionButton").disabled = !file;
});
$("documentVersionUploadForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  await uploadNewDocumentVersion();
});
$("refreshDocumentVersionsButton").addEventListener("click", loadDocumentVersions);
$("previewCurrentVersionButton").addEventListener("click", () => {
  if (versionDocumentItem) {
    const documentItem = versionDocumentItem;
    closeDocumentVersionModal();
    openDocumentPreview(documentItem);
  }
});
$("documentGridViewButton").addEventListener("click", () => {
  documentViewMode = "grid";
  localStorage.setItem(STORAGE.documentView, documentViewMode);
  renderDocuments();
});
$("documentListViewButton").addEventListener("click", () => {
  documentViewMode = "list";
  localStorage.setItem(STORAGE.documentView, documentViewMode);
  renderDocuments();
});

$("documentSearch").addEventListener("input", (event) => {
  documentSearchTerm = event.target.value.trim();
  renderDocuments();
});

$("documentSort").addEventListener("change", renderDocuments);
$("documentComplianceFilter").addEventListener("change", (event) => {
  documentComplianceFilter = event.target.value;
  renderDocuments();
});
$("showAttentionDocumentsButton").addEventListener("click", () => {
  documentComplianceFilter = "attention";
  $("documentComplianceFilter").value = "attention";
  activeDocumentFolder = "all";
  renderDocuments();
});

$("refreshDocumentsButton").addEventListener("click", () => {
  loadDocuments();
});

$("documentSignInButton").addEventListener("click", openAuthOverlay);

$("chooseDocumentFilesButton").addEventListener("click", () => {
  if (!window.BoxCloud?.isReady()) {
    openAuthOverlay();
    return;
  }

  $("documentFiles").click();
});

$("documentFiles").addEventListener("change", () => {
  const files = Array.from($("documentFiles").files || []);
  const label = files.length
    ? files.length === 1
      ? `${files[0].name} · ${formatBytes(files[0].size)}`
      : `${files.length} files selected · ${formatBytes(
          files.reduce((sum, file) => sum + file.size, 0)
        )}`
    : "Choose one or more files, up to 25 MB each.";

  $("documentFileSelection").textContent = label;
  updateDocumentAccessUI();
});

$("documentUploadForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  await uploadSelectedDocuments();
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;

  if ($("documentVersionModal").classList.contains("open")) {
    closeDocumentVersionModal();
  } else if ($("documentPreviewModal").classList.contains("open")) {
    closeDocumentPreview();
  } else if ($("documentDetailsModal").classList.contains("open")) {
    closeDocumentDetailsModal();
  } else if ($("documentFolderModal").classList.contains("open")) {
    closeDocumentFolderModal();
  }
});


$("downloadBackupButton").addEventListener("click", downloadWorkspaceBackup);
$("chooseBackupFileButton").addEventListener("click", () => $("backupFileInput").click());
$("backupFileInput").addEventListener("change", async () => {
  const file = $("backupFileInput").files?.[0];
  await loadBackupImportFile(file);
});
$("restoreBackupButton").addEventListener("click", restoreSelectedBackup);
$("downloadSafetyBackupButton").addEventListener("click", downloadSafetyBackup);
$("resetWindowLayoutsButton").addEventListener("click", resetSavedWindowLayouts);
$("refreshAppFilesButton").addEventListener("click", refreshAppFiles);


function setCloudStatus(state, label) {
  const element = $("cloudStatus");
  element.className = `cloud-status ${state}`;
  element.querySelector("strong").textContent = label;
}

function openAuthOverlay() {
  $("authOverlay").classList.add("open");
}

function closeAuthOverlay() {
  $("authOverlay").classList.remove("open");
}

function updateAuthUI(session) {
  const signedIn = Boolean(session?.user);

  $("authForm").classList.toggle("hidden", signedIn);
  $("signUpButton").classList.toggle("hidden", signedIn);
  $("continueLocalButton").classList.toggle("hidden", signedIn);
  $("signedInPanel").classList.toggle("hidden", !signedIn);

  if (signedIn) {
    $("signedInEmail").textContent = session.user.email || "Supabase user";
  }
}

window.BoxOSCloudHydrate = function cloudHydrate(data) {
  if (Array.isArray(data.tasks)) tasks = data.tasks.map(normalizeTask);
  if (Array.isArray(data.events)) events = data.events;
  if (Array.isArray(data.finance_entries)) financeEntries = data.finance_entries;

  if (typeof data.notes === "string") {
    $("quickNotes").value = data.notes;
    localStorage.setItem(STORAGE.notes, data.notes);
  }

  localStorage.setItem(STORAGE.tasks, JSON.stringify(tasks));
  localStorage.setItem(STORAGE.events, JSON.stringify(events));
  localStorage.setItem(STORAGE.finance, JSON.stringify(financeEntries));
  renderAll();
};

$("accountButton").addEventListener("click", openAuthOverlay);
$("continueLocalButton").addEventListener("click", closeAuthOverlay);

$("authForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!window.BoxCloud?.isConfigured()) {
    $("authMessage").textContent =
      "Supabase is not configured yet. Add your project URL and publishable/anon key to config.js.";
    return;
  }

  $("signInButton").disabled = true;
  $("authMessage").textContent = "Signing in…";

  const result = await window.BoxCloud.signIn(
    $("authEmail").value.trim(),
    $("authPassword").value
  );

  $("signInButton").disabled = false;

  if (result.error) {
    $("authMessage").textContent = result.error.message;
    return;
  }

  $("authMessage").textContent = "Signed in. Loading your cloud workspace…";
  closeAuthOverlay();
});

$("signUpButton").addEventListener("click", async () => {
  if (!window.BoxCloud?.isConfigured()) {
    $("authMessage").textContent =
      "Configure config.js first, then create your account.";
    return;
  }

  const email = $("authEmail").value.trim();
  const password = $("authPassword").value;

  if (!email || password.length < 6) {
    $("authMessage").textContent =
      "Enter a valid email and a password with at least 6 characters.";
    return;
  }

  $("authMessage").textContent = "Creating account…";
  const result = await window.BoxCloud.signUp(email, password);

  $("authMessage").textContent = result.error
    ? result.error.message
    : "Account created. Check your email if confirmation is enabled, then sign in.";
});

$("syncNowButton").addEventListener("click", async () => {
  $("authMessage").textContent = "Syncing…";
  const result = await window.BoxCloud.syncNow();
  $("authMessage").textContent = result.error
    ? result.error.message
    : "Cloud sync complete.";
});

$("signOutButton").addEventListener("click", async () => {
  await window.BoxCloud.signOut();
  closeAuthOverlay();
});

window.addEventListener("boxcloudstatus", (event) => {
  const detail = event.detail || {};
  const nextUserId = detail.session?.user?.id || null;

  setCloudStatus(detail.state || "offline", detail.label || "Local");
  updateAuthUI(detail.session || null);

  if (nextUserId !== currentDocumentUserId) {
    currentDocumentUserId = nextUserId;
    documents = [];
    documentFolders = [];
    activeDocumentLinkFilter = null;
    setDocumentUploadStatus("");

    if (nextUserId) {
      loadDocuments();
    } else {
      renderTasks();
      renderEvents();
      renderDocuments();
    }
  } else {
    updateDocumentAccessUI();
  }

  renderBackupCenter();
});


if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./service-worker.js")
      .catch((error) => console.error("Service worker registration failed:", error));
  });
}

normalizeData();
initializeWindowControls();
restoreTheme();
updateClock();
setInterval(updateClock, 1000);
renderAll();
loadWeather();
updateTimerDisplay();
openApp("dashboard");


if (window.BoxCloud) {
  window.BoxCloud.start().then((result) => {
    if (!window.BoxCloud.isConfigured()) {
      setCloudStatus("offline", "Local");
      $("authMessage").textContent =
        "Supabase is not configured. The app is working locally. Complete the Phase 5 setup when you are ready for cloud sync.";
      return;
    }

    if (!result.session) {
      openAuthOverlay();
    }
  });
}