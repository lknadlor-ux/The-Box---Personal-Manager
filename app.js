"use strict";

const VIEW_MODE_STORAGE_KEY = "theBoxOSViewMode";
const VALID_VIEW_MODES = new Set(["auto", "mobile", "tablet", "windows"]);

// Phase 7N.6.1 stability hotfix:
// This state must exist before the first updateDeviceUiClasses() call.
let mobileActiveApp = "dashboard";
let quickCaptureDestination = "task";

function getViewModePreference() {
  const saved = localStorage.getItem(VIEW_MODE_STORAGE_KEY) || "auto";
  return VALID_VIEW_MODES.has(saved) ? saved : "auto";
}

function getDetectedDeviceLayout() {
  const userAgent = navigator.userAgent || "";
  const androidDevice = /Android/i.test(userAgent);
  const iosDevice =
    /iPad|iPhone|iPod/i.test(userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  const touchCapable =
    androidDevice ||
    iosDevice ||
    navigator.maxTouchPoints > 0 ||
    "ontouchstart" in window ||
    window.matchMedia("(pointer: coarse)").matches;

  const phone =
    touchCapable &&
    Math.min(window.innerWidth || 0, window.innerHeight || 0) <= 680;

  const safeRenderer =
    androidDevice || (touchCapable && !phone && window.innerWidth > 680);

  const tablet =
    safeRenderer && !phone && window.innerWidth > 680;

  return {
    androidDevice,
    iosDevice,
    touchCapable,
    phone,
    tablet,
    safeRenderer
  };
}

function getEffectiveViewMode() {
  if (document.documentElement.classList.contains("phone-ui")) return "mobile";
  if (document.documentElement.classList.contains("tablet-ui")) return "tablet";
  return "windows";
}

function updateViewModeControls() {
  const selected = getViewModePreference();
  const effective = getEffectiveViewMode();
  const labels = {
    auto: "Auto",
    mobile: "Mobile",
    tablet: "Tablet",
    windows: "Windows"
  };

  const currentLabel = document.getElementById("viewModeCurrentLabel");
  if (currentLabel) {
    currentLabel.textContent =
      selected === "auto"
        ? `Auto · ${labels[effective]}`
        : labels[selected];
  }

  const help = document.getElementById("viewModeHelp");
  if (help) {
    help.textContent = {
      auto: `Auto is currently using ${labels[effective]} view.`,
      mobile: "Mobile view is locked on this device. Recommended for iPhone 13 and other phones.",
      tablet: "Tablet view is locked on this device. Recommended for Honor Pad.",
      windows: "Windows view is locked on this device. Recommended for PC and large desktop screens."
    }[selected];
  }

  document.querySelectorAll("[data-view-mode-option]").forEach((button) => {
    const active = button.dataset.viewModeOption === selected;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function updateDeviceUiClasses() {
  const root = document.documentElement;
  const detected = getDetectedDeviceLayout();
  const selectedMode = getViewModePreference();

  let phoneMode = detected.phone;
  let tabletMode = detected.tablet;
  let safeRendererMode = detected.safeRenderer;

  if (selectedMode === "mobile") {
    phoneMode = true;
    tabletMode = false;
    safeRendererMode = false;
  } else if (selectedMode === "tablet") {
    phoneMode = false;
    tabletMode = true;
    safeRendererMode = true;
  } else if (selectedMode === "windows") {
    phoneMode = false;
    tabletMode = false;
    safeRendererMode = false;
  }

  root.dataset.viewMode = selectedMode;
  root.classList.toggle("touch-ui", detected.touchCapable);
  root.classList.toggle("ios-ui", detected.iosDevice);
  root.classList.toggle("phone-ui", phoneMode);
  root.classList.toggle("safe-render-ui", safeRendererMode);
  root.classList.toggle("tablet-ui", tabletMode);
  root.classList.toggle("view-mode-auto", selectedMode === "auto");
  root.classList.toggle("view-mode-mobile", selectedMode === "mobile");
  root.classList.toggle("view-mode-tablet", selectedMode === "tablet");
  root.classList.toggle("view-mode-windows", selectedMode === "windows");

  updateViewModeControls();
  if (typeof updateMobileNavigation === "function") {
    updateMobileNavigation(mobileActiveApp);
  }
}

function setViewModePreference(mode, { notify = true } = {}) {
  const nextMode = VALID_VIEW_MODES.has(mode) ? mode : "auto";
  localStorage.setItem(VIEW_MODE_STORAGE_KEY, nextMode);
  document.documentElement.classList.remove("mobile-input-active");

  updateDeviceUiClasses();
  updateAppViewportHeight();

  if (nextMode === "mobile") {
    document.querySelectorAll(".app-window .window-content").forEach((content) => {
      content.scrollTop = 0;
    });
  }

  document.querySelectorAll(".app-window").forEach((windowElement) => {
    if (!isCompactWindowMode()) {
      applyTabletDefaultWindowLayout(windowElement);
      clampWindowToDesktop(windowElement);
    }
    updateWindowResponsiveState(windowElement);
  });

  updateViewModeControls();

  if (notify && typeof showToast === "function") {
    const labels = {
      auto: "Auto display mode",
      mobile: "Mobile view",
      tablet: "Tablet view",
      windows: "Windows view"
    };
    showToast(`${labels[nextMode]} enabled`);
  }
}

updateDeviceUiClasses();

function updateAppViewportHeight() {
  const viewportHeight = Math.round(
    window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight
  );

  if (viewportHeight > 0) {
    document.documentElement.style.setProperty(
      "--box-viewport-height",
      `${viewportHeight}px`
    );
  }
}

updateAppViewportHeight();

function setMobileInputState(active) {
  if (!document.documentElement.classList.contains("phone-ui")) {
    document.documentElement.classList.remove("mobile-input-active");
    return;
  }
  document.documentElement.classList.toggle("mobile-input-active", Boolean(active));
}

document.addEventListener("focusin", (event) => {
  if (!event.target?.matches?.("input, textarea, select, [contenteditable='true']")) return;
  setMobileInputState(true);
});

document.addEventListener("focusout", () => {
  window.setTimeout(() => {
    const active = document.activeElement;
    const editing = active?.matches?.("input, textarea, select, [contenteditable='true']");
    setMobileInputState(Boolean(editing));
  }, 80);
});

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
  honorPadUiFix: "theBoxOSHonorPadUiFixV3",
  customTemplates: "theBoxOSCustomTemplates",
  reminderSettings: "theBoxOSReminderSettings",
  dismissedReminders: "theBoxOSDismissedReminders",
  lastDailyReminderSummary: "theBoxOSLastDailyReminderSummary",
  lastBrowserReminderSignature: "theBoxOSLastBrowserReminderSignature",
  taskView: "theBoxOSTaskView",
  journal: "theBoxOSJournalEntries",
  journalDraft: "theBoxOSJournalDraft",
  journalPendingSync: "theBoxOSJournalPendingSync",
  ourSpace: "theBoxOSOurSpacePlans",
  ourSpacePendingSync: "theBoxOSOurSpacePendingSync"
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

const initialTaskCloudRecords = loadJSON(STORAGE.tasks, []);
let goals = normalizeGoals(
  initialTaskCloudRecords
    .filter(isGoalCloudRecord)
    .map(extractGoalFromCloudRecord)
);
let routines = normalizeRoutines(
  initialTaskCloudRecords
    .filter(isRoutineCloudRecord)
    .map(extractRoutineFromCloudRecord)
);
let tasks = initialTaskCloudRecords.filter(
  (item) => !isGoalCloudRecord(item) && !isRoutineCloudRecord(item)
);
let events = loadJSON(STORAGE.events, []);
let financeEntries = loadJSON(STORAGE.finance, []);
let customTemplates = loadJSON(STORAGE.customTemplates, []);
let journalEntries = normalizeJournalEntries(loadJSON(STORAGE.journal, []));
let selectedJournalEntryId = null;
let journalSearchTerm = "";
let journalMoodFilter = "all";
let journalFavoritesOnly = false;
let journalDateFrom = "";
let journalDateTo = "";
let journalEditorInitialized = false;
let journalEditorDirty = false;
let journalFocusMode = false;
let journalFocusAutoMaximized = false;

let ourSpacePlans = normalizeOurSpacePlans(loadJSON(STORAGE.ourSpace, []));
let selectedOurSpacePlanId = null;
let ourSpaceSearchTerm = "";
let ourSpaceCategoryFilter = "all";
let ourSpaceStatusFilter = "all";
let ourSpaceFavoritesOnly = false;
let ourSpaceDraftChecklist = [];
let ourSpaceDraftLinks = [];
let ourSpaceDraftAttachments = [];
const ourSpaceAttachmentPreviewCache = new Map();



let activeFilter = "all";
let activeWorkspaceFilter = "all";
let searchTerm = "";
let activeTaskTagFilter = "all";
let activeTaskProjectFilter = "all";
let selectedProjectName = "";
let projectsSearchTerm = "";
let projectsWorkspaceFilter = "all";
let activityTypeFilter = "all";
let activityRangeFilter = "30";
let activitySearchTerm = "";
let commandPaletteActiveIndex = 0;
let commandPaletteItems = [];
let commandPaletteLastQuery = "";
let selectedWorkspaceHub = "personal";
let agendaTypeFilter = "all";
let agendaWorkspaceFilter = "all";
let agendaRangeDays = 14;
let agendaSearchTerm = "";
let selectedGoalId = null;
let goalSearchTerm = "";
let goalWorkspaceFilter = "all";
let goalStatusFilter = "all";
let goalTaskPickerSearch = "";
let goalDraftMilestones = [];
let goalDraftLinkedProjects = [];
let goalDraftLinkedTaskIds = [];
let selectedRoutineId = null;
let routineSearchTerm = "";
let routineWorkspaceFilter = "all";
let routineStateFilter = "all";
let favoritesFilter = "all";
let favoritesSearchTerm = "";
let taskViewMode = localStorage.getItem(STORAGE.taskView) === "kanban" ? "kanban" : "list";
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

const SMART_TEXT_DB_NAME = "the-box-smart-document-tools";
const SMART_TEXT_DB_VERSION = 1;
const SMART_TEXT_STORE = "extracted_text";
const SMART_TEXT_MAX_CHARACTERS = 1500000;
const SMART_PDF_MAX_PAGES = 500;
const PDFJS_MODULE_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.1.200/legacy/build/pdf.min.mjs";
const PDFJS_WORKER_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.1.200/legacy/build/pdf.worker.min.mjs";
const PDFJS_CMAP_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.1.200/cmaps/";
const PDFJS_STANDARD_FONT_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.1.200/standard_fonts/";

let smartDocumentItem = null;
let smartDocumentRecord = null;
let smartDocumentSearchMatches = [];
let smartDocumentSearchIndex = -1;
let smartDocumentExtractionBusy = false;
let smartPdfModulePromise = null;
let smartTextDatabasePromise = null;


const BUILT_IN_TEMPLATES = [
  {
    id: "builtin-sk-program-design",
    title: "SK Program Design",
    category: "SK",
    content: `TITLE
{{program_title}}

RATIONALE
{{rationale}}

OBJECTIVES
• {{objective_1}}
• {{objective_2}}
• {{objective_3}}

DATE AND TIME
{{date_and_time}}

PARTICIPANTS
{{participants}}

BUDGETARY REQUIREMENTS
{{budgetary_requirements}}

EXPECTED OUTPUT
{{expected_output}}

Prepared by:

______________________________
SK Secretary

Noted by:

______________________________
SK Chairperson`
  },
  {
    id: "builtin-sk-post-activity",
    title: "SK Post-Activity Report",
    category: "SK",
    content: `TITLE
{{activity_title}}

DATE
{{activity_date}}

VENUE
{{venue}}

TOTAL PARTICIPANTS
{{total_participants}}

OBJECTIVES
• {{objective_1}}
• {{objective_2}}
• {{objective_3}}

HIGHLIGHTS

{{highlights_paragraph_1}}

{{highlights_paragraph_2}}

A. Activities Conducted
{{activities_conducted}}

B. Participation and Engagement
{{participation_and_engagement}}

C. Issues and Challenges
{{issues_and_challenges}}

D. Recommendations
{{recommendations}}

Prepared by:

______________________________
SK Secretary

Noted by:

______________________________
SK Chairperson`
  },
  {
    id: "builtin-supplier-follow-up-email",
    title: "Supplier Order Follow-up Email",
    category: "Suppliers",
    content: `Subject: Follow-up on {{order_reference}}

Dear {{recipient_name}},

Good day.

We would like to follow up on {{order_reference}}, placed on {{order_date}}. Please provide the current status, expected delivery date, and any items that are unavailable or pending.

Delivery details:
Facility: {{facility_name}}
Address: {{delivery_address}}
Contact person: {{contact_person}}

Thank you.

Sincerely,
{{sender_name}}
{{position}}
{{facility_name}}`
  },
  {
    id: "builtin-clinic-staff-memo",
    title: "Clinic Staff Memorandum",
    category: "Clinic",
    content: `MEMORANDUM

Date: {{today}}
To: {{recipients}}
From: {{sender_name}}
Subject: {{subject}}

{{opening_statement}}

Please observe the following:

1. {{instruction_1}}
2. {{instruction_2}}
3. {{instruction_3}}

{{closing_statement}}

For strict compliance.

______________________________
{{sender_name}}
{{position}}`
  },
  {
    id: "builtin-document-renewal-notice",
    title: "Document Renewal Notice",
    category: "Compliance",
    content: `DOCUMENT RENEWAL NOTICE

Date: {{today}}

Document: {{document_name}}
Current expiry date: {{expiry_date}}
Responsible person/unit: {{responsible_person}}
Target filing date: {{target_filing_date}}

Required actions:
☐ Confirm the latest documentary requirements
☐ Prepare and review supporting documents
☐ Verify names, dates, addresses, and signatures
☐ Arrange payment or filing, when applicable
☐ Save the submission and acknowledgement copies
☐ Update the Document Vault record after completion

Notes:
{{notes}}`
  },
  {
    id: "builtin-compliance-incident-report",
    title: "Compliance Incident Report",
    category: "Compliance",
    content: `COMPLIANCE INCIDENT REPORT

Date and time identified: {{incident_date_time}}
Facility/unit: {{facility_name}}
Reported by: {{reported_by}}

INCIDENT
{{incident_description}}

IMMEDIATE ACTIONS TAKEN
{{immediate_actions}}

POTENTIAL IMPACT
{{potential_impact}}

ROOT CAUSE OR CONTRIBUTING FACTORS
{{root_cause}}

CORRECTIVE ACTIONS
{{corrective_actions}}

PREVENTIVE ACTIONS
{{preventive_actions}}

RESPONSIBLE PERSON AND TARGET DATE
{{responsible_person_and_target}}

STATUS
{{status}}

Attachments or references:
{{attachments}}`
  },
  {
    id: "builtin-fda-renewal-planning",
    title: "FDA LTO Renewal Planning Checklist",
    category: "FDA",
    content: `FDA LTO RENEWAL PLANNING CHECKLIST
Customizable working copy — verify the current official FDA requirements.

Facility: {{facility_name}}
LTO type: {{lto_type}}
Current validity: {{validity_period}}
Target submission date: {{target_submission_date}}

PLANNING
☐ Confirm the correct application or variation type
☐ Review the current FDA portal instructions
☐ Verify establishment and qualified-person details
☐ Review business and location information
☐ Check all supporting documents for validity
☐ Confirm fees and payment instructions
☐ Prepare clear, readable file copies
☐ Review consistency of names, addresses, and dates
☐ Submit and save the acknowledgement/reference number
☐ Track clarifications, inspection, or compliance requests
☐ Save the approved record in the Document Vault

Additional requirements to confirm:
{{requirements_to_confirm}}

Notes:
{{notes}}`
  },
  {
    id: "builtin-philhealth-operations-checklist",
    title: "PhilHealth YAKAP/GAMOT Operations Checklist",
    category: "PhilHealth",
    content: `PHILHEALTH YAKAP/GAMOT OPERATIONS CHECKLIST
Customizable working copy — confirm current PhilHealth issuances and portal rules.

Date: {{today}}
Facility: {{facility_name}}
Prepared by: {{prepared_by}}

DAILY REVIEW
☐ Check portal access and account status
☐ Review pending patient or member concerns
☐ Verify completeness of required records
☐ Check pending claims, availments, or submissions
☐ Record system errors or downtime
☐ Follow up unresolved cases
☐ Save official advisories and reference documents
☐ Escalate urgent operational issues

PENDING ITEMS
{{pending_items}}

SYSTEM OR PROCESS ISSUES
{{system_issues}}

FOLLOW-UP OWNER AND DUE DATE
{{follow_up_owner_and_due_date}}`
  },
  {
    id: "builtin-formal-request-letter",
    title: "Formal Request Letter",
    category: "General",
    content: `{{today}}

{{recipient_name}}
{{recipient_position}}
{{organization}}
{{organization_address}}

Subject: {{subject}}

Dear {{recipient_salutation}},

{{opening_paragraph}}

{{request_details}}

{{supporting_context}}

Thank you for your consideration.

Respectfully,

{{sender_name}}
{{position}}
{{facility_name}}
{{contact_details}}`
  }
];

let selectedTemplateId = BUILT_IN_TEMPLATES[0].id;
let templateSearchTerm = "";
let templateCategoryFilter = "all";
let generatedComplianceReport = null;
let templatesCloudLoading = false;


const DEFAULT_REMINDER_SETTINGS = {
  dailySummary: true,
  browserNotifications: false,
  taskLeadDays: 3,
  eventLeadDays: 3
};

let reminderSettings = {
  ...DEFAULT_REMINDER_SETTINGS,
  ...loadJSON(STORAGE.reminderSettings, {})
};
let currentReminderItems = [];
let reminderCheckTimer = null;

let noteItems = [];
let selectedNoteId = null;
let notesSearchTerm = "";
let noteSaveTimer = null;



function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.error(`Could not read ${key}:`, error);
    return fallback;
  }
}



function createJournalEntryId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function normalizeJournalDate(value) {
  const text = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : new Date().toISOString().slice(0, 10);
}

function normalizeJournalTime(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : "";
}

function normalizeJournalTags(value) {
  const raw = Array.isArray(value) ? value : String(value || "").split(",");
  const seen = new Set();
  return raw
    .map((item) => String(item || "").trim().replace(/\s+/g, " ").slice(0, 40))
    .filter((item) => {
      if (!item) return false;
      const key = item.toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 20);
}

function normalizeJournalEntry(entry = {}) {
  const now = new Date().toISOString();
  return {
    id: String(entry.id || createJournalEntryId()),
    entry_date: normalizeJournalDate(entry.entry_date || entry.entryDate),
    entry_time: normalizeJournalTime(entry.entry_time || entry.entryTime),
    title: String(entry.title || "").trim().slice(0, 180),
    content: String(entry.content || "").slice(0, 100000),
    mood: ["Great", "Good", "Okay", "Low", "Stressed"].includes(entry.mood) ? entry.mood : "",
    tags: normalizeJournalTags(entry.tags),
    favorite: Boolean(entry.favorite),
    created_at: entry.created_at || entry.createdAt || now,
    updated_at: entry.updated_at || entry.updatedAt || entry.created_at || entry.createdAt || now
  };
}

function normalizeJournalEntries(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value
    .map(normalizeJournalEntry)
    .filter((entry) => {
      if (!entry.id || seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    })
    .slice(0, 5000);
}

function persistJournalEntries({ pendingCloudSync = false } = {}) {
  journalEntries = normalizeJournalEntries(journalEntries);
  localStorage.setItem(STORAGE.journal, JSON.stringify(journalEntries));
  if (pendingCloudSync) localStorage.setItem(STORAGE.journalPendingSync, "1");
}


function createOurSpaceId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `our-space-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeOurSpaceChecklist(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      id: String(item?.id || createOurSpaceId()),
      text: String(item?.text || item || "").trim().slice(0, 240),
      completed: Boolean(item?.completed)
    }))
    .filter((item) => item.text)
    .slice(0, 80);
}

function normalizeOurSpaceLinks(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return { id: createOurSpaceId(), label: "", url: item.trim() };
      return {
        id: String(item?.id || createOurSpaceId()),
        label: String(item?.label || "").trim().slice(0, 120),
        url: String(item?.url || "").trim().slice(0, 2000)
      };
    })
    .filter((item) => item.url)
    .slice(0, 30);
}

function normalizeOurSpaceAttachments(value) {
  if (!Array.isArray(value)) return [];
  const map = new Map();
  value.forEach((item) => {
    const documentId = String(item?.documentId || item?.document_id || item?.id || "");
    if (!documentId || map.has(documentId)) return;
    map.set(documentId, {
      documentId,
      name: String(item?.name || "Attached file").trim().slice(0, 240),
      folder: String(item?.folder || "Documents").trim().slice(0, 100),
      mimeType: String(item?.mimeType || item?.mime_type || "").slice(0, 160),
      sizeBytes: Math.max(0, Number(item?.sizeBytes ?? item?.size_bytes) || 0),
      storagePath: String(item?.storagePath || item?.storage_path || "").slice(0, 600)
    });
  });
  return Array.from(map.values()).slice(0, 30);
}

function normalizeOurSpacePlan(plan = {}) {
  const now = new Date().toISOString();
  const categories = [
    "Date", "Travel", "Food / Café", "Movie / Series", "Activity",
    "Gift idea", "Future purchase", "Milestone", "Bucket list", "Other"
  ];
  const statuses = ["idea", "planning", "scheduled", "done", "someday"];
  const priorities = ["low", "medium", "high"];
  const estimatedBudget = Number(plan.estimated_budget ?? plan.estimatedBudget);
  const actualBudget = Number(plan.actual_budget ?? plan.actualBudget);
  const rating = Number(plan.rating);

  return {
    id: String(plan.id || createOurSpaceId()),
    title: String(plan.title || "").trim().slice(0, 180),
    category: categories.includes(plan.category) ? plan.category : "Other",
    status: statuses.includes(plan.status) ? plan.status : "idea",
    target_date: /^\d{4}-\d{2}-\d{2}$/.test(plan.target_date || plan.targetDate || "")
      ? String(plan.target_date || plan.targetDate).slice(0, 10)
      : "",
    place: String(plan.place || "").trim().slice(0, 180),
    estimated_budget: Number.isFinite(estimatedBudget) && estimatedBudget >= 0 ? estimatedBudget : null,
    notes: String(plan.notes || "").slice(0, 20000),
    checklist: normalizeOurSpaceChecklist(plan.checklist),
    links: normalizeOurSpaceLinks(plan.links),
    attachments: normalizeOurSpaceAttachments(plan.attachments),
    favorite: Boolean(plan.favorite),
    priority: priorities.includes(plan.priority) ? plan.priority : "medium",
    actual_date: /^\d{4}-\d{2}-\d{2}$/.test(plan.actual_date || plan.actualDate || "")
      ? String(plan.actual_date || plan.actualDate).slice(0, 10)
      : "",
    favorite_memory: String(plan.favorite_memory || plan.favoriteMemory || "").slice(0, 12000),
    actual_budget: Number.isFinite(actualBudget) && actualBudget >= 0 ? actualBudget : null,
    rating: rating >= 1 && rating <= 5 ? Math.round(rating) : null,
    created_at: plan.created_at || plan.createdAt || now,
    updated_at: plan.updated_at || plan.updatedAt || plan.created_at || plan.createdAt || now
  };
}

function normalizeOurSpacePlans(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value
    .map(normalizeOurSpacePlan)
    .filter((plan) => {
      if (!plan.id || seen.has(plan.id)) return false;
      seen.add(plan.id);
      return true;
    })
    .slice(0, 3000);
}

function persistOurSpacePlans({ pendingCloudSync = false } = {}) {
  ourSpacePlans = normalizeOurSpacePlans(ourSpacePlans);
  localStorage.setItem(STORAGE.ourSpace, JSON.stringify(ourSpacePlans));
  if (pendingCloudSync) localStorage.setItem(STORAGE.ourSpacePendingSync, "1");
}

function createLocalTemplateId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `template-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeCustomTemplate(template = {}) {
  const createdAt = template.createdAt || template.created_at || new Date().toISOString();
  return {
    id: String(template.id || createLocalTemplateId()),
    title: String(template.title || "Untitled template").trim().slice(0, 120),
    category: String(template.category || "General").trim().slice(0, 50) || "General",
    content: String(template.content || "").slice(0, 250000),
    createdAt,
    updatedAt: template.updatedAt || template.updated_at || createdAt
  };
}

function normalizeCustomTemplates(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value
    .map(normalizeCustomTemplate)
    .filter((template) => {
      if (!template.id || seen.has(template.id)) return false;
      seen.add(template.id);
      return true;
    })
    .slice(0, 500);
}

function saveJSON(key, value) {
  const storedValue =
    key === STORAGE.tasks
      ? getTaskGoalCloudRecords(value, goals)
      : value;

  localStorage.setItem(key, JSON.stringify(storedValue));

  if (window.BoxCloud?.isReady()) {
    const cloudCollections = {
      [STORAGE.tasks]: "tasks",
      [STORAGE.events]: "events",
      [STORAGE.finance]: "finance_entries"
    };

    const table = cloudCollections[key];
    if (table) {
      window.BoxCloud.queueCollectionSync(table, storedValue);
    }
  }
}


function createNoteItemId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `note-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeNoteItem(note = {}) {
  const now = new Date().toISOString();
  return {
    id: String(note.id || createNoteItemId()),
    title: String(note.title || "").trim().slice(0, 180),
    content: String(note.content || "").slice(0, 250000),
    sticky: Boolean(note.sticky),
    createdAt: note.createdAt || note.created_at || now,
    updatedAt: note.updatedAt || note.updated_at || note.createdAt || note.created_at || now
  };
}

function normalizeNoteItems(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value
    .map(normalizeNoteItem)
    .filter((note) => {
      if (!note.id || seen.has(note.id)) return false;
      seen.add(note.id);
      return true;
    })
    .slice(0, 2000);
}

function decodeNotesPayload(rawValue) {
  const raw = String(rawValue || "");
  if (!raw.trim()) return [];

  try {
    const parsed = JSON.parse(raw);
    if (parsed?.format === "the-box-notes-v2" && Array.isArray(parsed.items)) {
      return normalizeNoteItems(parsed.items);
    }
  } catch (error) {
    // The old Notes app stored one plain-text note. Migrate it below.
  }

  const now = new Date().toISOString();
  return [
    normalizeNoteItem({
      id: createNoteItemId(),
      title: "Quick Note",
      content: raw,
      sticky: false,
      createdAt: now,
      updatedAt: now
    })
  ];
}

function serializeNotesPayload(items = noteItems) {
  return JSON.stringify({
    format: "the-box-notes-v2",
    version: 2,
    items: normalizeNoteItems(items)
  });
}

function persistNoteItems({ sync = true } = {}) {
  noteItems = normalizeNoteItems(noteItems);
  const payload = serializeNotesPayload(noteItems);
  localStorage.setItem(STORAGE.notes, payload);

  if (sync && window.BoxCloud?.isReady()) {
    window.BoxCloud.queueNoteSync(payload);
  }
}

function getSortedNoteItems(items = noteItems) {
  return [...items].sort((a, b) => {
    if (a.sticky !== b.sticky) return a.sticky ? -1 : 1;
    return String(b.updatedAt).localeCompare(String(a.updatedAt));
  });
}

function initializeNoteItems(rawValue = localStorage.getItem(STORAGE.notes) || "") {
  noteItems = decodeNotesPayload(rawValue);
  persistNoteItems({ sync: false });

  if (selectedNoteId && !noteItems.some((note) => note.id === selectedNoteId)) {
    selectedNoteId = null;
  }

  if (!selectedNoteId && noteItems.length) {
    selectedNoteId = getSortedNoteItems(noteItems)[0]?.id || null;
  }
}

function getSelectedNoteItem() {
  return noteItems.find((note) => note.id === selectedNoteId) || null;
}

function getFilteredNoteItems() {
  const query = notesSearchTerm.toLocaleLowerCase();
  return getSortedNoteItems(noteItems.filter((note) => {
    if (!query) return true;
    return [note.title, note.content]
      .join(" ")
      .toLocaleLowerCase()
      .includes(query);
  }));
}

function getNotePreview(note, limit = 120) {
  const text = String(note?.content || "").replace(/\s+/g, " ").trim();
  if (!text) return "Empty note";
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function formatNoteUpdatedAt(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return `Updated ${date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric"
  })}`;
}

function renderNotesList() {
  const list = $("notesList");
  if (!list) return;

  const filtered = getFilteredNoteItems();
  const stickyCount = noteItems.filter((note) => note.sticky).length;

  $("notesCount").textContent = String(filtered.length);
  if ($("notesOverviewTotal")) $("notesOverviewTotal").textContent = String(noteItems.length);
  if ($("notesOverviewSticky")) $("notesOverviewSticky").textContent = String(stickyCount);
  $("notesEmptyState").hidden = filtered.length > 0;

  list.innerHTML = filtered.map((note) => `
    <button
      class="note-card ${note.id === selectedNoteId ? "active" : ""} ${note.sticky ? "sticky" : ""}"
      type="button"
      data-note-id="${escapeHtml(note.id)}"
    >
      <span class="note-card-top">
        <strong>${escapeHtml(note.title || "Untitled note")}</strong>
        <span>${note.sticky ? "▱" : ""}</span>
      </span>
      <p>${escapeHtml(getNotePreview(note))}</p>
      <span class="note-card-meta">
        ${note.sticky ? "<em>Sticky</em>" : ""}
        <em>${escapeHtml(new Date(note.updatedAt).toLocaleDateString("en-PH", { month: "short", day: "numeric" }))}</em>
      </span>
    </button>
  `).join("");

  list.querySelectorAll("[data-note-id]").forEach((button) => {
    button.addEventListener("click", () => selectNoteItem(button.dataset.noteId));
  });
}

function setNotesEditorDisabled(disabled) {
  ["noteTitle", "noteSticky", "noteContent"].forEach((id) => {
    const element = $(id);
    if (element) element.disabled = disabled;
  });
  $("deleteNoteButton").disabled = disabled;
}

function updateNoteEditorMeta(note = getSelectedNoteItem()) {
  const content = note?.content || "";
  const words = content.trim() ? content.trim().split(/\s+/).length : 0;
  $("noteWordCount").textContent = `${words} word${words === 1 ? "" : "s"}`;
  $("noteUpdatedAt").textContent = note ? formatNoteUpdatedAt(note.updatedAt) : "—";
}

function renderNotesEditor() {
  const note = getSelectedNoteItem();

  if (!note) {
    $("noteEditorMode").textContent = "NOTES";
    $("noteEditorHeading").textContent = "Select a note";
    $("noteTitle").value = "";
    $("noteSticky").checked = false;
    $("noteContent").value = "";
    $("noteStatus").textContent = "Saved";
    setNotesEditorDisabled(true);
    updateNoteEditorMeta(null);
    return;
  }

  setNotesEditorDisabled(false);
  $("noteEditorMode").textContent = note.sticky ? "STICKY NOTE" : "NOTE";
  $("noteEditorHeading").textContent = note.title || "Untitled note";
  $("noteTitle").value = note.title;
  $("noteSticky").checked = note.sticky;
  $("noteContent").value = note.content;
  $("noteStatus").textContent = "Saved";
  updateNoteEditorMeta(note);
}

function renderDesktopStickyNotes() {
  const container = $("desktopStickyNotes");
  if (!container) return;

  const stickyNotes = getSortedNoteItems(noteItems.filter((note) => note.sticky));
  container.hidden = stickyNotes.length === 0;

  container.innerHTML = stickyNotes.map((note) => `
    <button class="desktop-sticky-note" type="button" data-desktop-sticky-note-id="${escapeHtml(note.id)}">
      <span class="desktop-sticky-note-top">
        <strong>${escapeHtml(note.title || "Untitled note")}</strong>
        <span>▱</span>
      </span>
      <p>${escapeHtml(getNotePreview(note, 180))}</p>
      <small>${escapeHtml(formatNoteUpdatedAt(note.updatedAt))}</small>
    </button>
  `).join("");

  container.querySelectorAll("[data-desktop-sticky-note-id]").forEach((button) => {
    button.addEventListener("click", () => {
      openApp("notes");
      selectNoteItem(button.dataset.desktopStickyNoteId);
    });
  });
}

function renderNotesCenter() {
  if (!$("notesList")) return;
  $("notesSearchInput").value = notesSearchTerm;

  if (!selectedNoteId && noteItems.length) {
    selectedNoteId = getSortedNoteItems(noteItems)[0]?.id || null;
  }

  renderNotesList();
  renderNotesEditor();
  renderDesktopStickyNotes();
}

function selectNoteItem(noteId) {
  if (!noteItems.some((note) => note.id === noteId)) return;
  selectedNoteId = noteId;
  renderNotesList();
  renderNotesEditor();
}

function createNewNoteItem() {
  const now = new Date().toISOString();
  const note = normalizeNoteItem({
    id: createNoteItemId(),
    title: "",
    content: "",
    sticky: false,
    createdAt: now,
    updatedAt: now
  });

  noteItems.unshift(note);
  selectedNoteId = note.id;
  persistNoteItems();
  renderNotesCenter();
  $("noteTitle").focus();
  showToast("New note created");
}

function updateSelectedNoteFromEditor() {
  const note = getSelectedNoteItem();
  if (!note) return;

  note.title = $("noteTitle").value.slice(0, 180);
  note.content = $("noteContent").value.slice(0, 250000);
  note.sticky = $("noteSticky").checked;
  note.updatedAt = new Date().toISOString();

  $("noteEditorMode").textContent = note.sticky ? "STICKY NOTE" : "NOTE";
  $("noteEditorHeading").textContent = note.title || "Untitled note";
  $("noteStatus").textContent = "Saving…";
  updateNoteEditorMeta(note);
  renderNotesList();
  renderDesktopStickyNotes();

  clearTimeout(noteSaveTimer);
  noteSaveTimer = setTimeout(() => {
    persistNoteItems();
    $("noteStatus").textContent = "Saved";
    renderDashboard();
    renderFavoritesHub();
    renderActivityTimeline();
  }, 450);
}

function deleteSelectedNoteItem() {
  const note = getSelectedNoteItem();
  if (!note) return;
  if (!window.confirm(`Delete “${note.title || "Untitled note"}”?`)) return;

  noteItems = noteItems.filter((item) => item.id !== note.id);
  selectedNoteId = getSortedNoteItems(noteItems)[0]?.id || null;
  persistNoteItems();
  renderNotesCenter();
  showToast("Note deleted");
}

function getSelectedNoteLinesForTasks() {
  const note = getSelectedNoteItem();
  if (!note) return [];
  return note.content
    .split("\n")
    .map((line) => line.replace(/^[-•*]\s*/, "").trim())
    .filter((line) => line.length >= 4)
    .slice(0, 12);
}


let boxFullscreenFallbackActive = false;

function getNativeFullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function isStandaloneAppMode() {
  return Boolean(
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.matchMedia?.("(display-mode: fullscreen)")?.matches ||
    window.navigator.standalone
  );
}

function isFullscreenActive() {
  return Boolean(getNativeFullscreenElement() || boxFullscreenFallbackActive);
}

function updateFullscreenUi() {
  const nativeActive = Boolean(getNativeFullscreenElement());
  const fallbackActive = Boolean(boxFullscreenFallbackActive);
  const active = nativeActive || fallbackActive;
  const root = document.documentElement;

  root.classList.toggle("box-native-fullscreen", nativeActive);
  root.classList.toggle("box-fallback-fullscreen", fallbackActive);

  const quickButton = $("fullscreenButton");
  const launcherButton = $("launcherFullscreenButton");
  const fallbackExit = $("fullscreenFallbackExitButton");
  const help = $("fullscreenHelp");

  if (quickButton) {
    quickButton.textContent = active ? "⤢" : "⛶";
    quickButton.setAttribute(
      "aria-label",
      active ? "Exit full screen" : "Enter full screen"
    );
    quickButton.title = active ? "Exit full screen" : "Full screen";
    quickButton.classList.toggle("active", active);
  }

  if (launcherButton) {
    const icon = launcherButton.querySelector("span");
    const label = launcherButton.querySelector("strong");
    if (icon) icon.textContent = active ? "⤢" : "⛶";
    if (label) label.textContent = active ? "Exit full screen" : "Enter full screen";
    launcherButton.classList.toggle("active", active);
  }

  if (fallbackExit) {
    fallbackExit.hidden = !fallbackActive;
  }

  if (help) {
    if (nativeActive) {
      help.textContent =
        "Browser full screen is active. The Box layout and navigation stay unchanged.";
    } else if (fallbackActive) {
      help.textContent =
        "Immersive phone/tablet mode is active. On iPhone, Add to Home Screen gives the cleanest browser-free experience.";
    } else if (isStandaloneAppMode()) {
      help.textContent =
        "The Box is already running as an installed app. Full screen can still maximize the workspace where supported.";
    } else {
      help.textContent =
        "Windows and supported tablets use browser full screen. Phones use the safest available full-screen mode.";
    }
  }

  updateAppViewportHeight();

  // Recalculate open-window breakpoints after the browser or fallback viewport
  // changes. We intentionally do not alter the user's selected device layout.
  window.requestAnimationFrame(() => {
    document.querySelectorAll(".app-window").forEach((windowElement) => {
      updateWindowResponsiveState(windowElement);
      if (!isCompactWindowMode()) {
        clampWindowToDesktop(windowElement);
      }
    });
  });
}

function enterFullscreenFallback() {
  boxFullscreenFallbackActive = true;
  closeLauncher();
  updateFullscreenUi();
}

async function enterBoxFullscreen() {
  const root = document.documentElement;
  const requestFullscreen =
    root.requestFullscreen ||
    root.webkitRequestFullscreen;

  if (requestFullscreen) {
    try {
      await requestFullscreen.call(root);
      boxFullscreenFallbackActive = false;
      closeLauncher();
      updateFullscreenUi();
      return;
    } catch (error) {
      // Some mobile browsers expose the API but reject page-level fullscreen.
      // Fall back to a layout-safe immersive mode.
    }
  }

  enterFullscreenFallback();
}

async function exitBoxFullscreen() {
  const nativeElement = getNativeFullscreenElement();
  const exitFullscreen =
    document.exitFullscreen ||
    document.webkitExitFullscreen;

  if (nativeElement && exitFullscreen) {
    try {
      await exitFullscreen.call(document);
    } catch (error) {
      // Continue cleaning up our local state below.
    }
  }

  boxFullscreenFallbackActive = false;
  updateFullscreenUi();
}

async function toggleBoxFullscreen() {
  if (isFullscreenActive()) {
    await exitBoxFullscreen();
  } else {
    await enterBoxFullscreen();
  }
}

function handleFullscreenChange() {
  // Escape/F11/system gestures can end native fullscreen without our button.
  if (!getNativeFullscreenElement()) {
    document.documentElement.classList.remove("box-native-fullscreen");
  }
  updateFullscreenUi();
}



const COMMAND_PALETTE_APPS = [
  { app: "dashboard", icon: "⌂", label: "Home", keywords: "dashboard today home command center" },
  { app: "tasks", icon: "✓", label: "Tasks", keywords: "tasks todo work checklist kanban" },
  { app: "calendar", icon: "◫", label: "Calendar", keywords: "calendar events dates schedule" },
  { app: "notes", icon: "✎", label: "Notes", keywords: "notes sticky writing" },
  { app: "journal", icon: "☷", label: "Journal", keywords: "journal diary reflection writing" },
  { app: "ourspace", icon: "♥", label: "Our Space", keywords: "plans memories partner dates trips" },
  { app: "documents", icon: "▱", label: "Document Vault", keywords: "files documents vault storage compliance" },
  { app: "projects", icon: "◆", label: "Projects", keywords: "projects outcomes grouped tasks" },
  { app: "favorites", icon: "★", label: "Favorites", keywords: "favorites pinned sticky important" },
  { app: "routines", icon: "↻", label: "Routines", keywords: "routines recurring habits repeat schedule consistency" },
  { app: "goals", icon: "◎", label: "Goals", keywords: "goals milestones outcomes targets progress" },
  { app: "agenda", icon: "≡", label: "Agenda", keywords: "agenda timeline schedule due dates deadlines events plans" },
  { app: "today", icon: "☀", label: "Today", keywords: "today daily planner agenda priorities focus" },
  { app: "weeklyreview", icon: "◷", label: "Weekly Review", keywords: "weekly review planning recap wins overdue upcoming" },
  { app: "workspaces", icon: "▦", label: "Workspaces", keywords: "workspaces personal pharmacy clinic sk contexts" },
  { app: "activity", icon: "↺", label: "Activity", keywords: "activity timeline history recent changes" },
  { app: "finance", icon: "₱", label: "Finance", keywords: "finance income expenses money" },
  { app: "focus", icon: "◉", label: "Focus", keywords: "focus timer pomodoro" },
  { app: "assistant", icon: "◇", label: "Assistant", keywords: "assistant helper" },
  { app: "templates", icon: "▤", label: "Templates", keywords: "templates compliance reusable" },
  { app: "reminders", icon: "♢", label: "Reminders", keywords: "reminders alerts due expiry" },
  { app: "backup", icon: "↥", label: "Backup", keywords: "backup restore export recovery" },
  { app: "pharmacy", icon: "Rx", label: "Pharmacy", keywords: "pharmacy workspace medicine" },
  { app: "clinic", icon: "+", label: "Clinic", keywords: "clinic workspace" },
  { app: "sk", icon: "SK", label: "SK", keywords: "sk barangay youth workspace" }
];

function isCommandPaletteOpen() {
  return $("commandPaletteOverlay")?.classList.contains("open");
}

function getCommandPaletteActions() {
  return [
    {
      key: "action-quick-capture",
      type: "action",
      icon: "＋",
      title: "Quick Capture",
      description: "Capture a Task, Note, Event, Journal entry, or Our Space plan",
      keywords: "new capture add inbox",
      run: () => openQuickCapture()
    },
    {
      key: "action-new-routine",
      type: "action",
      icon: "↻",
      title: "New Routine",
      description: "Create a recurring plan that generates today’s Task",
      keywords: "routine recurring habit repeat schedule new",
      run: () => {
        openApp("routines");
        resetRoutineEditor();
      }
    },
    {
      key: "action-new-goal",
      type: "action",
      icon: "◎",
      title: "New Goal",
      description: "Create a goal and connect Projects, Tasks, and milestones",
      keywords: "goal milestone outcome target new",
      run: () => {
        openApp("goals");
        resetGoalEditor();
      }
    },
    {
      key: "action-agenda",
      type: "action",
      icon: "≡",
      title: "Open Agenda",
      description: "View overdue work and upcoming tasks, events, plans, and Vault deadlines",
      keywords: "agenda schedule dates deadlines upcoming overdue",
      run: () => openApp("agenda")
    },
    {
      key: "action-today",
      type: "action",
      icon: "☀",
      title: "Open Today",
      description: "See overdue work, today's schedule, priorities, and what comes next",
      keywords: "today daily planner agenda priorities focus",
      run: () => openApp("today")
    },
    {
      key: "action-weekly-review",
      type: "action",
      icon: "◷",
      title: "Open Weekly Review",
      description: "Review wins, overdue work, projects, finance, and the next 7 days",
      keywords: "weekly review planning recap wins overdue upcoming",
      run: () => openApp("weeklyreview")
    },
    {
      key: "action-workspaces",
      type: "action",
      icon: "▦",
      title: "Open Workspaces",
      description: "Switch between Personal, Pharmacy, Clinic, and SK",
      keywords: "workspaces contexts personal pharmacy clinic sk",
      run: () => openApp("workspaces")
    },
    {
      key: "action-new-task",
      type: "action",
      icon: "✓",
      title: "New Task",
      description: "Open the Task Composer",
      keywords: "task todo add new",
      run: () => {
        openApp("tasks");
        openTaskModal({ text: "", workspace: "personal", priority: "normal" }, "command");
      }
    },
    {
      key: "action-new-note",
      type: "action",
      icon: "✎",
      title: "New Note",
      description: "Create a blank note",
      keywords: "note sticky writing add new",
      run: () => {
        openApp("notes");
        createNewNoteItem();
      }
    },
    {
      key: "action-new-journal",
      type: "action",
      icon: "☷",
      title: "New Journal Entry",
      description: "Start writing today's journal entry",
      keywords: "journal diary reflection add new",
      run: () => {
        openApp("journal");
        newJournalEntry();
      }
    },
    {
      key: "action-new-plan",
      type: "action",
      icon: "♥",
      title: "New Our Space Plan",
      description: "Start a new shared plan",
      keywords: "our space plan date trip memory add new",
      run: () => {
        openApp("ourspace");
        resetOurSpaceEditor();
        $("ourSpaceTitle").focus();
      }
    },
    {
      key: "action-theme",
      type: "action",
      icon: "☾",
      title: "Toggle Theme",
      description: "Switch between dark and light appearance",
      keywords: "theme dark light appearance",
      run: () => $("themeButton").click()
    },
    {
      key: "action-fullscreen",
      type: "action",
      icon: "⛶",
      title: "Toggle Full Screen",
      description: "Enter or exit The Box full-screen workspace",
      keywords: "fullscreen full screen immersive",
      run: () => toggleBoxFullscreen()
    },
    {
      key: "action-reminders",
      type: "action",
      icon: "♢",
      title: "Open Reminders",
      description: "Review upcoming task, event, and document reminders",
      keywords: "reminders alerts notifications",
      run: () => openApp("reminders")
    }
  ];
}

function getCommandPaletteContentItems() {
  const items = [];

  tasks.forEach((task) => {
    items.push({
      key: `task-${task.id}`,
      type: "task",
      icon: task.completed ? "✓" : "○",
      title: task.text || "Untitled task",
      description: [
        task.project ? `◆ ${task.project}` : "",
        task.workspace || "personal",
        task.dueDate ? getDashboardTaskDueLabel(task) : ""
      ].filter(Boolean).join(" · "),
      keywords: `${task.text || ""} ${task.details || ""} ${task.project || ""} ${(task.tags || []).join(" ")}`,
      run: () => {
        openApp("tasks");
        openTaskModal(task, "tasks", task.id);
      }
    });
  });

  events.forEach((eventItem) => {
    items.push({
      key: `event-${eventItem.id}`,
      type: "event",
      icon: "◫",
      title: eventItem.title || "Untitled event",
      description: [
        eventItem.date ? formatTaskDate(eventItem.date) : "",
        eventItem.workspace || "personal"
      ].filter(Boolean).join(" · "),
      keywords: `${eventItem.title || ""} ${eventItem.workspace || ""} ${eventItem.date || ""}`,
      run: () => {
        if (eventItem.date) {
          const date = new Date(`${eventItem.date}T00:00:00`);
          shownMonth = date.getMonth();
          shownYear = date.getFullYear();
        }
        openApp("calendar");
        renderCalendar();
        renderEvents();
      }
    });
  });

  noteItems.forEach((note) => {
    items.push({
      key: `note-${note.id}`,
      type: "note",
      icon: note.sticky ? "★" : "✎",
      title: note.title || "Untitled note",
      description: getNotePreview(note, 90),
      keywords: `${note.title || ""} ${note.content || ""}`,
      run: () => {
        openApp("notes");
        selectNoteItem(note.id);
      }
    });
  });

  journalEntries.forEach((entry) => {
    items.push({
      key: `journal-${entry.id}`,
      type: "journal",
      icon: entry.favorite ? "★" : "☷",
      title: entry.title || "Untitled journal entry",
      description: formatJournalDate(entry.entry_date),
      keywords: `${entry.title || ""} ${entry.content || ""} ${(entry.tags || []).join(" ")}`,
      run: () => {
        openApp("journal");
        selectJournalEntry(entry.id, { bypassDirtyCheck: true });
      }
    });
  });

  ourSpacePlans.forEach((plan) => {
    items.push({
      key: `ourspace-${plan.id}`,
      type: "ourspace",
      icon: getOurSpaceCategoryIcon(plan.category),
      title: plan.title || "Untitled plan",
      description: [
        plan.category || "Other",
        getOurSpaceStatusLabel(plan.status),
        plan.place || ""
      ].filter(Boolean).join(" · "),
      keywords: `${plan.title || ""} ${plan.notes || ""} ${plan.favorite_memory || ""} ${plan.place || ""}`,
      run: () => {
        openApp("ourspace");
        selectOurSpacePlan(plan.id);
      }
    });
  });

  documents
    .filter((documentItem) => !documentItem.deleted_at)
    .forEach((documentItem) => {
      items.push({
        key: `file-${documentItem.id}`,
        type: "file",
        icon: getDocumentTypeLabel(documentItem),
        title: documentItem.name || "Untitled file",
        description: [
          documentItem.folder || "Documents",
          formatBytes(Number(documentItem.size_bytes || 0))
        ].filter(Boolean).join(" · "),
        keywords: `${documentItem.name || ""} ${documentItem.folder || ""} ${documentItem.details || ""} ${(getDocumentTags(documentItem) || []).join(" ")}`,
        run: () => {
          openApp("documents");
          openDocumentPreview(documentItem);
        }
      });
    });

  routines.forEach((routine) => {
    const today = getLocalDateKey();
    const dueToday = isRoutineScheduledOnDate(routine, today);
    const todayTask = dueToday ? getRoutineTaskForDate(routine, today) : null;
    items.push({
      key: `routine-${routine.id}`,
      type: "routine",
      icon: "↻",
      title: routine.title || "Untitled routine",
      description: `${getRoutineScheduleLabel(routine)} · ${routine.workspace}${dueToday ? todayTask?.completed ? " · Done today" : " · Due today" : ""}`,
      keywords: `${routine.title || ""} ${routine.details || ""} ${routine.project || ""} ${routine.workspace || ""} ${getRoutineScheduleLabel(routine)}`,
      run: () => {
        openApp("routines");
        selectRoutine(routine.id);
      }
    });
  });

  goals.forEach((goal) => {
    const status = getGoalDerivedStatus(goal);
    const progress = getGoalProgress(goal);
    items.push({
      key: `goal-${goal.id}`,
      type: "goal",
      icon: "◎",
      title: goal.title || "Untitled goal",
      description: `${getGoalStatusLabel(status)} · ${progress}%${goal.targetDate ? ` · ${formatGoalTargetDate(goal.targetDate)}` : ""}`,
      keywords: `${goal.title || ""} ${goal.description || ""} ${goal.workspace || ""} ${(goal.linkedProjects || []).join(" ")} ${(goal.milestones || []).map((item) => item.text).join(" ")}`,
      run: () => {
        openApp("goals");
        selectGoal(goal.id);
      }
    });
  });

  getProjectRecords().forEach((project) => {
    items.push({
      key: `project-${project.key}`,
      type: "project",
      icon: "◆",
      title: project.name,
      description: `${project.open} open · ${project.progress}% complete`,
      keywords: `${project.name} ${project.tasks.map((task) => task.text).join(" ")}`,
      run: () => {
        selectedProjectName = project.name;
        openApp("projects");
        renderProjectsHub();
      }
    });
  });

  financeEntries.forEach((entry) => {
    items.push({
      key: `finance-${entry.id}`,
      type: "finance",
      icon: entry.type === "income" ? "＋" : "−",
      title: entry.description || "Finance entry",
      description: `${entry.workspace || "personal"} · ${formatMoney(entry.amount)}`,
      keywords: `${entry.description || ""} ${entry.workspace || ""} ${entry.type || ""}`,
      run: () => openApp("finance")
    });
  });

  return items;
}

function getCommandPaletteTypeLabel(type) {
  return {
    app: "App",
    action: "Action",
    task: "Task",
    goal: "Goal",
    routine: "Routine",
    event: "Event",
    note: "Note",
    journal: "Journal",
    ourspace: "Our Space",
    file: "File",
    project: "Project",
    goal: "Goal",
    routine: "Routine",
    finance: "Finance"
  }[type] || "Result";
}

function getCommandPaletteItems(query = "") {
  const normalizedQuery = String(query || "").trim().toLocaleLowerCase();

  const apps = COMMAND_PALETTE_APPS
    .filter((app) => document.querySelector(`[data-app-window="${app.app}"]`))
    .map((app) => ({
      key: `app-${app.app}`,
      type: "app",
      icon: app.icon,
      title: app.label,
      description: "Open app",
      keywords: `${app.label} ${app.keywords}`,
      run: () => openApp(app.app)
    }));

  const actions = getCommandPaletteActions();
  const content = getCommandPaletteContentItems();

  const source = normalizedQuery
    ? [...actions, ...apps, ...content]
    : [...actions.slice(0, 5), ...apps.slice(0, 10)];

  if (!normalizedQuery) return source.slice(0, 18);

  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);

  return source
    .map((item) => {
      const haystack =
        `${item.title} ${item.description || ""} ${item.keywords || ""} ${getCommandPaletteTypeLabel(item.type)}`
          .toLocaleLowerCase();

      let score = 0;
      tokens.forEach((token) => {
        if (item.title.toLocaleLowerCase().startsWith(token)) score += 14;
        else if (item.title.toLocaleLowerCase().includes(token)) score += 9;
        if (haystack.includes(token)) score += 3;
      });

      if (item.type === "action") score += 2;
      if (item.type === "app") score += 1;

      return { item, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item)
    .slice(0, 36);
}

function renderCommandPalette() {
  const results = $("commandPaletteResults");
  if (!results) return;

  const query = $("commandPaletteInput").value;
  commandPaletteLastQuery = query;
  commandPaletteItems = getCommandPaletteItems(query);

  if (commandPaletteActiveIndex >= commandPaletteItems.length) {
    commandPaletteActiveIndex = Math.max(0, commandPaletteItems.length - 1);
  }

  $("commandPaletteSummary").textContent = query.trim()
    ? `${commandPaletteItems.length} result${commandPaletteItems.length === 1 ? "" : "s"}`
    : "Apps, actions, and your content.";

  if (!commandPaletteItems.length) {
    results.innerHTML = `
      <div class="command-palette-empty">
        <span>⌕</span>
        <strong>No matches</strong>
        <p>Try another app, task, note, project, file, or action.</p>
      </div>
    `;
    return;
  }

  results.innerHTML = commandPaletteItems.map((item, index) => `
    <button class="command-palette-result ${index === commandPaletteActiveIndex ? "active" : ""}"
      type="button"
      role="option"
      aria-selected="${index === commandPaletteActiveIndex ? "true" : "false"}"
      data-command-index="${index}">
      <span class="command-result-icon">${escapeHtml(item.icon || "◇")}</span>
      <span class="command-result-copy">
        <small>${escapeHtml(getCommandPaletteTypeLabel(item.type))}</small>
        <strong>${escapeHtml(item.title)}</strong>
        <p>${escapeHtml(item.description || "Open")}</p>
      </span>
      <span class="command-result-enter" aria-hidden="true">↵</span>
    </button>
  `).join("");

  results.querySelectorAll("[data-command-index]").forEach((button) => {
    button.addEventListener("pointerenter", () => {
      commandPaletteActiveIndex = Number(button.dataset.commandIndex) || 0;
      renderCommandPalette();
    });
    button.addEventListener("click", () => {
      runCommandPaletteItem(Number(button.dataset.commandIndex) || 0);
    });
  });

  const active = results.querySelector(".command-palette-result.active");
  active?.scrollIntoView({ block: "nearest" });
}

function openCommandPalette(initialQuery = "") {
  closeLauncher();

  const overlay = $("commandPaletteOverlay");
  overlay.classList.add("open");
  overlay.setAttribute("aria-hidden", "false");
  document.documentElement.classList.add("command-palette-open");

  $("commandPaletteInput").value = String(initialQuery || "");
  commandPaletteActiveIndex = 0;
  renderCommandPalette();

  window.setTimeout(() => {
    $("commandPaletteInput").focus();
    $("commandPaletteInput").select();
  }, 30);

  if (window.BoxCloud?.isReady() && !documents.length && !documentsLoading) {
    loadDocuments({ silent: true }).then(() => {
      if (isCommandPaletteOpen()) renderCommandPalette();
    });
  }
}

function closeCommandPalette() {
  $("commandPaletteOverlay").classList.remove("open");
  $("commandPaletteOverlay").setAttribute("aria-hidden", "true");
  document.documentElement.classList.remove("command-palette-open");
  $("globalSearch").value = "";
}

function runCommandPaletteItem(index = commandPaletteActiveIndex) {
  const item = commandPaletteItems[index];
  if (!item) return;
  closeCommandPalette();
  item.run();
}

function moveCommandPaletteSelection(direction) {
  if (!commandPaletteItems.length) return;
  commandPaletteActiveIndex =
    (commandPaletteActiveIndex + direction + commandPaletteItems.length) %
    commandPaletteItems.length;
  renderCommandPalette();
}

function getQuickCaptureFirstLine(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || "";
}

function getQuickCaptureRemainder(text) {
  const lines = String(text || "").split(/\r?\n/);
  const firstNonEmptyIndex = lines.findIndex((line) => line.trim());
  if (firstNonEmptyIndex < 0) return "";
  return lines
    .slice(firstNonEmptyIndex + 1)
    .join("\n")
    .trim();
}

function getQuickCaptureAutoTitle(text, fallback = "Untitled") {
  const firstLine = getQuickCaptureFirstLine(text);
  if (!firstLine) return fallback;
  return firstLine.length > 100 ? `${firstLine.slice(0, 99)}…` : firstLine;
}

function setQuickCaptureDestination(destination) {
  const allowed = new Set(["task", "note", "event", "journal", "ourspace"]);
  quickCaptureDestination = allowed.has(destination) ? destination : "task";

  document.querySelectorAll("[data-capture-destination]").forEach((button) => {
    const active = button.dataset.captureDestination === quickCaptureDestination;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });

  document.querySelectorAll("[data-capture-for]").forEach((group) => {
    const destinations = String(group.dataset.captureFor || "").split(/\s+/);
    group.classList.toggle("hidden", !destinations.includes(quickCaptureDestination));
  });

  const dateLabel = $("quickCaptureDateLabel");
  const dateInput = $("quickCaptureDate");
  const saveButton = $("saveQuickCaptureButton");

  const labels = {
    task: "Save task",
    note: "Save note",
    event: "Save event",
    journal: "Save journal entry",
    ourspace: "Save plan"
  };
  saveButton.textContent = labels[quickCaptureDestination];

  if (quickCaptureDestination === "event") {
    dateLabel.innerHTML = "Event date <small>Required</small>";
    dateInput.required = true;
  } else if (quickCaptureDestination === "journal") {
    dateLabel.innerHTML = "Journal date";
    dateInput.required = false;
    if (!dateInput.value) dateInput.value = getLocalDateKey();
  } else if (quickCaptureDestination === "ourspace") {
    dateLabel.innerHTML = "Target date <small>Optional</small>";
    dateInput.required = false;
  } else {
    dateLabel.innerHTML = "Due date <small>Optional</small>";
    dateInput.required = false;
  }
}

function resetQuickCaptureForm() {
  $("quickCaptureForm").reset();
  $("quickCaptureWorkspace").value = "personal";
  $("quickCapturePriority").value = "normal";
  $("quickCaptureProject").value = "";
  $("quickCaptureOurSpaceCategory").value = "Date";
  setQuickCaptureDestination("task");
}

function openQuickCapture(destination = "task") {
  closeLauncher();
  resetQuickCaptureForm();
  setQuickCaptureDestination(destination);
  $("quickCaptureOverlay").classList.add("open");
  $("quickCaptureOverlay").setAttribute("aria-hidden", "false");
  document.documentElement.classList.add("quick-capture-open");
  window.setTimeout(() => $("quickCaptureText").focus(), 40);
}

function closeQuickCapture() {
  $("quickCaptureOverlay").classList.remove("open");
  $("quickCaptureOverlay").setAttribute("aria-hidden", "true");
  document.documentElement.classList.remove("quick-capture-open");
}

async function saveQuickCapture() {
  const text = $("quickCaptureText").value.trim();
  if (!text) {
    showToast("Write something first");
    $("quickCaptureText").focus();
    return false;
  }

  const firstLine = getQuickCaptureFirstLine(text);
  const remainder = getQuickCaptureRemainder(text);
  const date = $("quickCaptureDate").value;
  const workspace = $("quickCaptureWorkspace").value;

  if (quickCaptureDestination === "task") {
    const saved = createTask({
      text: firstLine || text,
      details: remainder,
      dueDate: date,
      workspace,
      priority: $("quickCapturePriority").value,
      project: $("quickCaptureProject").value,
      status: "todo",
      tags: ["quick-capture"],
      subtasks: [],
      recurrence: { type: "none", days: [] }
    });
    if (!saved) return false;
    showToast("Task captured");
    return true;
  }

  if (quickCaptureDestination === "note") {
    const now = new Date().toISOString();
    const note = normalizeNoteItem({
      id: createNoteItemId(),
      title: getQuickCaptureAutoTitle(text, "Quick Note"),
      content: text,
      sticky: $("quickCaptureSticky").checked,
      createdAt: now,
      updatedAt: now
    });
    noteItems.unshift(note);
    selectedNoteId = note.id;
    persistNoteItems();
    renderNotesCenter();
    renderDashboard();
    showToast(note.sticky ? "Sticky Note captured" : "Note captured");
    return true;
  }

  if (quickCaptureDestination === "event") {
    if (!date) {
      showToast("Choose an event date");
      $("quickCaptureDate").focus();
      return false;
    }
    events.unshift({
      id: Date.now() + Math.random(),
      title: firstLine || text,
      date,
      workspace
    });
    saveJSON(STORAGE.events, events);
    renderAll();
    showToast("Event captured");
    return true;
  }

  if (quickCaptureDestination === "journal") {
    const now = new Date().toISOString();
    const entry = normalizeJournalEntry({
      id: createJournalEntryId(),
      entry_date: date || getJournalToday(),
      entry_time: "",
      title: getQuickCaptureAutoTitle(text, "Journal entry"),
      content: text,
      mood: "",
      tags: ["quick-capture"],
      favorite: $("quickCaptureFavorite").checked,
      created_at: now,
      updated_at: now
    });

    journalEntries.unshift(entry);
    persistJournalEntries({ pendingCloudSync: !window.BoxCloud?.isReady() });
    renderJournalCenter();

    if (window.BoxCloud?.isReady() && window.BoxCloud.saveJournalEntry) {
      const result = await window.BoxCloud.saveJournalEntry(entry);
      if (result?.error) {
        localStorage.setItem(STORAGE.journalPendingSync, "1");
        showToast("Journal captured locally · sync pending");
        return true;
      }
    }

    showToast("Journal entry captured");
    return true;
  }

  if (quickCaptureDestination === "ourspace") {
    const now = new Date().toISOString();
    const plan = normalizeOurSpacePlan({
      id: createOurSpaceId(),
      title: firstLine || text,
      category: $("quickCaptureOurSpaceCategory").value,
      status: date ? "scheduled" : "idea",
      target_date: date,
      place: "",
      estimated_budget: null,
      notes: remainder,
      checklist: [],
      links: [],
      attachments: [],
      favorite: false,
      priority: "medium",
      actual_date: "",
      favorite_memory: "",
      actual_budget: null,
      rating: null,
      created_at: now,
      updated_at: now
    });

    ourSpacePlans.unshift(plan);
    persistOurSpacePlans({ pendingCloudSync: !window.BoxCloud?.isReady() });
    renderOurSpaceCenter();

    if (window.BoxCloud?.isReady() && window.BoxCloud.saveOurSpacePlan) {
      const result = await window.BoxCloud.saveOurSpacePlan(plan);
      if (result?.error) {
        localStorage.setItem(STORAGE.ourSpacePendingSync, "1");
        showToast("Plan captured locally · sync pending");
        return true;
      }
    }

    showToast("Our Space plan captured");
    return true;
  }

  return false;
}

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2400);
}

function normalizeTaskTags(value) {
  const source = Array.isArray(value) ? value : String(value || "").split(",");
  return Array.from(new Set(source
    .map((tag) => String(tag).trim().replace(/^#/, "").slice(0, 40))
    .filter(Boolean)))
    .slice(0, 20);
}

function normalizeTaskAttachment(value = {}) {
  const documentId = value.documentId || value.document_id || value.id || "";
  if (!documentId) return null;
  return {
    documentId: String(documentId),
    name: String(value.name || "Attached document").trim().slice(0, 240),
    folder: String(value.folder || "Documents").trim().slice(0, 80),
    mimeType: String(value.mimeType || value.mime_type || "").slice(0, 160),
    sizeBytes: Math.max(0, Number(value.sizeBytes ?? value.size_bytes) || 0)
  };
}

function normalizeTaskSubtasks(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      id: item?.id || `subtask-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      text: String(item?.text || item || "").trim().slice(0, 240),
      details: String(item?.details || "").trim().slice(0, 2000),
      completed: Boolean(item?.completed),
      attachments: Array.from(new Map(
        (Array.isArray(item?.attachments) ? item.attachments : [])
          .map(normalizeTaskAttachment)
          .filter(Boolean)
          .map((attachment) => [attachment.documentId, attachment])
      ).values()).slice(0, 20)
    }))
    .filter((item) => item.text)
    .slice(0, 50);
}

function normalizeTaskRecurrence(value) {
  const allowed = ["none", "daily", "weekdays", "weekly", "monthly", "custom"];
  const type = allowed.includes(value?.type) ? value.type : "none";
  const days = Array.isArray(value?.days)
    ? Array.from(new Set(value.days.map(Number).filter((day) => day >= 0 && day <= 6))).sort()
    : [];
  return { type, days };
}



function createRoutineId() {
  if (window.crypto?.randomUUID) return `routine-${window.crypto.randomUUID()}`;
  return `routine-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isRoutineCloudRecord(record) {
  return Boolean(record && typeof record === "object" && record.recordType === "routine");
}

function extractRoutineFromCloudRecord(record) {
  if (!isRoutineCloudRecord(record)) return record;
  return record.routine && typeof record.routine === "object" ? record.routine : record;
}

function normalizeRoutineDays(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value.map(Number).filter((day) => day >= 0 && day <= 6)
  )).sort();
}

function normalizeRoutine(routine = {}) {
  const now = new Date().toISOString();
  const scheduleType = ["daily", "weekdays", "weekly", "custom"].includes(routine.scheduleType || routine.schedule_type)
    ? (routine.scheduleType || routine.schedule_type)
    : "daily";
  let days = normalizeRoutineDays(routine.days);
  if (scheduleType === "weekly" && !days.length) days = [new Date().getDay()];
  if (scheduleType === "custom" && !days.length) days = [1, 2, 3, 4, 5];

  return {
    id: String(routine.id || createRoutineId()),
    title: String(routine.title || "Untitled routine").trim().slice(0, 180),
    workspace: ["personal", "pharmacy", "clinic", "sk"].includes(routine.workspace)
      ? routine.workspace
      : "personal",
    state: routine.state === "paused" ? "paused" : "active",
    scheduleType,
    days,
    preferredTime: /^\d{2}:\d{2}$/.test(routine.preferredTime || routine.preferred_time || "")
      ? String(routine.preferredTime || routine.preferred_time).slice(0, 5)
      : "",
    startDate: /^\d{4}-\d{2}-\d{2}$/.test(routine.startDate || routine.start_date || "")
      ? String(routine.startDate || routine.start_date).slice(0, 10)
      : getLocalDateKey(),
    priority: ["normal", "important", "urgent"].includes(routine.priority)
      ? routine.priority
      : "normal",
    project: String(routine.project || "").trim().replace(/\s+/g, " ").slice(0, 80),
    details: String(routine.details || "").slice(0, 5000),
    createdAt: routine.createdAt || routine.created_at || now,
    updatedAt: routine.updatedAt || routine.updated_at || routine.createdAt || routine.created_at || now
  };
}

function normalizeRoutines(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value
    .map(normalizeRoutine)
    .filter((routine) => {
      if (!routine.id || seen.has(routine.id)) return false;
      seen.add(routine.id);
      return true;
    })
    .slice(0, 500);
}

function routineToCloudRecord(routine) {
  const normalized = normalizeRoutine(routine);
  return {
    id: normalized.id,
    recordType: "routine",
    routine: normalized
  };
}

function getRoutineScheduleLabel(routine) {
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  if (routine.scheduleType === "daily") return "Daily";
  if (routine.scheduleType === "weekdays") return "Weekdays";
  if (routine.scheduleType === "weekly") {
    return `Weekly · ${dayNames[routine.days[0] ?? 1]}`;
  }
  return routine.days.length
    ? routine.days.map((day) => dayNames[day]).join(" · ")
    : "Custom";
}

function isRoutineScheduledOnDate(routine, dateKey) {
  if (routine.state !== "active") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey || "")) return false;
  if (routine.startDate && dateKey < routine.startDate) return false;

  const date = new Date(`${dateKey}T00:00:00`);
  const day = date.getDay();

  if (routine.scheduleType === "daily") return true;
  if (routine.scheduleType === "weekdays") return day >= 1 && day <= 5;
  if (routine.scheduleType === "weekly") return routine.days.includes(day);
  if (routine.scheduleType === "custom") return routine.days.includes(day);
  return false;
}

function getRoutineTaskId(routine, dateKey) {
  return `routine-task:${routine.id}:${dateKey}`;
}

function getRoutineTaskForDate(routine, dateKey = getLocalDateKey()) {
  const deterministicId = getRoutineTaskId(routine, dateKey);
  return tasks.find((task) =>
    String(task.id) === deterministicId ||
    (String(task.sourceRoutineId || "") === routine.id && task.routineDate === dateKey)
  ) || null;
}

function createRoutineTaskForDate(routine, dateKey, { save = true } = {}) {
  if (!isRoutineScheduledOnDate(routine, dateKey)) return null;

  const existing = getRoutineTaskForDate(routine, dateKey);
  if (existing) return existing;

  const timestamp = new Date().toISOString();
  const task = normalizeTask({
    id: getRoutineTaskId(routine, dateKey),
    text: routine.title,
    details: routine.details,
    dueDate: dateKey,
    workspace: routine.workspace,
    priority: routine.priority,
    project: routine.project,
    status: "todo",
    completed: false,
    tags: ["routine", routine.scheduleType],
    subtasks: [],
    recurrence: { type: "none", days: [] },
    sourceRoutineId: routine.id,
    routineDate: dateKey,
    createdAt: timestamp,
    updatedAt: timestamp
  });

  tasks.unshift(task);
  if (save) saveJSON(STORAGE.tasks, tasks);
  return task;
}

function ensureScheduledRoutineTasks({ silent = false } = {}) {
  const today = getLocalDateKey();
  let created = 0;

  routines.forEach((routine) => {
    if (!isRoutineScheduledOnDate(routine, today)) return;
    if (getRoutineTaskForDate(routine, today)) return;
    createRoutineTaskForDate(routine, today, { save: false });
    created += 1;
  });

  if (created) {
    saveJSON(STORAGE.tasks, tasks);
    if (!silent) {
      showToast(`${created} routine Task${created === 1 ? "" : "s"} prepared for today`);
    }
  }

  return created;
}

function getNextRoutineDate(routine, { afterToday = false, maxDays = 120 } = {}) {
  const start = new Date(`${getLocalDateKey()}T00:00:00`);
  if (afterToday) start.setDate(start.getDate() + 1);

  for (let offset = 0; offset <= maxDays; offset += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + offset);
    const key = getAgendaDateKey(date);
    if (isRoutineScheduledOnDate(routine, key)) return key;
  }

  return "";
}

function getRoutineCurrentStreak(routine) {
  const today = getLocalDateKey();
  let date = new Date(`${today}T00:00:00`);
  const todayTask = getRoutineTaskForDate(routine, today);

  if (isRoutineScheduledOnDate(routine, today) && (!todayTask || !todayTask.completed)) {
    date.setDate(date.getDate() - 1);
  }

  let streak = 0;
  let scheduledChecked = 0;

  for (let offset = 0; offset < 180 && scheduledChecked < 90; offset += 1) {
    const key = getAgendaDateKey(date);
    if (routine.startDate && key < routine.startDate) break;

    if (isRoutineScheduledOnDate(routine, key)) {
      scheduledChecked += 1;
      const task = getRoutineTaskForDate(routine, key);
      if (task?.completed) streak += 1;
      else break;
    }

    date.setDate(date.getDate() - 1);
  }

  return streak;
}

function getRoutineRecentScheduledDays(routine, limit = 7) {
  const rows = [];
  let date = new Date(`${getLocalDateKey()}T00:00:00`);

  for (let offset = 0; offset < 120 && rows.length < limit; offset += 1) {
    const key = getAgendaDateKey(date);
    if (routine.startDate && key < routine.startDate) break;

    if (isRoutineScheduledOnDate(routine, key)) {
      const task = getRoutineTaskForDate(routine, key);
      rows.push({
        date: key,
        completed: Boolean(task?.completed),
        exists: Boolean(task)
      });
    }

    date.setDate(date.getDate() - 1);
  }

  return rows;
}

function getFilteredRoutines() {
  const query = routineSearchTerm.toLocaleLowerCase();

  return [...routines]
    .filter((routine) => {
      if (routineWorkspaceFilter !== "all" && routine.workspace !== routineWorkspaceFilter) return false;
      if (routineStateFilter !== "all" && routine.state !== routineStateFilter) return false;
      if (query) {
        const haystack = `${routine.title} ${routine.details} ${routine.project} ${routine.workspace} ${getRoutineScheduleLabel(routine)}`
          .toLocaleLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (a.state !== b.state) return a.state === "active" ? -1 : 1;
      const aToday = isRoutineScheduledOnDate(a, getLocalDateKey()) ? 0 : 1;
      const bToday = isRoutineScheduledOnDate(b, getLocalDateKey()) ? 0 : 1;
      if (aToday !== bToday) return aToday - bToday;
      const aTime = a.preferredTime || "99:99";
      const bTime = b.preferredTime || "99:99";
      if (aTime !== bTime) return aTime.localeCompare(bTime);
      return a.title.localeCompare(b.title);
    });
}

function getSelectedRoutine() {
  return routines.find((routine) => routine.id === selectedRoutineId) || null;
}

function setRoutineDayControls(scheduleType, days = []) {
  const inputs = Array.from(document.querySelectorAll("[data-routine-day]"));

  inputs.forEach((input) => {
    const day = Number(input.dataset.routineDay);
    if (scheduleType === "daily") input.checked = true;
    else if (scheduleType === "weekdays") input.checked = day >= 1 && day <= 5;
    else input.checked = days.includes(day);

    input.disabled = ["daily", "weekdays"].includes(scheduleType);
  });

  $("routineDaysHint").textContent =
    scheduleType === "daily"
      ? "Daily routines run every day."
      : scheduleType === "weekdays"
        ? "Weekdays automatically run Monday through Friday."
        : scheduleType === "weekly"
          ? "Choose one day for this weekly routine."
          : "Choose one or more custom days.";
}

function getRoutineDayControlValues() {
  return Array.from(document.querySelectorAll("[data-routine-day]:checked"))
    .map((input) => Number(input.dataset.routineDay));
}

function resetRoutineEditor() {
  selectedRoutineId = null;
  $("routineForm").reset();
  $("routineWorkspace").value = "personal";
  $("routineState").value = "active";
  $("routineScheduleType").value = "daily";
  $("routinePriority").value = "normal";
  $("routineStartDate").value = getLocalDateKey();
  $("routineEditorMode").textContent = "NEW ROUTINE";
  $("routineEditorHeading").textContent = "Build a repeatable plan";
  $("deleteRoutineButton").disabled = true;
  setRoutineDayControls("daily", []);
  renderRoutineEditorSupport();
  renderRoutinesList();
  window.setTimeout(() => $("routineTitle")?.focus(), 20);
}

function selectRoutine(routineId) {
  const routine = routines.find((item) => item.id === routineId);
  if (!routine) return;

  selectedRoutineId = routine.id;
  $("routineTitle").value = routine.title;
  $("routineWorkspace").value = routine.workspace;
  $("routineState").value = routine.state;
  $("routineScheduleType").value = routine.scheduleType;
  $("routinePreferredTime").value = routine.preferredTime || "";
  $("routineStartDate").value = routine.startDate || getLocalDateKey();
  $("routinePriority").value = routine.priority;
  $("routineProject").value = routine.project || "";
  $("routineDetails").value = routine.details || "";
  $("routineEditorMode").textContent = "EDIT ROUTINE";
  $("routineEditorHeading").textContent = routine.title;
  $("deleteRoutineButton").disabled = false;

  setRoutineDayControls(routine.scheduleType, routine.days);
  renderRoutineEditorSupport();
  renderRoutinesList();
}

function getRoutineEditorDraft() {
  const scheduleType = $("routineScheduleType").value;
  let days = getRoutineDayControlValues();
  if (scheduleType === "daily") days = [0, 1, 2, 3, 4, 5, 6];
  if (scheduleType === "weekdays") days = [1, 2, 3, 4, 5];
  if (scheduleType === "weekly" && days.length > 1) days = [days[0]];

  return normalizeRoutine({
    id: selectedRoutineId || createRoutineId(),
    title: $("routineTitle").value.trim(),
    workspace: $("routineWorkspace").value,
    state: $("routineState").value,
    scheduleType,
    days,
    preferredTime: $("routinePreferredTime").value,
    startDate: $("routineStartDate").value || getLocalDateKey(),
    priority: $("routinePriority").value,
    project: $("routineProject").value.trim(),
    details: $("routineDetails").value.trim(),
    createdAt: getSelectedRoutine()?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

function renderRoutineProjectOptions() {
  const datalist = $("routineProjectOptions");
  if (!datalist) return;
  datalist.innerHTML = getProjectRecords()
    .map((project) => `<option value="${escapeHtml(project.name)}"></option>`)
    .join("");
}

function renderRoutineTodayCard() {
  const card = $("routineTodayTaskCard");
  if (!card) return;

  const routine = selectedRoutineId ? getSelectedRoutine() : null;
  if (!routine) {
    $("routineTodayBadge").textContent = "Not due today";
    $("routineTodayBadge").className = "routine-today-badge";
    $("routineStreakValue").textContent = "0-day streak";
    $("routineTodayTaskStatus").textContent = "No Task today";
    $("routineTodayTaskTitle").textContent = "Save this routine to activate today’s Task.";
    $("routineTodayTaskMeta").textContent = "Generated Tasks appear in Tasks, Today, Agenda, and Projects.";
    $("routineOpenTodayTaskButton").disabled = true;
    $("routineCompleteTodayButton").disabled = true;
    card.className = "routine-today-task-card empty";
    return;
  }

  const today = getLocalDateKey();
  const dueToday = isRoutineScheduledOnDate(routine, today);
  const task = getRoutineTaskForDate(routine, today);
  const streak = getRoutineCurrentStreak(routine);

  $("routineStreakValue").textContent = `${streak}-day streak`;

  if (!dueToday) {
    const next = getNextRoutineDate(routine);
    $("routineTodayBadge").textContent = "Not due today";
    $("routineTodayBadge").className = "routine-today-badge";
    $("routineTodayTaskStatus").textContent = next ? `Next · ${formatTaskDate(next)}` : "No upcoming date";
    $("routineTodayTaskTitle").textContent = routine.title;
    $("routineTodayTaskMeta").textContent = getRoutineScheduleLabel(routine);
    $("routineOpenTodayTaskButton").disabled = true;
    $("routineCompleteTodayButton").disabled = true;
    card.className = "routine-today-task-card";
    return;
  }

  $("routineTodayBadge").textContent = task?.completed ? "Done today" : "Due today";
  $("routineTodayBadge").className = `routine-today-badge ${task?.completed ? "done" : "due"}`;
  $("routineTodayTaskStatus").textContent = task?.completed ? "Completed" : "Open Task";
  $("routineTodayTaskTitle").textContent = routine.title;
  $("routineTodayTaskMeta").textContent = [
    routine.preferredTime ? `Preferred ${routine.preferredTime}` : "",
    routine.workspace,
    routine.project ? `◆ ${routine.project}` : ""
  ].filter(Boolean).join(" · ");
  $("routineOpenTodayTaskButton").disabled = !task;
  $("routineCompleteTodayButton").disabled = !task || task.completed;
  $("routineCompleteTodayButton").textContent = task?.completed ? "Completed" : "Complete Today";
  card.className = `routine-today-task-card ${task?.completed ? "done" : "due"}`;
}

function renderRoutineConsistency() {
  const list = $("routineConsistencyList");
  if (!list) return;

  const routine = selectedRoutineId ? getSelectedRoutine() : null;
  if (!routine) {
    list.innerHTML = "";
    $("routineConsistencySummary").textContent = "No history yet";
    return;
  }

  const rows = getRoutineRecentScheduledDays(routine, 7);
  const completed = rows.filter((row) => row.completed).length;
  $("routineConsistencySummary").textContent =
    rows.length ? `${completed}/${rows.length} completed` : "No scheduled history";

  list.innerHTML = rows.map((row) => `
    <div class="routine-consistency-day ${row.completed ? "done" : row.exists ? "open" : "missing"}">
      <strong>${escapeHtml(new Date(`${row.date}T00:00:00`).toLocaleDateString("en-PH", { weekday: "short" }))}</strong>
      <span>${escapeHtml(new Date(`${row.date}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric" }))}</span>
      <em>${row.completed ? "✓" : row.exists ? "○" : "–"}</em>
    </div>
  `).join("");
}

function renderRoutineEditorSupport() {
  renderRoutineProjectOptions();
  renderRoutineTodayCard();
  renderRoutineConsistency();
}

function renderRoutinesList() {
  const list = $("routinesList");
  if (!list) return;

  const visible = getFilteredRoutines();
  const today = getLocalDateKey();

  $("routinesVisibleCount").textContent = String(visible.length);
  $("routinesEmptyState").hidden = visible.length > 0;

  list.innerHTML = visible.map((routine) => {
    const dueToday = isRoutineScheduledOnDate(routine, today);
    const task = dueToday ? getRoutineTaskForDate(routine, today) : null;
    const streak = getRoutineCurrentStreak(routine);
    const stateLabel = routine.state === "paused"
      ? "Paused"
      : task?.completed
        ? "Done today"
        : dueToday
          ? "Due today"
          : "Active";

    return `
      <button class="routine-list-card ${routine.id === selectedRoutineId ? "active" : ""} ${routine.state}"
        type="button" data-routine-id="${escapeHtml(routine.id)}">
        <span class="routine-list-icon">↻</span>
        <span class="routine-list-copy">
          <small>${escapeHtml(routine.workspace)} · ${escapeHtml(stateLabel)}</small>
          <strong>${escapeHtml(routine.title)}</strong>
          <span>${escapeHtml(getRoutineScheduleLabel(routine))}${routine.preferredTime ? ` · ${escapeHtml(routine.preferredTime)}` : ""}</span>
        </span>
        <span class="routine-list-streak">${streak}d</span>
      </button>
    `;
  }).join("");

  list.querySelectorAll("[data-routine-id]").forEach((button) => {
    button.addEventListener("click", () => selectRoutine(button.dataset.routineId));
  });
}

function renderRoutinesHub() {
  if (!$("routinesList")) return;

  const today = getLocalDateKey();
  const active = routines.filter((routine) => routine.state === "active");
  const dueToday = active.filter((routine) => isRoutineScheduledOnDate(routine, today));
  const doneToday = dueToday.filter((routine) => getRoutineTaskForDate(routine, today)?.completed);
  const bestStreak = active.reduce(
    (max, routine) => Math.max(max, getRoutineCurrentStreak(routine)),
    0
  );

  $("routinesActiveCount").textContent = String(active.length);
  $("routinesDueTodayCount").textContent = String(dueToday.length);
  $("routinesDoneTodayCount").textContent = String(doneToday.length);
  $("routinesBestStreak").textContent = String(bestStreak);
  $("routinesSearchInput").value = routineSearchTerm;
  $("routinesWorkspaceFilter").value = routineWorkspaceFilter;
  $("routinesStateFilter").value = routineStateFilter;

  renderRoutinesList();
  renderRoutineEditorSupport();
}

function saveRoutineFromEditor() {
  const title = $("routineTitle").value.trim();
  if (!title) {
    showToast("Enter a routine title");
    $("routineTitle").focus();
    return false;
  }

  const draft = getRoutineEditorDraft();
  if (["weekly", "custom"].includes(draft.scheduleType) && !draft.days.length) {
    showToast("Choose at least one routine day");
    return false;
  }

  const existingIndex = routines.findIndex((routine) => routine.id === selectedRoutineId);
  if (existingIndex >= 0) {
    draft.createdAt = routines[existingIndex].createdAt;
    routines[existingIndex] = draft;
  } else {
    routines.unshift(draft);
  }

  selectedRoutineId = draft.id;
  saveJSON(STORAGE.tasks, tasks);
  ensureScheduledRoutineTasks({ silent: true });
  renderAll();
  selectRoutine(draft.id);
  showToast(existingIndex >= 0 ? "Routine updated" : "Routine created");
  return true;
}

function deleteSelectedRoutine() {
  const routine = getSelectedRoutine();
  if (!routine) return;

  if (!window.confirm(
    `Delete routine “${routine.title}”? Existing generated Tasks will be kept.`
  )) return;

  routines = routines.filter((item) => item.id !== routine.id);
  saveJSON(STORAGE.tasks, tasks);
  resetRoutineEditor();
  renderAll();
  showToast("Routine deleted; existing Tasks were kept");
}

function openSelectedRoutineTodayTask() {
  const routine = getSelectedRoutine();
  if (!routine) return;
  const task = getRoutineTaskForDate(routine, getLocalDateKey());
  if (!task) return;

  openApp("tasks");
  openTaskModal(task, "routines", task.id);
}

function completeSelectedRoutineToday() {
  const routine = getSelectedRoutine();
  if (!routine) return;

  let task = getRoutineTaskForDate(routine, getLocalDateKey());
  if (!task && isRoutineScheduledOnDate(routine, getLocalDateKey())) {
    task = createRoutineTaskForDate(routine, getLocalDateKey());
  }
  if (!task || task.completed) return;

  setTaskStatus(task, "done");
  renderRoutinesHub();
  showToast("Routine completed for today");
}

function getWeeklyRoutineStats(routine) {
  const { start, end } = getWeeklyReviewBounds();
  let scheduled = 0;
  let completed = 0;
  const cursor = new Date(start);

  while (cursor <= end) {
    const key = getAgendaDateKey(cursor);
    if (isRoutineScheduledOnDate(routine, key)) {
      scheduled += 1;
      if (getRoutineTaskForDate(routine, key)?.completed) completed += 1;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return { scheduled, completed };
}

function createGoalId() {
  if (window.crypto?.randomUUID) return `goal-${window.crypto.randomUUID()}`;
  return `goal-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isGoalCloudRecord(record) {
  return Boolean(record && typeof record === "object" && record.recordType === "goal");
}

function extractGoalFromCloudRecord(record) {
  if (!isGoalCloudRecord(record)) return record;
  return record.goal && typeof record.goal === "object" ? record.goal : record;
}

function normalizeGoalMilestones(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value
    .map((item, index) => {
      const id = String(item?.id || `milestone-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`);
      return {
        id,
        text: String(item?.text || "").trim().slice(0, 180),
        targetDate: /^\d{4}-\d{2}-\d{2}$/.test(item?.targetDate || item?.target_date || "")
          ? String(item.targetDate || item.target_date).slice(0, 10)
          : "",
        completed: Boolean(item?.completed)
      };
    })
    .filter((item) => {
      if (!item.text || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .slice(0, 80);
}

function normalizeGoal(goal = {}) {
  const now = new Date().toISOString();
  const baseStatus = ["active", "paused", "completed"].includes(goal.baseStatus || goal.status)
    ? (goal.baseStatus || goal.status)
    : "active";
  const workspace = ["personal", "pharmacy", "clinic", "sk"].includes(goal.workspace)
    ? goal.workspace
    : "personal";
  const linkedProjects = Array.from(new Set(
    (Array.isArray(goal.linkedProjects) ? goal.linkedProjects : [])
      .map((item) => String(item || "").trim().replace(/\s+/g, " ").slice(0, 80))
      .filter(Boolean)
  )).slice(0, 50);
  const linkedTaskIds = Array.from(new Set(
    (Array.isArray(goal.linkedTaskIds) ? goal.linkedTaskIds : [])
      .map((item) => String(item || "").trim())
      .filter(Boolean)
  )).slice(0, 200);

  return {
    id: String(goal.id || createGoalId()),
    title: String(goal.title || "Untitled goal").trim().slice(0, 180),
    workspace,
    targetDate: /^\d{4}-\d{2}-\d{2}$/.test(goal.targetDate || goal.target_date || "")
      ? String(goal.targetDate || goal.target_date).slice(0, 10)
      : "",
    baseStatus,
    priority: goal.priority === "high" ? "high" : "normal",
    description: String(goal.description || "").slice(0, 12000),
    linkedProjects,
    linkedTaskIds,
    milestones: normalizeGoalMilestones(goal.milestones),
    createdAt: goal.createdAt || goal.created_at || now,
    updatedAt: goal.updatedAt || goal.updated_at || goal.createdAt || goal.created_at || now
  };
}

function normalizeGoals(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value
    .map(normalizeGoal)
    .filter((goal) => {
      if (!goal.id || seen.has(goal.id)) return false;
      seen.add(goal.id);
      return true;
    })
    .slice(0, 500);
}

function goalToCloudRecord(goal) {
  const normalized = normalizeGoal(goal);
  return {
    id: normalized.id,
    recordType: "goal",
    goal: normalized
  };
}

function getTaskGoalCloudRecords(taskItems = tasks, goalItems = goals, routineItems = routines) {
  return [
    ...taskItems.map((task) => ({ ...task })),
    ...normalizeGoals(goalItems).map(goalToCloudRecord),
    ...normalizeRoutines(routineItems).map(routineToCloudRecord)
  ];
}

function writeTaskGoalLocalRecords() {
  localStorage.setItem(
    STORAGE.tasks,
    JSON.stringify(getTaskGoalCloudRecords(tasks, goals))
  );
}

function persistGoals() {
  goals = normalizeGoals(goals);
  saveJSON(STORAGE.tasks, tasks);
}

function getGoalLinkedTasks(goal) {
  const linkedIds = new Set((goal.linkedTaskIds || []).map(String));
  const linkedProjects = new Set(goal.linkedProjects || []);

  const seen = new Set();
  return tasks.filter((task) => {
    const matches =
      linkedIds.has(String(task.id)) ||
      (task.project && linkedProjects.has(task.project));
    if (!matches || seen.has(String(task.id))) return false;
    seen.add(String(task.id));
    return true;
  });
}

function getGoalProgress(goal) {
  if (goal.baseStatus === "completed") return 100;

  const linkedTasks = getGoalLinkedTasks(goal);
  const milestones = goal.milestones || [];
  const total = linkedTasks.length + milestones.length;
  if (!total) return 0;

  const completed =
    linkedTasks.filter((task) => task.completed).length +
    milestones.filter((milestone) => milestone.completed).length;

  return Math.round((completed / total) * 100);
}

function getGoalDerivedStatus(goal) {
  const progress = getGoalProgress(goal);
  if (goal.baseStatus === "completed" || progress >= 100) return "completed";
  if (goal.baseStatus === "paused") return "paused";

  if (goal.targetDate) {
    const today = getLocalDateKey();
    if (goal.targetDate < today) return "at-risk";

    const due = new Date(`${goal.targetDate}T00:00:00`);
    const now = new Date(`${today}T00:00:00`);
    const days = Math.round((due - now) / 86400000);

    if (days <= 14 && progress < 70) return "at-risk";
  }

  return "on-track";
}

function getGoalStatusLabel(status) {
  return {
    "on-track": "On track",
    "at-risk": "At risk",
    paused: "Paused",
    completed: "Completed"
  }[status] || "On track";
}

function formatGoalTargetDate(value) {
  if (!value) return "No target date";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function getSortedGoals(items = goals) {
  const rank = { "at-risk": 0, "on-track": 1, paused: 2, completed: 3 };
  return [...items].sort((a, b) => {
    const aStatus = getGoalDerivedStatus(a);
    const bStatus = getGoalDerivedStatus(b);
    const statusDiff = (rank[aStatus] ?? 9) - (rank[bStatus] ?? 9);
    if (statusDiff) return statusDiff;

    const aDate = a.targetDate || "9999-12-31";
    const bDate = b.targetDate || "9999-12-31";
    if (aDate !== bDate) return aDate.localeCompare(bDate);

    if (a.priority !== b.priority) return a.priority === "high" ? -1 : 1;
    return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
  });
}

function getFilteredGoals() {
  const query = goalSearchTerm.toLocaleLowerCase();
  return getSortedGoals(goals.filter((goal) => {
    if (goalWorkspaceFilter !== "all" && goal.workspace !== goalWorkspaceFilter) return false;

    const status = getGoalDerivedStatus(goal);
    if (goalStatusFilter !== "all" && status !== goalStatusFilter) return false;

    if (query) {
      const haystack = [
        goal.title,
        goal.description,
        goal.workspace,
        ...(goal.linkedProjects || []),
        ...(goal.milestones || []).map((item) => item.text)
      ].join(" ").toLocaleLowerCase();
      if (!haystack.includes(query)) return false;
    }

    return true;
  }));
}

function getSelectedGoal() {
  return goals.find((goal) => goal.id === selectedGoalId) || null;
}

function resetGoalEditor() {
  selectedGoalId = null;
  goalDraftMilestones = [];
  goalDraftLinkedProjects = [];
  goalDraftLinkedTaskIds = [];
  goalTaskPickerSearch = "";

  $("goalForm").reset();
  $("goalWorkspace").value = "personal";
  $("goalBaseStatus").value = "active";
  $("goalPriority").value = "normal";
  $("goalTaskSearchInput").value = "";
  $("goalEditorMode").textContent = "NEW GOAL";
  $("goalEditorHeading").textContent = "Define an outcome";
  $("deleteGoalButton").disabled = true;

  renderGoalEditorSupport();
  renderGoalsList();
  window.setTimeout(() => $("goalTitle")?.focus(), 20);
}

function selectGoal(goalId) {
  const goal = goals.find((item) => item.id === goalId);
  if (!goal) return;

  selectedGoalId = goal.id;
  goalDraftMilestones = normalizeGoalMilestones(goal.milestones);
  goalDraftLinkedProjects = [...goal.linkedProjects];
  goalDraftLinkedTaskIds = [...goal.linkedTaskIds];
  goalTaskPickerSearch = "";

  $("goalTitle").value = goal.title;
  $("goalWorkspace").value = goal.workspace;
  $("goalTargetDate").value = goal.targetDate || "";
  $("goalBaseStatus").value = goal.baseStatus;
  $("goalPriority").value = goal.priority;
  $("goalDescription").value = goal.description || "";
  $("goalTaskSearchInput").value = "";
  $("goalEditorMode").textContent = "EDIT GOAL";
  $("goalEditorHeading").textContent = goal.title || "Goal";
  $("deleteGoalButton").disabled = false;

  renderGoalEditorSupport();
  renderGoalsList();
}

function getGoalEditorDraft() {
  return normalizeGoal({
    id: selectedGoalId || createGoalId(),
    title: $("goalTitle").value.trim(),
    workspace: $("goalWorkspace").value,
    targetDate: $("goalTargetDate").value,
    baseStatus: $("goalBaseStatus").value,
    priority: $("goalPriority").value,
    description: $("goalDescription").value.trim(),
    linkedProjects: goalDraftLinkedProjects,
    linkedTaskIds: goalDraftLinkedTaskIds,
    milestones: goalDraftMilestones,
    createdAt: getSelectedGoal()?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

function renderGoalProjectPicker() {
  const picker = $("goalProjectPicker");
  if (!picker) return;

  const projects = getProjectRecords();
  $("goalProjectPickerEmpty").hidden = projects.length > 0;
  $("goalProjectLinkCount").textContent =
    `${goalDraftLinkedProjects.length} linked`;

  picker.innerHTML = projects.map((project) => {
    const checked = goalDraftLinkedProjects.includes(project.name);
    return `
      <label class="goal-picker-option ${checked ? "selected" : ""}">
        <input type="checkbox" data-goal-project="${escapeHtml(project.name)}" ${checked ? "checked" : ""}>
        <span>
          <strong>${escapeHtml(project.name)}</strong>
          <small>${project.open} open · ${project.progress}% complete</small>
        </span>
      </label>
    `;
  }).join("");

  picker.querySelectorAll("[data-goal-project]").forEach((input) => {
    input.addEventListener("change", () => {
      const name = input.dataset.goalProject;
      if (input.checked) {
        if (!goalDraftLinkedProjects.includes(name)) goalDraftLinkedProjects.push(name);
      } else {
        goalDraftLinkedProjects = goalDraftLinkedProjects.filter((item) => item !== name);
      }
      renderGoalEditorSupport();
    });
  });
}

function renderGoalTaskPicker() {
  const picker = $("goalTaskPicker");
  if (!picker) return;

  const query = goalTaskPickerSearch.toLocaleLowerCase();
  const visible = [...tasks]
    .filter((task) => {
      if (!query) return true;
      return `${task.text} ${task.details || ""} ${task.project || ""} ${(task.tags || []).join(" ")}`
        .toLocaleLowerCase()
        .includes(query);
    })
    .sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      if (a.priority !== b.priority) return a.priority === "urgent" ? -1 : 1;
      return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
    })
    .slice(0, 120);

  $("goalTaskPickerEmpty").hidden = visible.length > 0;
  $("goalTaskLinkCount").textContent =
    `${goalDraftLinkedTaskIds.length} linked`;

  picker.innerHTML = visible.map((task) => {
    const id = String(task.id);
    const checked = goalDraftLinkedTaskIds.includes(id);
    return `
      <label class="goal-picker-option task ${checked ? "selected" : ""}">
        <input type="checkbox" data-goal-task="${escapeHtml(id)}" ${checked ? "checked" : ""}>
        <span>
          <strong>${escapeHtml(task.text || "Untitled task")}</strong>
          <small>
            ${escapeHtml(task.workspace || "personal")}
            ${task.project ? ` · ◆ ${escapeHtml(task.project)}` : ""}
            ${task.completed ? " · Done" : ""}
          </small>
        </span>
      </label>
    `;
  }).join("");

  picker.querySelectorAll("[data-goal-task]").forEach((input) => {
    input.addEventListener("change", () => {
      const id = input.dataset.goalTask;
      if (input.checked) {
        if (!goalDraftLinkedTaskIds.includes(id)) goalDraftLinkedTaskIds.push(id);
      } else {
        goalDraftLinkedTaskIds = goalDraftLinkedTaskIds.filter((item) => item !== id);
      }
      renderGoalEditorSupport();
    });
  });
}

function renderGoalMilestones() {
  const list = $("goalMilestoneList");
  if (!list) return;

  $("goalMilestoneCount").textContent =
    `${goalDraftMilestones.length} milestone${goalDraftMilestones.length === 1 ? "" : "s"}`;
  $("goalMilestoneEmpty").hidden = goalDraftMilestones.length > 0;

  list.innerHTML = goalDraftMilestones.map((milestone) => `
    <div class="goal-milestone-row ${milestone.completed ? "completed" : ""}">
      <label>
        <input type="checkbox" data-goal-milestone-toggle="${escapeHtml(milestone.id)}" ${milestone.completed ? "checked" : ""}>
        <span>
          <strong>${escapeHtml(milestone.text)}</strong>
          <small>${milestone.targetDate ? escapeHtml(formatGoalTargetDate(milestone.targetDate)) : "No milestone date"}</small>
        </span>
      </label>
      <button type="button" data-goal-milestone-remove="${escapeHtml(milestone.id)}" aria-label="Remove milestone">✕</button>
    </div>
  `).join("");

  list.querySelectorAll("[data-goal-milestone-toggle]").forEach((input) => {
    input.addEventListener("change", () => {
      const milestone = goalDraftMilestones.find(
        (item) => item.id === input.dataset.goalMilestoneToggle
      );
      if (milestone) milestone.completed = input.checked;
      renderGoalEditorSupport();
    });
  });

  list.querySelectorAll("[data-goal-milestone-remove]").forEach((button) => {
    button.addEventListener("click", () => {
      goalDraftMilestones = goalDraftMilestones.filter(
        (item) => item.id !== button.dataset.goalMilestoneRemove
      );
      renderGoalEditorSupport();
    });
  });
}

function renderGoalEditorProgress() {
  const goal = getGoalEditorDraft();
  const status = getGoalDerivedStatus(goal);
  const progress = getGoalProgress(goal);

  $("goalEditorStatusBadge").textContent = getGoalStatusLabel(status);
  $("goalEditorStatusBadge").className = `goal-status-badge ${status}`;
  $("goalEditorProgress").textContent = `${progress}%`;
  $("goalEditorProgressBar").style.width = `${progress}%`;
}

function renderGoalEditorSupport() {
  renderGoalProjectPicker();
  renderGoalTaskPicker();
  renderGoalMilestones();
  renderGoalEditorProgress();
}

function renderGoalsList() {
  const list = $("goalsList");
  if (!list) return;

  const visible = getFilteredGoals();
  $("goalsVisibleCount").textContent = String(visible.length);
  $("goalsEmptyState").hidden = visible.length > 0;

  list.innerHTML = visible.map((goal) => {
    const status = getGoalDerivedStatus(goal);
    const progress = getGoalProgress(goal);
    return `
      <button class="goal-list-card ${goal.id === selectedGoalId ? "active" : ""} ${escapeHtml(status)}"
        type="button" data-goal-id="${escapeHtml(goal.id)}">
        <span class="goal-list-icon">◎</span>
        <span class="goal-list-copy">
          <small>${escapeHtml(goal.workspace)} · ${escapeHtml(getGoalStatusLabel(status))}</small>
          <strong>${escapeHtml(goal.title)}</strong>
          <span class="goal-list-progress"><i style="width:${progress}%"></i></span>
          <em>${goal.targetDate ? escapeHtml(formatGoalTargetDate(goal.targetDate)) : "No target date"}</em>
        </span>
        <span class="goal-list-percent">${progress}%</span>
      </button>
    `;
  }).join("");

  list.querySelectorAll("[data-goal-id]").forEach((button) => {
    button.addEventListener("click", () => selectGoal(button.dataset.goalId));
  });
}

function renderGoalsHub() {
  if (!$("goalsList")) return;

  const statuses = goals.map((goal) => getGoalDerivedStatus(goal));
  $("goalsActiveCount").textContent = String(
    goals.filter((goal) => !["completed", "paused"].includes(getGoalDerivedStatus(goal))).length
  );
  $("goalsOnTrackCount").textContent = String(statuses.filter((status) => status === "on-track").length);
  $("goalsAtRiskCount").textContent = String(statuses.filter((status) => status === "at-risk").length);
  $("goalsCompletedCount").textContent = String(statuses.filter((status) => status === "completed").length);

  $("goalsSearchInput").value = goalSearchTerm;
  $("goalsWorkspaceFilter").value = goalWorkspaceFilter;
  $("goalsStatusFilter").value = goalStatusFilter;

  renderGoalsList();

  if (selectedGoalId && !getSelectedGoal()) selectedGoalId = null;
  if (selectedGoalId) {
    const goal = getSelectedGoal();
    if (goal && $("goalTitle").value !== goal.title && !$("goalTitle").matches(":focus")) {
      selectGoal(goal.id);
      return;
    }
  }

  renderGoalEditorSupport();
}

function saveGoalFromEditor() {
  const title = $("goalTitle").value.trim();
  if (!title) {
    showToast("Enter a goal title");
    $("goalTitle").focus();
    return false;
  }

  const draft = getGoalEditorDraft();
  const existingIndex = goals.findIndex((goal) => goal.id === selectedGoalId);

  if (existingIndex >= 0) {
    draft.createdAt = goals[existingIndex].createdAt;
    goals[existingIndex] = draft;
  } else {
    goals.unshift(draft);
  }

  selectedGoalId = draft.id;
  persistGoals();
  renderAll();
  selectGoal(draft.id);
  showToast(existingIndex >= 0 ? "Goal updated" : "Goal created");
  return true;
}

function deleteSelectedGoal() {
  const goal = getSelectedGoal();
  if (!goal) return;
  if (!window.confirm(`Delete goal “${goal.title}”? Linked Tasks and Projects will not be deleted.`)) return;

  goals = goals.filter((item) => item.id !== goal.id);
  persistGoals();
  resetGoalEditor();
  renderAll();
  showToast("Goal deleted");
}

function addGoalMilestoneFromControls() {
  const text = $("goalMilestoneText").value.trim();
  if (!text) {
    $("goalMilestoneText").focus();
    return;
  }

  goalDraftMilestones.push({
    id: `milestone-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    text: text.slice(0, 180),
    targetDate: $("goalMilestoneDate").value,
    completed: false
  });

  $("goalMilestoneText").value = "";
  $("goalMilestoneDate").value = "";
  renderGoalEditorSupport();
}

function getGoalFocusCandidate() {
  return getSortedGoals(
    goals.filter((goal) => !["completed", "paused"].includes(getGoalDerivedStatus(goal)))
  )[0] || null;
}

function normalizeTask(task = {}) {
  const createdAt = task.createdAt || new Date().toISOString();
  const legacyCompleted = Boolean(task.completed);
  const allowedStatuses = ["todo", "in-progress", "waiting", "done"];
  const status = allowedStatuses.includes(task.status)
    ? task.status
    : (legacyCompleted ? "done" : "todo");

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
    project: String(task.project || "").trim().replace(/\s+/g, " ").slice(0, 80),
    status,
    completed: status === "done",
    tags: normalizeTaskTags(task.tags),
    subtasks: normalizeTaskSubtasks(task.subtasks),
    recurrence: normalizeTaskRecurrence(task.recurrence),
    recurrenceSeriesId: task.recurrenceSeriesId || task.id || null,
    nextOccurrenceId: task.nextOccurrenceId || null,
    sourceOccurrenceId: task.sourceOccurrenceId || null,
    sourceRoutineId: task.sourceRoutineId || null,
    routineDate: /^\d{4}-\d{2}-\d{2}$/.test(task.routineDate || "")
      ? task.routineDate
      : "",
    createdAt,
    updatedAt: task.updatedAt || createdAt
  };
}

function normalizeData() {
  tasks = tasks.map(normalizeTask);
  goals = normalizeGoals(goals);
  routines = normalizeRoutines(routines);

  events = events.map((event) => ({
    id: event.id || Date.now() + Math.random(),
    title: event.title || "Untitled event",
    date: event.date || new Date().toISOString().slice(0, 10),
    workspace: event.workspace || "personal"
  }));

  customTemplates = normalizeCustomTemplates(customTemplates);

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


function updateMobileNavigation(appName = mobileActiveApp) {
  const mapped = ["dashboard", "tasks", "calendar", "notes"].includes(appName)
    ? appName
    : "more";

  document.querySelectorAll("[data-mobile-nav-app]").forEach((item) => {
    item.classList.toggle("active", item.dataset.mobileNavApp === mapped);
  });
}

function setMobileActiveApp(appName) {
  mobileActiveApp = appName || "dashboard";
  updateMobileNavigation(mobileActiveApp);
}

function toggleMobileMoreMenu() {
  const launcher = $("launcher");
  const opening = !launcher.classList.contains("open");
  launcher.classList.toggle("open", opening);

  if (opening) {
    updateMobileNavigation("more");
  } else {
    updateMobileNavigation(mobileActiveApp);
  }
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

  setMobileActiveApp(appName);

  document.querySelectorAll(".dock-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.openApp === appName);
  });

  closeLauncher();

  if (appName === "documents" && window.BoxCloud?.isReady()) {
    const forceVisibleMobileRefresh =
      document.documentElement.classList.contains("phone-ui");
    loadDocuments({
      silent: forceVisibleMobileRefresh ? false : documents.length > 0
    });
  }

  if (appName === "backup") {
    renderBackupCenter();
  }

  if (appName === "reminders") {
    renderReminderCenter();
  }

  if (appName === "routines") {
    ensureScheduledRoutineTasks({ silent: true });
    renderRoutinesHub();
  }

  if (appName === "goals") {
    renderGoalsHub();
  }

  if (appName === "agenda") {
    renderAgenda();
    if (window.BoxCloud?.isReady() && !documents.length && !documentsLoading) {
      loadDocuments({ silent: true }).then(() => renderAgenda());
    }
  }

  if (appName === "today") {
    renderTodayPlanner();
  }

  if (appName === "weeklyreview") {
    renderWeeklyReview();
    if (window.BoxCloud?.isReady() && !documents.length && !documentsLoading) {
      loadDocuments({ silent: true }).then(() => renderWeeklyReview());
    }
  }

  if (appName === "workspaces") {
    renderWorkspacesHub();
  }

  if (appName === "activity") {
    renderActivityTimeline();
    if (window.BoxCloud?.isReady() && !documents.length && !documentsLoading) {
      loadDocuments({ silent: true }).then(() => renderActivityTimeline());
    }
  }

  if (appName === "projects") {
    renderProjectsHub();
  }

  if (appName === "favorites") {
    renderFavoritesHub();
    if (window.BoxCloud?.isReady() && !documents.length && !documentsLoading) {
      loadDocuments({ silent: true }).then(() => renderFavoritesHub());
    }
  }

  if (appName === "dashboard") {
    renderDashboard();
    if (window.BoxCloud?.isReady() && !documents.length && !documentsLoading) {
      loadDocuments({ silent: true }).then(() => renderDashboard());
    }
  }

  if (appName === "notes") {
    renderNotesCenter();
  }

  if (appName === "journal") {
    renderJournalCenter();
  }

  if (appName === "ourspace") {
    renderOurSpaceCenter();
    if (window.BoxCloud?.isReady() && !documents.length) {
      loadDocuments({ silent: true }).then(() => renderOurSpaceCenter());
    }
    syncPendingOurSpaceIfNeeded();
  }

  if (appName === "templates") {
    renderTemplateCenter();
    if (window.BoxCloud?.isReady() && !templatesCloudLoading) {
      loadCustomTemplatesFromCloud({ mergeLocal: true });
    }
    if (window.BoxCloud?.isReady() && !documents.length) {
      loadDocuments({ silent: true });
    }
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
  const selectedMode = getViewModePreference();
  if (selectedMode === "mobile") return true;
  if (selectedMode === "tablet" || selectedMode === "windows") return false;

  return (
    document.documentElement.classList.contains("phone-ui") ||
    window.matchMedia("(max-width: 680px)").matches
  );
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

const TABLET_WINDOW_PRESETS = {
  compact: { width: 0.68, height: 0.62, label: "Compact" },
  medium: { width: 0.82, height: 0.74, label: "Medium" },
  large: { width: 0.94, height: 0.86, label: "Large" }
};

function getDesktopSafeArea() {
  const desktopRect = $("desktop").getBoundingClientRect();
  const tablet = isTabletUiMode();
  const marginX = tablet ? 12 : 0;
  const marginTop = tablet ? 10 : 0;
  const marginBottom = tablet ? 18 : 0;

  return {
    desktopRect,
    marginX,
    marginTop,
    marginBottom,
    width: Math.max(0, desktopRect.width - marginX * 2),
    height: Math.max(0, desktopRect.height - marginTop - marginBottom)
  };
}

function getNextTabletPreset(windowElement) {
  const current = windowElement.dataset.windowPreset || "custom";
  if (current === "compact") return "large";
  if (current === "large") return "medium";
  return "compact";
}

function updateWindowSizeButton(windowElement) {
  const button = windowElement.querySelector(".window-size-button");
  if (!button) return;

  const nextPreset = getNextTabletPreset(windowElement);
  const nextLabel = TABLET_WINDOW_PRESETS[nextPreset]?.label || "Compact";
  button.textContent = nextPreset === "large" ? "↗" : "↙";
  button.title = `Set ${nextLabel.toLowerCase()} window size`;
  button.setAttribute("aria-label", button.title);
}

function setTabletWindowPreset(
  windowElement,
  presetName = "medium",
  { announce = false, save = true } = {}
) {
  if (!isTabletUiMode() || isCompactWindowMode()) return;

  const preset = TABLET_WINDOW_PRESETS[presetName] || TABLET_WINDOW_PRESETS.medium;
  const safeArea = getDesktopSafeArea();
  if (!safeArea.width || !safeArea.height) return;

  windowElement.classList.remove("maximized");

  const minWidth = Math.min(360, safeArea.width);
  const minHeight = Math.min(280, safeArea.height);
  const width = Math.min(
    safeArea.width,
    Math.max(minWidth, safeArea.width * preset.width)
  );
  const height = Math.min(
    safeArea.height,
    Math.max(minHeight, safeArea.height * preset.height)
  );
  const left = safeArea.marginX + Math.max(0, (safeArea.width - width) / 2);
  const top = safeArea.marginTop + Math.max(0, (safeArea.height - height) / 2);

  windowElement.style.left = `${left}px`;
  windowElement.style.top = `${top}px`;
  windowElement.style.width = `${width}px`;
  windowElement.style.height = `${height}px`;
  windowElement.dataset.windowPreset = presetName;

  clampWindowToDesktop(windowElement);
  updateMaximizeButton(windowElement);
  updateWindowSizeButton(windowElement);
  updateWindowResponsiveState(windowElement);

  if (save) saveWindowLayout(windowElement);
  if (announce) showToast(`${preset.label} window size`);
}

function cycleTabletWindowPreset(windowElement) {
  const nextPreset = getNextTabletPreset(windowElement);
  setTabletWindowPreset(windowElement, nextPreset, {
    announce: true,
    save: true
  });
  focusWindow(windowElement);
}

function applyTabletDefaultWindowLayout(windowElement) {
  if (!isTabletUiMode() || isCompactWindowMode()) return;
  if (windowElement.classList.contains("maximized")) return;

  const appName = windowElement.dataset.appWindow;
  if (!appName || readWindowLayouts()[appName]) return;

  setTabletWindowPreset(windowElement, "medium", {
    announce: false,
    save: false
  });
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
    height: rect.height,
    preset: windowElement.dataset.windowPreset || "custom"
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
  windowElement.dataset.windowPreset = layout.preset || "custom";
  clampWindowToDesktop(windowElement);
  updateWindowSizeButton(windowElement);
}

function clampWindowToDesktop(windowElement) {
  if (isCompactWindowMode() || windowElement.classList.contains("maximized")) return;

  const safeArea = getDesktopSafeArea();
  const rect = windowElement.getBoundingClientRect();
  if (!safeArea.desktopRect.width || !safeArea.desktopRect.height) return;

  const minWidth = Math.min(isTabletUiMode() ? 360 : 300, safeArea.width);
  const minHeight = Math.min(isTabletUiMode() ? 280 : 230, safeArea.height);
  const width = Math.min(Math.max(rect.width, minWidth), safeArea.width);
  const height = Math.min(Math.max(rect.height, minHeight), safeArea.height);
  const currentLeft = rect.left - safeArea.desktopRect.left;
  const currentTop = rect.top - safeArea.desktopRect.top;
  const minLeft = safeArea.marginX;
  const minTop = safeArea.marginTop;
  const maxLeft = safeArea.marginX + Math.max(0, safeArea.width - width);
  const maxTop = safeArea.marginTop + Math.max(0, safeArea.height - height);
  const left = Math.max(minLeft, Math.min(currentLeft, maxLeft));
  const top = Math.max(minTop, Math.min(currentTop, maxTop));

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
  updateWindowSizeButton(windowElement);
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
  updateMobileNavigation(mobileActiveApp);
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

    const controls = windowElement.querySelector(".window-controls");
    const maximizeButton = windowElement.querySelector(".maximize-button");
    const sizeButton = document.createElement("button");
    sizeButton.type = "button";
    sizeButton.className = "window-button window-size-button";
    sizeButton.textContent = "↙";
    sizeButton.addEventListener("click", () => {
      cycleTabletWindowPreset(windowElement);
    });
    controls.insertBefore(sizeButton, maximizeButton);

    const resizeHandle = document.createElement("div");
    resizeHandle.className = "window-resize-handle";
    resizeHandle.setAttribute("role", "button");
    resizeHandle.setAttribute("aria-label", "Resize window");
    resizeHandle.title = "Drag to resize";
    windowElement.appendChild(resizeHandle);

    applyTabletDefaultWindowLayout(windowElement);
    applyStoredWindowLayout(windowElement);
    updateMaximizeButton(windowElement);
    updateWindowSizeButton(windowElement);
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

    const safeArea = getDesktopSafeArea();
    const minWidth = Math.min(isTabletUiMode() ? 360 : 300, safeArea.width);
    const minHeight = Math.min(isTabletUiMode() ? 280 : 230, safeArea.height);
    const maxWidth = Math.max(
      minWidth,
      safeArea.marginX + safeArea.width - startLeft
    );
    const maxHeight = Math.max(
      minHeight,
      safeArea.marginTop + safeArea.height - startTop
    );
    const width = Math.max(minWidth, Math.min(startWidth + event.clientX - startX, maxWidth));
    const height = Math.max(minHeight, Math.min(startHeight + event.clientY - startY, maxHeight));

    windowElement.style.width = `${width}px`;
    windowElement.style.height = `${height}px`;
    windowElement.dataset.windowPreset = "custom";
    updateWindowSizeButton(windowElement);
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

function handleViewportResize() {
  updateDeviceUiClasses();
  updateAppViewportHeight();

  document.querySelectorAll(".app-window").forEach((windowElement) => {
    if (!isCompactWindowMode()) {
      applyTabletDefaultWindowLayout(windowElement);
      clampWindowToDesktop(windowElement);
    }
    updateWindowResponsiveState(windowElement);
  });
}

window.addEventListener("resize", handleViewportResize);
window.visualViewport?.addEventListener("resize", handleViewportResize);

let editingTaskId = null;
let pendingTaskSource = null;
let taskDraftSubtasks = [];
let taskChecklistAttachmentContext = null;
let taskChecklistFileSearchTerm = "";

function buildSubtasksFromText(value, existing = []) {
  const previousByText = new Map(existing.map((item) => [item.text.toLocaleLowerCase(), item]));
  return String(value || "")
    .split(/\r?\n/)
    .map((text) => text.trim())
    .filter(Boolean)
    .slice(0, 50)
    .map((text) => {
      const previous = previousByText.get(text.toLocaleLowerCase());
      return normalizeTaskSubtasks([{
        id: previous?.id,
        text,
        details: previous?.details || "",
        completed: Boolean(previous?.completed),
        attachments: previous?.attachments || []
      }])[0];
    });
}

function createDraftChecklistItem(defaults = {}) {
  return normalizeTaskSubtasks([{
    id: defaults.id || `subtask-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    text: defaults.text || "",
    details: defaults.details || "",
    completed: defaults.completed,
    attachments: defaults.attachments || []
  }])[0] || {
    id: `subtask-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    text: "",
    details: "",
    completed: false,
    attachments: []
  };
}

function getChecklistAttachmentCount(task) {
  return normalizeTaskSubtasks(task?.subtasks).reduce(
    (count, item) => count + item.attachments.length,
    0
  );
}

function findChecklistContextSubtask() {
  const context = taskChecklistAttachmentContext;
  if (!context) return null;
  if (context.mode === "draft") {
    return taskDraftSubtasks.find((item) => String(item.id) === String(context.subtaskId)) || null;
  }
  const task = tasks.find((item) => String(item.id) === String(context.taskId));
  return task?.subtasks.find((item) => String(item.id) === String(context.subtaskId)) || null;
}

function saveChecklistContextChanges() {
  const context = taskChecklistAttachmentContext;
  if (!context || context.mode === "draft") {
    renderTaskModalChecklist();
    return;
  }
  const task = tasks.find((item) => String(item.id) === String(context.taskId));
  if (!task) return;
  task.updatedAt = new Date().toISOString();
  saveJSON(STORAGE.tasks, tasks);
  renderAll();
}

function getDocumentAttachmentRecord(documentItem) {
  return normalizeTaskAttachment({
    documentId: documentItem.id,
    name: documentItem.name,
    folder: documentItem.folder,
    mimeType: documentItem.mime_type,
    sizeBytes: documentItem.size_bytes
  });
}

function attachDocumentToChecklist(documentItem) {
  const subtask = findChecklistContextSubtask();
  const attachment = getDocumentAttachmentRecord(documentItem);
  if (!subtask || !attachment) return;
  if (subtask.attachments.some((item) => String(item.documentId) === String(attachment.documentId))) {
    showToast("File is already attached");
    return;
  }
  subtask.attachments.push(attachment);
  subtask.attachments = subtask.attachments.slice(0, 20);
  saveChecklistContextChanges();
  renderTaskChecklistFilePicker();
  showToast("File attached to checklist item");
}

function removeChecklistAttachment(context, documentId) {
  taskChecklistAttachmentContext = context;
  const subtask = findChecklistContextSubtask();
  if (!subtask) return;
  subtask.attachments = subtask.attachments.filter(
    (item) => String(item.documentId) !== String(documentId)
  );
  saveChecklistContextChanges();
  if (context.mode === "draft") renderTaskModalChecklist();
}

async function openTaskChecklistAttachment(attachment) {
  if (!window.BoxCloud?.isReady()) {
    openAuthOverlay();
    return;
  }
  let documentItem = documents.find(
    (item) => String(item.id) === String(attachment.documentId) && !item.deleted_at
  );
  if (!documentItem) {
    await loadDocuments({ silent: true });
    documentItem = documents.find(
      (item) => String(item.id) === String(attachment.documentId) && !item.deleted_at
    );
  }
  if (!documentItem) {
    showToast("Attached file is unavailable or in the Recycle Bin");
    return;
  }
  const result = await window.BoxCloud.createDocumentUrl(documentItem.storage_path, 600);
  const signedUrl = result.data?.signedUrl || result.data?.signedURL;
  if (signedUrl) window.open(signedUrl, "_blank", "noopener");
  else showToast(result.error?.message || "Could not open attached file");
}

function renderTaskModalChecklist() {
  const list = $("taskModalChecklistList");
  if (!list) return;
  list.innerHTML = "";
  $("taskModalChecklistEmpty").hidden = taskDraftSubtasks.length > 0;

  taskDraftSubtasks.forEach((subtask, index) => {
    const row = document.createElement("article");
    row.className = "task-checklist-editor-item";

    const top = document.createElement("div");
    top.className = "task-checklist-editor-top";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = subtask.completed;
    checkbox.setAttribute("aria-label", "Checklist item completed");
    checkbox.addEventListener("change", () => { subtask.completed = checkbox.checked; });

    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.maxLength = 240;
    titleInput.placeholder = `Checklist item ${index + 1}`;
    titleInput.value = subtask.text;
    titleInput.addEventListener("input", () => { subtask.text = titleInput.value; });

    const actions = document.createElement("div");
    actions.className = "task-checklist-editor-actions";

    const addFile = document.createElement("button");
    addFile.type = "button";
    addFile.className = "secondary-button";
    addFile.textContent = "＋ Add file";
    addFile.addEventListener("click", () => openTaskChecklistFileModal({ mode: "draft", subtaskId: subtask.id }));

    const detailsButton = document.createElement("button");
    detailsButton.type = "button";
    detailsButton.className = "secondary-button";
    detailsButton.textContent = subtask.details ? "Edit details" : "＋ Details";

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "task-checklist-remove-button";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      taskDraftSubtasks = taskDraftSubtasks.filter((item) => item.id !== subtask.id);
      renderTaskModalChecklist();
    });

    actions.append(addFile, detailsButton, remove);
    top.append(checkbox, titleInput, actions);

    const detailsWrap = document.createElement("div");
    detailsWrap.className = `task-checklist-editor-details ${subtask.details ? "open" : ""}`;
    const detailsInput = document.createElement("textarea");
    detailsInput.maxLength = 2000;
    detailsInput.placeholder = "Add instructions, requirements, notes, or status details for this checklist item.";
    detailsInput.value = subtask.details;
    detailsInput.addEventListener("input", () => {
      subtask.details = detailsInput.value;
      detailsButton.textContent = subtask.details.trim() ? "Edit details" : "＋ Details";
    });
    detailsWrap.appendChild(detailsInput);
    detailsButton.addEventListener("click", () => {
      detailsWrap.classList.toggle("open");
      if (detailsWrap.classList.contains("open")) detailsInput.focus();
    });

    const attachments = document.createElement("div");
    attachments.className = "task-checklist-editor-attachments";
    subtask.attachments.forEach((attachment) => {
      const chip = document.createElement("span");
      chip.className = "task-checklist-file-chip";
      const open = document.createElement("button");
      open.type = "button";
      open.textContent = `▣ ${attachment.name}`;
      open.title = `Open ${attachment.name}`;
      open.addEventListener("click", () => openTaskChecklistAttachment(attachment));
      const detach = document.createElement("button");
      detach.type = "button";
      detach.className = "task-checklist-file-remove";
      detach.textContent = "✕";
      detach.title = "Remove attachment from checklist item";
      detach.addEventListener("click", () => removeChecklistAttachment(
        { mode: "draft", subtaskId: subtask.id }, attachment.documentId
      ));
      chip.append(open, detach);
      attachments.appendChild(chip);
    });

    row.append(top, detailsWrap, attachments);
    list.appendChild(row);
  });
}

function addTaskModalChecklistItem() {
  const item = createDraftChecklistItem();
  taskDraftSubtasks.push(item);
  renderTaskModalChecklist();
  setTimeout(() => {
    const rows = $("taskModalChecklistList").querySelectorAll(".task-checklist-editor-item input[type='text']");
    rows[rows.length - 1]?.focus();
  }, 0);
}

function populateTaskChecklistUploadFolders() {
  const select = $("taskChecklistUploadFolder");
  if (!select) return;
  const current = select.value;
  select.innerHTML = getAllDocumentFolderNames()
    .map((folder) => `<option value="${escapeHtml(folder)}">${escapeHtml(folder)}</option>`)
    .join("");
  if (getAllDocumentFolderNames().includes(current)) select.value = current;
  else select.value = getAllDocumentFolderNames().includes("Personal") ? "Personal" : getAllDocumentFolderNames()[0];
}

function renderTaskChecklistFilePicker() {
  const list = $("taskChecklistDocumentList");
  if (!list) return;
  const subtask = findChecklistContextSubtask();
  const attachedIds = new Set((subtask?.attachments || []).map((item) => String(item.documentId)));
  const query = taskChecklistFileSearchTerm.toLocaleLowerCase();
  const visible = documents
    .filter((item) => !item.deleted_at)
    .filter((item) => [item.name, item.folder, item.details, ...(item.tags || [])]
      .join(" ").toLocaleLowerCase().includes(query))
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));

  list.innerHTML = visible.map((item) => {
    const attached = attachedIds.has(String(item.id));
    return `<article class="task-checklist-document-option">
      <span class="task-checklist-document-icon">${escapeHtml(getDocumentTypeLabel(item).slice(0, 4))}</span>
      <span class="task-checklist-document-copy">
        <strong>${escapeHtml(item.name)}</strong>
        <small>${escapeHtml(item.folder || "Documents")} · ${escapeHtml(formatBytes(item.size_bytes))}</small>
      </span>
      <button class="${attached ? "secondary-button" : "primary-button"}" type="button"
        data-task-checklist-document="${escapeHtml(String(item.id))}" ${attached ? "disabled" : ""}>
        ${attached ? "Attached" : "Attach"}
      </button>
    </article>`;
  }).join("");
  $("taskChecklistDocumentEmpty").hidden = visible.length > 0;

  list.querySelectorAll("[data-task-checklist-document]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = documents.find((documentItem) => String(documentItem.id) === button.dataset.taskChecklistDocument);
      if (item) attachDocumentToChecklist(item);
    });
  });
}

async function openTaskChecklistFileModal(context) {
  taskChecklistAttachmentContext = context;
  taskChecklistFileSearchTerm = "";
  $("taskChecklistFileSearch").value = "";
  $("taskChecklistUploadInput").value = "";
  const subtask = findChecklistContextSubtask();
  $("taskChecklistFileTarget").textContent = subtask?.text
    ? `Checklist item: ${subtask.text}`
    : "Choose a document for this checklist item.";
  $("taskChecklistFileStatus").textContent = window.BoxCloud?.isReady()
    ? "Select an existing Document Vault file or upload a new one."
    : "Sign in to use private Document Vault attachments.";
  $("taskChecklistFileModal").classList.add("open");
  $("taskChecklistFileModal").setAttribute("aria-hidden", "false");
  populateTaskChecklistUploadFolders();
  renderTaskChecklistFilePicker();
  if (window.BoxCloud?.isReady()) {
    await loadDocuments({ silent: true });
    populateTaskChecklistUploadFolders();
    renderTaskChecklistFilePicker();
  }
}

function closeTaskChecklistFileModal() {
  $("taskChecklistFileModal").classList.remove("open");
  $("taskChecklistFileModal").setAttribute("aria-hidden", "true");
  $("taskChecklistUploadInput").value = "";
  taskChecklistAttachmentContext = null;
}

async function uploadTaskChecklistFile() {
  if (!window.BoxCloud?.isReady()) {
    openAuthOverlay();
    return;
  }
  const file = $("taskChecklistUploadInput").files?.[0];
  if (!file) {
    $("taskChecklistUploadInput").click();
    return;
  }
  if (file.size > 25 * 1024 * 1024) {
    $("taskChecklistFileStatus").textContent = `${file.name} is larger than the 25 MB limit.`;
    return;
  }
  const subtask = findChecklistContextSubtask();
  const button = $("uploadTaskChecklistFileButton");
  button.disabled = true;
  button.textContent = "Uploading…";
  $("taskChecklistFileStatus").textContent = `Uploading ${file.name}…`;
  const result = await window.BoxCloud.uploadDocument(
    file,
    $("taskChecklistUploadFolder").value,
    subtask?.text ? `Checklist attachment: ${subtask.text}` : "Checklist attachment",
    {}
  );
  button.disabled = false;
  button.textContent = "Upload and attach";
  if (result.error) {
    $("taskChecklistFileStatus").textContent = result.error.message;
    return;
  }
  documents.unshift(result.data);
  $("taskChecklistUploadInput").value = "";
  $("taskChecklistFileStatus").textContent = `${file.name} uploaded and attached.`;
  attachDocumentToChecklist(result.data);
  renderDocuments();
}

function getTaskModalCustomDays() {
  return Array.from(document.querySelectorAll("#taskCustomDaysField input[type='checkbox']:checked"))
    .map((input) => Number(input.value))
    .sort();
}

function setTaskModalCustomDays(days = []) {
  const selected = new Set(days.map(Number));
  document.querySelectorAll("#taskCustomDaysField input[type='checkbox']").forEach((input) => {
    input.checked = selected.has(Number(input.value));
  });
}

function updateTaskRecurrenceControls() {
  const type = $("taskModalRecurrence").value;
  $("taskCustomDaysField").classList.toggle("hidden", type !== "custom");
}

function createTask({
  text,
  workspace,
  priority,
  project = "",
  status = "todo",
  details = "",
  dueDate = "",
  tags = [],
  subtasks = [],
  recurrence = { type: "none", days: [] }
}) {
  const cleanText = text.trim();
  if (!cleanText) return false;

  const timestamp = new Date().toISOString();
  const taskId = Date.now() + Math.random();
  const cleanStatus = ["todo", "in-progress", "waiting", "done"].includes(status) ? status : "todo";

  const createdTask = normalizeTask({
    id: taskId,
    text: cleanText,
    details: details.trim(),
    dueDate,
    workspace,
    priority,
    project,
    status: cleanStatus,
    completed: cleanStatus === "done",
    tags,
    subtasks,
    recurrence,
    recurrenceSeriesId: taskId,
    createdAt: timestamp,
    updatedAt: timestamp
  });
  tasks.unshift(createdTask);
  if (createdTask.completed) ensureNextRecurringTask(createdTask);

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
  task.project = String(values.project || "").trim().replace(/\s+/g, " ").slice(0, 80);
  task.tags = normalizeTaskTags(values.tags);
  task.subtasks = normalizeTaskSubtasks(values.subtasks);
  task.recurrence = normalizeTaskRecurrence(values.recurrence);
  task.status = ["todo", "in-progress", "waiting", "done"].includes(values.status)
    ? values.status
    : task.status;
  task.completed = task.status === "done";
  task.updatedAt = new Date().toISOString();

  if (task.completed) ensureNextRecurringTask(task);
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
  $("taskModalStatus").value = defaults.status || (defaults.completed ? "done" : "todo");
  $("taskModalDueDate").value = defaults.dueDate || "";
  $("taskModalProject").value = defaults.project || "";
  $("taskModalTags").value = normalizeTaskTags(defaults.tags).join(", ");
  taskDraftSubtasks = normalizeTaskSubtasks(defaults.subtasks).map((item) => ({
    ...item,
    attachments: item.attachments.map((attachment) => ({ ...attachment }))
  }));
  renderTaskModalChecklist();
  $("taskModalDetails").value = defaults.details || "";
  const recurrence = normalizeTaskRecurrence(defaults.recurrence);
  $("taskModalRecurrence").value = recurrence.type;
  setTaskModalCustomDays(recurrence.days);
  updateTaskRecurrenceControls();

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
  taskDraftSubtasks = [];
}

const TASK_STATUSES = [
  { key: "todo", label: "To Do" },
  { key: "in-progress", label: "In Progress" },
  { key: "waiting", label: "Waiting" },
  { key: "done", label: "Done" }
];

function getTaskStatusLabel(status) {
  return TASK_STATUSES.find((item) => item.key === status)?.label || "To Do";
}

function getTaskRecurrenceLabel(recurrence) {
  const rule = normalizeTaskRecurrence(recurrence);
  if (rule.type === "daily") return "Daily";
  if (rule.type === "weekdays") return "Weekdays";
  if (rule.type === "weekly") return "Weekly";
  if (rule.type === "monthly") return "Monthly";
  if (rule.type === "custom") {
    const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return rule.days.length ? rule.days.map((day) => labels[day]).join(", ") : "Custom";
  }
  return "";
}

function getNextRecurringDate(task) {
  const rule = normalizeTaskRecurrence(task.recurrence);
  if (rule.type === "none" || !task.dueDate) return "";

  const date = new Date(`${task.dueDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";

  if (rule.type === "daily") date.setDate(date.getDate() + 1);
  else if (rule.type === "weekdays") {
    do date.setDate(date.getDate() + 1);
    while ([0, 6].includes(date.getDay()));
  } else if (rule.type === "weekly") date.setDate(date.getDate() + 7);
  else if (rule.type === "monthly") {
    const targetDay = date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() + 1);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    date.setDate(Math.min(targetDay, lastDay));
  } else if (rule.type === "custom") {
    if (!rule.days.length) return "";
    do date.setDate(date.getDate() + 1);
    while (!rule.days.includes(date.getDay()));
  }

  return getLocalDateKey(date);
}

function ensureNextRecurringTask(task) {
  const nextDueDate = getNextRecurringDate(task);
  if (!nextDueDate || task.nextOccurrenceId) return null;

  const timestamp = new Date().toISOString();
  const nextId = Date.now() + Math.random();
  const nextTask = normalizeTask({
    ...task,
    id: nextId,
    status: "todo",
    completed: false,
    dueDate: nextDueDate,
    subtasks: task.subtasks.map((item) => ({
      ...item,
      id: `subtask-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      completed: false,
      attachments: item.attachments.map((attachment) => ({ ...attachment }))
    })),
    recurrenceSeriesId: task.recurrenceSeriesId || task.id,
    nextOccurrenceId: null,
    sourceOccurrenceId: task.id,
    createdAt: timestamp,
    updatedAt: timestamp
  });

  task.nextOccurrenceId = nextId;
  task.updatedAt = timestamp;
  tasks.unshift(nextTask);
  showToast(`Next recurring task created for ${formatTaskDate(nextDueDate)}`);
  return nextTask;
}

function setTaskStatus(task, status) {
  const nextStatus = TASK_STATUSES.some((item) => item.key === status) ? status : "todo";
  task.status = nextStatus;
  task.completed = nextStatus === "done";
  task.updatedAt = new Date().toISOString();
  if (task.completed) ensureNextRecurringTask(task);
  saveJSON(STORAGE.tasks, tasks);
  renderAll();
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

    const matchesTag = activeTaskTagFilter === "all" || task.tags.includes(activeTaskTagFilter);
    const matchesProject = activeTaskProjectFilter === "all" || task.project === activeTaskProjectFilter;
    const searchableText = [
      task.text,
      task.details || "",
      task.project || "",
      task.tags.join(" "),
      task.subtasks.map((item) => [
        item.text,
        item.details || "",
        item.attachments.map((attachment) => attachment.name).join(" ")
      ].join(" ")).join(" ")
    ].join(" ").toLowerCase();
    const matchesSearch = searchableText.includes(searchTerm.toLowerCase());

    return matchesStatus && matchesWorkspace && matchesTag && matchesProject && matchesSearch;
  });
}

function renderTaskTagFilter() {
  const select = $("taskTagFilter");
  if (!select) return;
  const tags = Array.from(new Set(tasks.flatMap((task) => task.tags))).sort((x, y) => x.localeCompare(y));
  const current = activeTaskTagFilter;
  select.innerHTML = `<option value="all">All tags</option>` + tags
    .map((tag) => `<option value="${escapeHtml(tag)}">#${escapeHtml(tag)}</option>`)
    .join("");
  activeTaskTagFilter = tags.includes(current) ? current : "all";
  select.value = activeTaskTagFilter;
}

function getTaskProjectNames() {
  return Array.from(new Set(
    tasks.map((task) => String(task.project || "").trim()).filter(Boolean)
  )).sort((a, b) => a.localeCompare(b));
}

function renderTaskProjectControls() {
  const names = getTaskProjectNames();

  const filter = $("taskProjectFilter");
  if (filter) {
    const current = activeTaskProjectFilter;
    filter.innerHTML = `<option value="all">All projects</option>` +
      names.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");
    activeTaskProjectFilter = names.includes(current) ? current : "all";
    filter.value = activeTaskProjectFilter;
  }

  const options = names.map((name) => `<option value="${escapeHtml(name)}"></option>`).join("");
  if ($("taskProjectSuggestions")) $("taskProjectSuggestions").innerHTML = options;
  if ($("quickCaptureProjectSuggestions")) $("quickCaptureProjectSuggestions").innerHTML = options;
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
    setTaskStatus(task, checkbox.checked ? "done" : "todo");
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

  const statusBadge = document.createElement("span");
  statusBadge.className = `task-badge task-status-badge status-${task.status}`;
  statusBadge.textContent = getTaskStatusLabel(task.status);

  meta.append(workspaceBadge, priorityBadge, statusBadge);

  if (task.project) {
    const projectBadge = document.createElement("span");
    projectBadge.className = "task-badge task-project-badge";
    projectBadge.textContent = `◆ ${task.project}`;
    meta.appendChild(projectBadge);
  }

  const recurrenceLabel = getTaskRecurrenceLabel(task.recurrence);
  if (recurrenceLabel) {
    const recurrenceBadge = document.createElement("span");
    recurrenceBadge.className = "task-badge recurrence-badge";
    recurrenceBadge.textContent = `↻ ${recurrenceLabel}`;
    meta.appendChild(recurrenceBadge);
  }

  task.tags.forEach((tag) => {
    const tagBadge = document.createElement("span");
    tagBadge.className = "task-badge task-tag-badge";
    tagBadge.textContent = `#${tag}`;
    meta.appendChild(tagBadge);
  });

  if (dueInfo) {
    const dueBadge = document.createElement("span");
    dueBadge.className = `task-badge due-badge ${dueInfo.className}`;
    dueBadge.textContent = dueInfo.label;
    meta.appendChild(dueBadge);
  }

  content.append(title, meta);

  if (task.subtasks.length) {
    const checklist = document.createElement("div");
    checklist.className = "task-checklist task-checklist-rich";
    const completedCount = task.subtasks.filter((item) => item.completed).length;

    const checklistHeading = document.createElement("div");
    checklistHeading.className = "task-checklist-heading";
    checklistHeading.innerHTML = `<strong>Checklist</strong><span>${completedCount}/${task.subtasks.length}</span>`;
    checklist.appendChild(checklistHeading);

    task.subtasks.forEach((subtask) => {
      const item = document.createElement("article");
      item.className = `task-subtask-rich ${subtask.completed ? "completed" : ""}`;

      const main = document.createElement("div");
      main.className = "task-subtask-main";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = subtask.completed;
      input.addEventListener("change", () => {
        subtask.completed = input.checked;
        task.updatedAt = new Date().toISOString();
        saveJSON(STORAGE.tasks, tasks);
        renderAll();
      });
      const text = document.createElement("span");
      text.textContent = subtask.text;
      main.append(input, text);

      const itemActions = document.createElement("div");
      itemActions.className = "task-subtask-actions";
      const addFile = document.createElement("button");
      addFile.type = "button";
      addFile.className = "task-subtask-action-button";
      addFile.textContent = "＋ Add file";
      addFile.addEventListener("click", () => openTaskChecklistFileModal({
        mode: "task", taskId: task.id, subtaskId: subtask.id
      }));
      const editDetails = document.createElement("button");
      editDetails.type = "button";
      editDetails.className = "task-subtask-action-button";
      editDetails.textContent = subtask.details ? "Edit details" : "＋ Details";
      itemActions.append(addFile, editDetails);

      const detailsEditor = document.createElement("div");
      detailsEditor.className = "task-subtask-inline-details";
      const detailsInput = document.createElement("textarea");
      detailsInput.maxLength = 2000;
      detailsInput.placeholder = "Add checklist item details";
      detailsInput.value = subtask.details;
      const detailsButtons = document.createElement("div");
      const saveDetails = document.createElement("button");
      saveDetails.type = "button";
      saveDetails.className = "primary-button";
      saveDetails.textContent = "Save details";
      const cancelDetails = document.createElement("button");
      cancelDetails.type = "button";
      cancelDetails.className = "secondary-button";
      cancelDetails.textContent = "Cancel";
      detailsButtons.append(saveDetails, cancelDetails);
      detailsEditor.append(detailsInput, detailsButtons);
      editDetails.addEventListener("click", () => {
        detailsInput.value = subtask.details;
        detailsEditor.classList.toggle("open");
        if (detailsEditor.classList.contains("open")) detailsInput.focus();
      });
      cancelDetails.addEventListener("click", () => detailsEditor.classList.remove("open"));
      saveDetails.addEventListener("click", () => {
        subtask.details = detailsInput.value.trim();
        task.updatedAt = new Date().toISOString();
        saveJSON(STORAGE.tasks, tasks);
        detailsEditor.classList.remove("open");
        renderAll();
        showToast("Checklist details saved");
      });

      const attachments = document.createElement("div");
      attachments.className = "task-subtask-attachments";
      subtask.attachments.forEach((attachment) => {
        const chip = document.createElement("span");
        chip.className = "task-checklist-file-chip";
        const open = document.createElement("button");
        open.type = "button";
        open.textContent = `▣ ${attachment.name}`;
        open.title = `Open ${attachment.name}`;
        open.addEventListener("click", () => openTaskChecklistAttachment(attachment));
        const detach = document.createElement("button");
        detach.type = "button";
        detach.className = "task-checklist-file-remove";
        detach.textContent = "✕";
        detach.title = "Detach file";
        detach.addEventListener("click", () => removeChecklistAttachment(
          { mode: "task", taskId: task.id, subtaskId: subtask.id }, attachment.documentId
        ));
        chip.append(open, detach);
        attachments.appendChild(chip);
      });

      item.append(main, itemActions);
      if (subtask.details) {
        const detailPreview = document.createElement("p");
        detailPreview.className = "task-subtask-detail-preview";
        detailPreview.textContent = subtask.details;
        item.appendChild(detailPreview);
      }
      item.append(attachments, detailsEditor);
      checklist.appendChild(item);
    });
    content.appendChild(checklist);
  }

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

  const statusSelect = document.createElement("select");
  statusSelect.className = "task-status-select";
  statusSelect.title = "Move task";
  TASK_STATUSES.forEach((statusOption) => {
    const option = document.createElement("option");
    option.value = statusOption.key;
    option.textContent = statusOption.label;
    statusSelect.appendChild(option);
  });
  statusSelect.value = task.status;
  statusSelect.addEventListener("change", () => setTaskStatus(task, statusSelect.value));
  actions.appendChild(statusSelect);

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

function buildKanbanTaskCard(task) {
  const card = document.createElement("article");
  card.className = `kanban-task-card priority-${task.priority}`;

  const title = document.createElement("strong");
  title.textContent = task.text;
  card.appendChild(title);

  const dueInfo = getDueDateInfo(task);
  const meta = document.createElement("div");
  meta.className = "kanban-task-meta";
  if (dueInfo) {
    const due = document.createElement("span");
    due.className = `kanban-due ${dueInfo.className}`;
    due.textContent = dueInfo.label;
    meta.appendChild(due);
  }
  if (task.subtasks.length) {
    const progress = document.createElement("span");
    progress.textContent = `☑ ${task.subtasks.filter((item) => item.completed).length}/${task.subtasks.length}`;
    meta.appendChild(progress);
    const attachmentCount = getChecklistAttachmentCount(task);
    if (attachmentCount) {
      const files = document.createElement("span");
      files.textContent = `▣ ${attachmentCount}`;
      meta.appendChild(files);
    }
  }
  if (getTaskRecurrenceLabel(task.recurrence)) {
    const recurring = document.createElement("span");
    recurring.textContent = `↻ ${getTaskRecurrenceLabel(task.recurrence)}`;
    meta.appendChild(recurring);
  }
  card.appendChild(meta);

  if (task.tags.length) {
    const tags = document.createElement("div");
    tags.className = "kanban-task-tags";
    task.tags.slice(0, 4).forEach((tag) => {
      const badge = document.createElement("span");
      badge.textContent = `#${tag}`;
      tags.appendChild(badge);
    });
    card.appendChild(tags);
  }

  const actions = document.createElement("div");
  actions.className = "kanban-task-actions";
  const statusSelect = document.createElement("select");
  statusSelect.setAttribute("aria-label", `Move ${task.text}`);
  TASK_STATUSES.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.key;
    option.textContent = item.label;
    statusSelect.appendChild(option);
  });
  statusSelect.value = task.status;
  statusSelect.addEventListener("change", () => setTaskStatus(task, statusSelect.value));

  const edit = document.createElement("button");
  edit.type = "button";
  edit.textContent = "Edit";
  edit.addEventListener("click", () => openTaskModal(task, null, task.id));
  actions.append(statusSelect, edit);
  card.appendChild(actions);
  return card;
}

function renderTaskKanban(visibleTasks) {
  const board = $("taskKanban");
  board.innerHTML = "";
  TASK_STATUSES.forEach((status) => {
    const column = document.createElement("section");
    column.className = `kanban-column status-${status.key}`;
    const columnTasks = visibleTasks.filter((task) => task.status === status.key);
    const heading = document.createElement("div");
    heading.className = "kanban-column-heading";
    heading.innerHTML = `<strong>${status.label}</strong><span>${columnTasks.length}</span>`;
    const list = document.createElement("div");
    list.className = "kanban-column-list";
    columnTasks.forEach((task) => list.appendChild(buildKanbanTaskCard(task)));
    if (!columnTasks.length) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "No tasks";
      list.appendChild(empty);
    }
    column.append(heading, list);
    board.appendChild(column);
  });
}

function updateTaskViewControls() {
  const listMode = taskViewMode === "list";
  $("taskList").classList.toggle("hidden", !listMode);
  $("taskKanban").classList.toggle("hidden", listMode);
  $("taskListViewButton").classList.toggle("active", listMode);
  $("taskKanbanViewButton").classList.toggle("active", !listMode);
}

function setTaskViewMode(mode) {
  taskViewMode = mode === "kanban" ? "kanban" : "list";
  localStorage.setItem(STORAGE.taskView, taskViewMode);
  renderTasks();
}

function renderTaskOverview() {
  const today = getLocalDateKey();
  const open = tasks.filter((task) => !task.completed);
  const done = tasks.filter((task) => task.completed);
  const dueToday = open.filter((task) => task.dueDate === today);
  const urgent = open.filter((task) => task.priority === "urgent");

  if ($("taskOverviewOpen")) $("taskOverviewOpen").textContent = String(open.length);
  if ($("taskOverviewToday")) $("taskOverviewToday").textContent = String(dueToday.length);
  if ($("taskOverviewUrgent")) $("taskOverviewUrgent").textContent = String(urgent.length);
  if ($("taskOverviewDone")) $("taskOverviewDone").textContent = String(done.length);
}

function renderTasks() {
  const list = $("taskList");
  renderTaskTagFilter();
  renderTaskProjectControls();
  renderTaskOverview();

  const visible = getVisibleTasks();
  list.innerHTML = "";
  updateTaskViewControls();

  if (taskViewMode === "list") {
    visible.forEach((task) => list.appendChild(buildTaskRow(task)));
  } else {
    renderTaskKanban(visible);
  }
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

function getDashboardGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning.";
  if (hour < 18) return "Good afternoon.";
  return "Good evening.";
}

function getDashboardDateLabel() {
  return new Date().toLocaleDateString("en-PH", {
    weekday: "long",
    month: "long",
    day: "numeric"
  }).toUpperCase();
}

function getDashboardTaskQueue(openTasks) {
  const todayKey = getLocalDateKey();
  const priorityRank = { urgent: 0, important: 1, normal: 2 };

  return [...openTasks]
    .sort((a, b) => {
      const aToday = a.dueDate === todayKey ? 0 : 1;
      const bToday = b.dueDate === todayKey ? 0 : 1;
      if (aToday !== bToday) return aToday - bToday;

      const aOverdue = a.dueDate && a.dueDate < todayKey ? 0 : 1;
      const bOverdue = b.dueDate && b.dueDate < todayKey ? 0 : 1;
      if (aOverdue !== bOverdue) return aOverdue - bOverdue;

      const priorityDifference =
        (priorityRank[a.priority] ?? 3) - (priorityRank[b.priority] ?? 3);
      if (priorityDifference) return priorityDifference;

      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return String(b.updatedAt || b.createdAt || "").localeCompare(
        String(a.updatedAt || a.createdAt || "")
      );
    })
    .slice(0, 5);
}

function getDashboardTaskDueLabel(task) {
  if (!task.dueDate) return "";
  const today = getLocalDateKey();
  if (task.dueDate === today) return "Due today";
  if (task.dueDate < today) return "Overdue";
  return formatEventDate(task.dueDate);
}

function renderDashboardTaskQueue(openTasks) {
  const list = $("dashboardTaskList");
  if (!list) return;

  const queue = getDashboardTaskQueue(openTasks);
  const today = getLocalDateKey();
  const todayCount = openTasks.filter((task) => task.dueDate === today).length;
  const overdueCount = openTasks.filter(
    (task) => task.dueDate && task.dueDate < today
  ).length;

  $("dashboardTaskEyebrow").textContent =
    overdueCount ? "ATTENTION" : todayCount ? "TODAY" : "PRIORITY QUEUE";
  $("dashboardTaskHeading").textContent =
    overdueCount
      ? `${overdueCount} overdue task${overdueCount === 1 ? "" : "s"}`
      : todayCount
        ? `${todayCount} task${todayCount === 1 ? "" : "s"} due today`
        : "What to work on next";
  $("dashboardTaskSubheading").textContent =
    overdueCount
      ? "Clear overdue work first, then move into today."
      : todayCount
        ? "Your time-sensitive work is already sorted to the top."
        : "Urgent and important work is surfaced automatically.";

  $("dashboardTaskEmpty").hidden = queue.length > 0;

  list.innerHTML = queue.map((task) => {
    const dueLabel = getDashboardTaskDueLabel(task);
    const statusLabel =
      typeof getTaskStatusLabel === "function"
        ? getTaskStatusLabel(task.status || (task.completed ? "done" : "todo"))
        : "Open";

    return `
      <button class="dashboard-task-row ${escapeHtml(task.priority || "normal")}"
        type="button" data-dashboard-task-id="${escapeHtml(String(task.id))}">
        <span class="dashboard-task-priority-dot" aria-hidden="true"></span>
        <span class="dashboard-task-copy">
          <strong>${escapeHtml(task.text || "Untitled task")}</strong>
          <span>
            ${escapeHtml(String(task.workspace || "personal"))}
            <em>·</em>
            ${escapeHtml(statusLabel)}
            ${dueLabel ? `<em>·</em><b>${escapeHtml(dueLabel)}</b>` : ""}
          </span>
        </span>
        <span class="dashboard-task-arrow" aria-hidden="true">→</span>
      </button>
    `;
  }).join("");

  list.querySelectorAll("[data-dashboard-task-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const task = tasks.find(
        (item) => String(item.id) === button.dataset.dashboardTaskId
      );
      if (!task) {
        openApp("tasks");
        return;
      }

      openApp("tasks");
      openTaskModal(task, "tasks", task.id);
    });
  });
}

function renderDashboardNextEvent() {
  const upcoming = getUpcomingEvents();
  const nextEvent = upcoming[0];
  const dateBadge = $("dashboardNextEventDateBadge");
  const title = $("dashboardNextEventTitle");
  const meta = $("dashboardNextEventMeta");
  if (!dateBadge || !title || !meta) return;

  if (!nextEvent) {
    dateBadge.textContent = "—";
    title.textContent = "Nothing scheduled";
    meta.textContent = "Your next event will appear here.";
    return;
  }

  const date = new Date(`${nextEvent.date}T00:00:00`);
  dateBadge.innerHTML =
    `<strong>${escapeHtml(String(date.getDate()))}</strong>` +
    `<span>${escapeHtml(date.toLocaleDateString("en-US", { month: "short" }).toUpperCase())}</span>`;
  title.textContent = nextEvent.title || "Untitled event";
  meta.textContent = `${formatEventDate(nextEvent.date)} · ${nextEvent.workspace || "Personal"}`;
}

function renderDashboardStickyNote() {
  const button = $("dashboardStickyNote");
  if (!button) return;

  const sticky = getSortedNoteItems(
    noteItems.filter((note) => note.sticky)
  )[0];

  button.dataset.noteId = sticky?.id || "";
  button.classList.toggle("has-note", Boolean(sticky));

  $("dashboardStickyTitle").textContent =
    sticky?.title || "No sticky note";
  $("dashboardStickyPreview").textContent =
    sticky
      ? getNotePreview(sticky, 180)
      : "Mark a note as Sticky and it will surface here.";
  $("dashboardStickyMeta").textContent =
    sticky ? formatNoteUpdatedAt(sticky.updatedAt) : "Open Notes";
}

function getDashboardRecentDocuments() {
  return documents
    .filter((documentItem) => !documentItem.deleted_at)
    .sort((a, b) => {
      const aDate = String(a.updated_at || a.created_at || "");
      const bDate = String(b.updated_at || b.created_at || "");
      return bDate.localeCompare(aDate);
    })
    .slice(0, 3);
}

function renderDashboardRecentDocuments() {
  const list = $("dashboardRecentDocuments");
  if (!list) return;

  const recent = getDashboardRecentDocuments();
  $("dashboardRecentDocumentsEmpty").hidden = recent.length > 0;

  list.innerHTML = recent.map((documentItem) => `
    <button class="dashboard-document-row" type="button"
      data-dashboard-document-id="${escapeHtml(String(documentItem.id))}">
      <span class="dashboard-document-type">${escapeHtml(getDocumentTypeLabel(documentItem))}</span>
      <span class="dashboard-document-copy">
        <strong>${escapeHtml(documentItem.name || "Untitled file")}</strong>
        <small>${escapeHtml(documentItem.folder || "Documents")} · ${escapeHtml(formatDocumentDate(documentItem.updated_at || documentItem.created_at))}</small>
      </span>
      <span aria-hidden="true">→</span>
    </button>
  `).join("");

  list.querySelectorAll("[data-dashboard-document-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const documentItem = documents.find(
        (item) => String(item.id) === button.dataset.dashboardDocumentId
      );
      if (!documentItem) {
        openApp("documents");
        return;
      }

      openApp("documents");
      if (typeof openDocumentPreview === "function") {
        openDocumentPreview(documentItem);
      }
    });
  });
}

function getDashboardOurSpacePlan() {
  const today = getLocalDateKey();
  return [...ourSpacePlans]
    .filter((plan) => plan.status !== "done")
    .sort((a, b) => {
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;

      const aFuture = a.target_date && a.target_date >= today ? 0 : 1;
      const bFuture = b.target_date && b.target_date >= today ? 0 : 1;
      if (aFuture !== bFuture) return aFuture - bFuture;

      if (a.target_date && b.target_date) {
        return a.target_date.localeCompare(b.target_date);
      }
      if (a.target_date) return -1;
      if (b.target_date) return 1;

      return String(b.updated_at || "").localeCompare(String(a.updated_at || ""));
    })[0] || null;
}

function renderDashboardOurSpace() {
  const button = $("dashboardOurSpacePlan");
  if (!button) return;

  const plan = getDashboardOurSpacePlan();
  button.dataset.planId = plan?.id || "";
  button.classList.toggle("has-plan", Boolean(plan));

  $("dashboardOurSpaceIcon").textContent =
    plan && typeof getOurSpaceCategoryIcon === "function"
      ? getOurSpaceCategoryIcon(plan.category)
      : "♥";
  $("dashboardOurSpaceTitle").textContent =
    plan?.title || "No active plan yet";

  if (!plan) {
    $("dashboardOurSpaceMeta").textContent =
      "Create something to look forward to.";
    return;
  }

  const meta = [];
  if (plan.target_date) meta.push(formatOurSpaceDate(plan.target_date));
  if (plan.place) meta.push(plan.place);
  meta.push(getOurSpaceStatusLabel(plan.status));
  $("dashboardOurSpaceMeta").textContent = meta.join(" · ");
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
  $("dashboardFocus").textContent = Number(
    localStorage.getItem(STORAGE.focusTotal) || 0
  );

  if ($("dashboardGreeting")) {
    $("dashboardGreeting").textContent = getDashboardGreeting();
  }
  if ($("dashboardDateLabel")) {
    $("dashboardDateLabel").textContent = getDashboardDateLabel();
  }

  $("topPriority").textContent =
    topPriority ? topPriority.text : "Everything is complete";
  $("completionText").textContent =
    tasks.length
      ? `${percent}% of your tasks are complete.`
      : "Your task list is clear. Capture something when you are ready.";
  $("completionPercent").textContent = `${percent}%`;
  $("progressRing").style.background =
    `conic-gradient(var(--accent) ${percent * 3.6}deg, var(--surface-soft) 0deg)`;

  const reminders = getVisibleReminderItems();
  const reminderSummary = getReminderSummary(reminders);
  const pressingReminders = reminderSummary.attention + reminderSummary.today;
  $("dashboardReminderCount").textContent = String(pressingReminders);
  $("dashboardReminderLabel").textContent =
    reminderSummary.attention
      ? `${reminderSummary.attention} need attention`
      : reminderSummary.today
        ? `${reminderSummary.today} due today`
        : reminderSummary.upcoming
          ? `${reminderSummary.upcoming} upcoming`
          : "Nothing pressing";

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

  renderDashboardTaskQueue(open);
  renderDashboardNextEvent();
  renderDashboardStickyNote();
  renderDashboardRecentDocuments();
  renderDashboardOurSpace();
}

function updateCalendarOverview() {
  const today = new Date();
  const currentMonthKey =
    `${shownYear}-${String(shownMonth + 1).padStart(2, "0")}`;

  const upcoming = getUpcomingEvents();
  const monthEvents = events.filter((event) =>
    String(event.date || "").startsWith(currentMonthKey)
  );
  const monthTasks = tasks.filter((task) =>
    !task.completed && String(task.dueDate || "").startsWith(currentMonthKey)
  );

  if ($("calendarTodayLabel")) {
    $("calendarTodayLabel").textContent =
      today.toLocaleDateString("en-PH", {
        weekday: "long",
        month: "long",
        day: "numeric"
      });
  }
  if ($("calendarUpcomingCount")) {
    $("calendarUpcomingCount").textContent = String(upcoming.length);
  }
  if ($("calendarMonthEventCount")) {
    $("calendarMonthEventCount").textContent = String(monthEvents.length);
  }
  if ($("calendarMonthTaskCount")) {
    $("calendarMonthTaskCount").textContent = String(monthTasks.length);
  }
}

function selectCalendarDate(dateKey) {
  const input = $("eventDate");
  if (!input) return;

  input.value = dateKey;

  const titleInput = $("eventTitle");
  if (titleInput) titleInput.focus();

  if (document.documentElement.classList.contains("phone-ui")) {
    $("eventForm")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
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

  updateCalendarOverview();

  for (let index = 0; index < firstDay; index += 1) {
    const spacer = document.createElement("div");
    spacer.className = "calendar-day-spacer";
    spacer.setAttribute("aria-hidden", "true");
    calendarDays.appendChild(spacer);
  }

  for (let day = 1; day <= numberOfDays; day += 1) {
    const element = document.createElement("button");
    element.type = "button";
    element.className = "calendar-day";
    element.textContent = day;

    const isToday =
      day === today.getDate() &&
      shownMonth === today.getMonth() &&
      shownYear === today.getFullYear();

    if (isToday) element.classList.add("today");

    const dateKey =
      `${shownYear}-${String(shownMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    element.dataset.date = dateKey;
    element.setAttribute(
      "aria-label",
      new Date(`${dateKey}T00:00:00`).toLocaleDateString("en-PH", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric"
      })
    );

    if (events.some((event) => event.date === dateKey)) {
      element.classList.add("has-event");
    }

    if (tasks.some((task) => !task.completed && task.dueDate === dateKey)) {
      element.classList.add("has-task-due");
    }

    element.addEventListener("click", () => selectCalendarDate(dateKey));
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
  updateCalendarOverview();
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
      renderActivityTimeline();
      renderWorkspacesHub();
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

  if ($("documentLatestUpload")) {
    const latest = [...activeDocuments].sort((a, b) =>
      String(b.updated_at || b.created_at || "").localeCompare(
        String(a.updated_at || a.created_at || "")
      )
    )[0];

    if (!latest) {
      $("documentLatestUpload").textContent = "—";
      $("documentLatestUpload").title = "No active files";
    } else {
      const latestDate = new Date(latest.updated_at || latest.created_at);
      const today = new Date();
      const sameDay =
        latestDate.getFullYear() === today.getFullYear() &&
        latestDate.getMonth() === today.getMonth() &&
        latestDate.getDate() === today.getDate();

      $("documentLatestUpload").textContent = sameDay
        ? "Today"
        : latestDate.toLocaleDateString("en-PH", {
            month: "short",
            day: "numeric"
          });
      $("documentLatestUpload").title = latest.name || "Latest active file";
    }
  }

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



function getSmartDocumentExtension(documentItem) {
  const name = String(documentItem?.name || "").toLocaleLowerCase();
  const lastDot = name.lastIndexOf(".");
  return lastDot >= 0 ? name.slice(lastDot + 1) : "";
}

function getSmartDocumentSupport(documentItem) {
  const extension = getSmartDocumentExtension(documentItem);
  const mime = String(documentItem?.mime_type || "").toLocaleLowerCase();

  if (extension === "pdf" || mime === "application/pdf") {
    return { key: "pdf", label: "PDF text extraction", supported: true };
  }
  if (extension === "docx") return { key: "docx", label: "Word DOCX text extraction", supported: true };
  if (extension === "pptx") return { key: "pptx", label: "PowerPoint PPTX text extraction", supported: true };
  if (extension === "xlsx") return { key: "xlsx", label: "Excel XLSX text extraction", supported: true };
  if (extension === "odt") return { key: "odt", label: "OpenDocument text extraction", supported: true };
  if (extension === "rtf") return { key: "rtf", label: "RTF text extraction", supported: true };

  const textExtensions = new Set([
    "txt", "md", "markdown", "csv", "tsv", "json", "html", "htm", "xml",
    "log", "eml", "ini", "yaml", "yml", "css", "js", "mjs", "sql"
  ]);

  if (mime.startsWith("text/") || textExtensions.has(extension)) {
    return { key: "text", label: "Plain-text extraction", supported: true };
  }

  return {
    key: "unsupported",
    label: "Text extraction unavailable for this file type",
    supported: false
  };
}

function getSmartDocumentCacheKey(documentItem) {
  const version = Math.max(1, Number(documentItem?.current_version || 1));
  return `${String(documentItem?.id || "unknown")}:v${version}`;
}

function openSmartTextDatabase() {
  if (!window.indexedDB) return Promise.resolve(null);
  if (smartTextDatabasePromise) return smartTextDatabasePromise;

  smartTextDatabasePromise = new Promise((resolve) => {
    const request = indexedDB.open(SMART_TEXT_DB_NAME, SMART_TEXT_DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(SMART_TEXT_STORE)) {
        const store = database.createObjectStore(SMART_TEXT_STORE, { keyPath: "key" });
        store.createIndex("documentId", "documentId", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      console.warn("Smart text cache is unavailable:", request.error);
      resolve(null);
    };
  });

  return smartTextDatabasePromise;
}

async function getCachedSmartDocumentText(documentItem) {
  const database = await openSmartTextDatabase();
  if (!database) return null;
  const key = getSmartDocumentCacheKey(documentItem);

  return new Promise((resolve) => {
    const transaction = database.transaction(SMART_TEXT_STORE, "readonly");
    const request = transaction.objectStore(SMART_TEXT_STORE).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => resolve(null);
  });
}

async function saveCachedSmartDocumentText(documentItem, record) {
  const database = await openSmartTextDatabase();
  if (!database) return false;

  const payload = {
    ...record,
    key: getSmartDocumentCacheKey(documentItem),
    documentId: String(documentItem.id),
    version: Math.max(1, Number(documentItem.current_version || 1)),
    name: documentItem.name,
    savedAt: new Date().toISOString()
  };

  return new Promise((resolve) => {
    const transaction = database.transaction(SMART_TEXT_STORE, "readwrite");
    transaction.objectStore(SMART_TEXT_STORE).put(payload);
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => resolve(false);
  });
}

async function deleteCachedSmartDocumentText(documentItem) {
  const database = await openSmartTextDatabase();
  if (!database) return false;
  const key = getSmartDocumentCacheKey(documentItem);

  return new Promise((resolve) => {
    const transaction = database.transaction(SMART_TEXT_STORE, "readwrite");
    transaction.objectStore(SMART_TEXT_STORE).delete(key);
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => resolve(false);
  });
}

function normalizeSmartExtractedText(value) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t ]+\n/g, "\n")
    .replace(/\n[\t ]+/g, "\n")
    .replace(/[\t ]{3,}/g, "  ")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function setSmartDocumentStatus(message, type = "") {
  const element = $("documentSmartStatus");
  if (!element) return;
  element.textContent = message;
  element.className = `document-smart-status ${type}`.trim();
}

function setSmartDocumentBusy(busy) {
  smartDocumentExtractionBusy = busy;
  const support = getSmartDocumentSupport(smartDocumentItem);
  const extractButton = $("extractDocumentTextButton");
  const refreshButton = $("refreshDocumentTextButton");
  const clearButton = $("clearDocumentTextCacheButton");

  if (extractButton) {
    extractButton.disabled = busy || !support.supported;
    extractButton.textContent = busy ? "Extracting…" : (smartDocumentRecord ? "Use saved text" : "Extract text");
  }
  if (refreshButton) refreshButton.disabled = busy || !support.supported || !smartDocumentRecord;
  if (clearButton) clearButton.disabled = busy || !smartDocumentRecord;
}

function countSmartWords(text) {
  const matches = String(text || "").trim().match(/\S+/g);
  return matches ? matches.length : 0;
}

function getSmartSelectedText({ fallbackToAll = false } = {}) {
  const textarea = $("documentSmartText");
  if (!textarea) return "";
  const start = textarea.selectionStart || 0;
  const end = textarea.selectionEnd || 0;
  const selected = start !== end ? textarea.value.slice(start, end).trim() : "";
  if (selected) return selected;
  return fallbackToAll ? textarea.value.trim() : "";
}

function updateSmartSelectionStats() {
  const selection = getSmartSelectedText();
  const element = $("documentSmartSelectionStats");
  if (!element) return;
  element.textContent = selection
    ? `${selection.length.toLocaleString("en-PH")} selected characters`
    : "No passage selected";
}

function updateSmartActionButtons() {
  const hasText = Boolean(smartDocumentRecord?.text);
  [
    "copySelectedDocumentTextButton",
    "createTaskFromDocumentTextButton",
    "createEventFromDocumentTextButton",
    "copyAllDocumentTextButton",
    "exportDocumentTextReportButton",
    "copyDocumentForChatGPTButton"
  ].forEach((id) => {
    const button = $(id);
    if (button) button.disabled = !hasText || smartDocumentExtractionBusy;
  });
  if ($("documentSmartSearch")) $("documentSmartSearch").disabled = !hasText;
}

function renderSmartDocumentRecord(record, { fromCache = false } = {}) {
  smartDocumentRecord = record;
  const text = String(record?.text || "");
  $("documentSmartText").value = text;
  $("documentSmartSearch").value = "";
  smartDocumentSearchMatches = [];
  smartDocumentSearchIndex = -1;
  $("documentSmartMatchCount").textContent = "0 matches";
  $("documentSmartPreviousMatch").disabled = true;
  $("documentSmartNextMatch").disabled = true;

  if (text) {
    const words = countSmartWords(text);
    const details = [
      `${text.length.toLocaleString("en-PH")} characters`,
      `${words.toLocaleString("en-PH")} words`
    ];
    if (record.pages) details.push(`${record.pages} page${record.pages === 1 ? "" : "s"}`);
    if (record.sheets) details.push(`${record.sheets} sheet${record.sheets === 1 ? "" : "s"}`);
    if (record.slides) details.push(`${record.slides} slide${record.slides === 1 ? "" : "s"}`);
    if (record.truncated) details.push("text limit reached");
    $("documentSmartTextStats").textContent = details.join(" · ");
    setSmartDocumentStatus(
      fromCache
        ? `Loaded locally saved text from ${formatDocumentDate(record.savedAt)}.`
        : "Text extracted and saved locally on this device.",
      "success"
    );
  } else {
    $("documentSmartTextStats").textContent = "No readable text found";
  }

  updateSmartSelectionStats();
  updateSmartActionButtons();
  setSmartDocumentBusy(false);
}

function resetSmartDocumentReader() {
  smartDocumentRecord = null;
  smartDocumentSearchMatches = [];
  smartDocumentSearchIndex = -1;
  $("documentSmartText").value = "";
  $("documentSmartSearch").value = "";
  $("documentSmartSearch").disabled = true;
  $("documentSmartMatchCount").textContent = "0 matches";
  $("documentSmartPreviousMatch").disabled = true;
  $("documentSmartNextMatch").disabled = true;
  $("documentSmartTextStats").textContent = "No local text saved";
  $("documentSmartSelectionStats").textContent = "No passage selected";
  updateSmartActionButtons();
}

async function openDocumentSmartTools(documentItem) {
  if (!documentItem) return;
  smartDocumentItem = documentItem;
  resetSmartDocumentReader();

  const support = getSmartDocumentSupport(documentItem);
  $("documentSmartToolsFileName").textContent = documentItem.name;
  $("documentSmartSupportLabel").textContent = support.label;
  $("documentSmartSupportHelp").textContent = support.supported
    ? "Text is extracted locally in your browser and saved only on this device for faster reuse."
    : "This file can still be previewed or downloaded, but local text extraction is not available.";

  $("documentSmartToolsModal").classList.add("open");
  $("documentSmartToolsModal").setAttribute("aria-hidden", "false");
  setSmartDocumentStatus(
    support.supported
      ? "Checking this device for previously extracted text…"
      : "Supported formats include PDF, DOCX, PPTX, XLSX, ODT, RTF, and common text files.",
    support.supported ? "" : "warning"
  );
  setSmartDocumentBusy(false);

  if (!support.supported) return;
  const cached = await getCachedSmartDocumentText(documentItem);
  if (smartDocumentItem?.id !== documentItem.id) return;

  if (cached?.text) {
    renderSmartDocumentRecord(cached, { fromCache: true });
  } else {
    setSmartDocumentStatus("No local text is saved yet. Tap Extract text to process this document.");
    setSmartDocumentBusy(false);
  }
}

function closeDocumentSmartTools() {
  $("documentSmartToolsModal").classList.remove("open");
  $("documentSmartToolsModal").setAttribute("aria-hidden", "true");
  smartDocumentItem = null;
  smartDocumentRecord = null;
  smartDocumentSearchMatches = [];
  smartDocumentSearchIndex = -1;
}

async function getPdfJsModule() {
  if (!smartPdfModulePromise) {
    smartPdfModulePromise = import(PDFJS_MODULE_URL).then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
      return pdfjs;
    }).catch((error) => {
      smartPdfModulePromise = null;
      throw error;
    });
  }
  return smartPdfModulePromise;
}

async function extractPdfText(arrayBuffer, onProgress) {
  const pdfjs = await getPdfJsModule();
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(arrayBuffer),
    cMapUrl: PDFJS_CMAP_URL,
    cMapPacked: true,
    standardFontDataUrl: PDFJS_STANDARD_FONT_URL,
    useWorkerFetch: true
  });
  const pdf = await loadingTask.promise;
  const totalPages = pdf.numPages;
  const pageLimit = Math.min(totalPages, SMART_PDF_MAX_PAGES);
  const pageTexts = [];
  let totalCharacters = 0;
  let truncated = totalPages > pageLimit;

  try {
    for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
      onProgress?.(`Reading PDF page ${pageNumber} of ${pageLimit}…`);
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent({ disableNormalization: false });
      const parts = [];
      content.items.forEach((item) => {
        if (typeof item.str !== "string") return;
        parts.push(item.str);
        parts.push(item.hasEOL ? "\n" : " ");
      });
      const pageText = normalizeSmartExtractedText(parts.join(""));
      if (pageText) pageTexts.push(`--- Page ${pageNumber} ---\n${pageText}`);
      totalCharacters += pageText.length;
      if (totalCharacters >= SMART_TEXT_MAX_CHARACTERS) {
        truncated = true;
        break;
      }
      page.cleanup?.();
    }
  } finally {
    await pdf.destroy();
  }

  let text = normalizeSmartExtractedText(pageTexts.join("\n\n"));
  if (text.length > SMART_TEXT_MAX_CHARACTERS) {
    text = text.slice(0, SMART_TEXT_MAX_CHARACTERS);
    truncated = true;
  }
  if (text.replace(/--- Page \d+ ---/g, "").trim().length < 10) {
    throw new Error("No readable PDF text was found. This may be a scanned image-only PDF, which needs OCR.");
  }
  return { text, pages: totalPages, truncated, sourceType: "pdf" };
}

function findZipEndOfCentralDirectory(view) {
  const minimum = Math.max(0, view.byteLength - 65557);
  for (let offset = view.byteLength - 22; offset >= minimum; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  return -1;
}

async function inflateZipEntry(bytes, method) {
  if (method === 0) return bytes;
  if (method !== 8) throw new Error(`Unsupported ZIP compression method ${method}.`);
  if (typeof DecompressionStream === "undefined") {
    throw new Error("This browser cannot decompress Office documents locally.");
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readSelectedZipEntries(arrayBuffer, selector) {
  const view = new DataView(arrayBuffer);
  const eocdOffset = findZipEndOfCentralDirectory(view);
  if (eocdOffset < 0) throw new Error("The document ZIP structure could not be read.");

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  let cursor = view.getUint32(eocdOffset + 16, true);
  const decoder = new TextDecoder("utf-8");
  const result = new Map();

  for (let entryIndex = 0; entryIndex < totalEntries; entryIndex += 1) {
    if (view.getUint32(cursor, true) !== 0x02014b50) {
      throw new Error("The Office document directory is invalid.");
    }

    const compressionMethod = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const fileNameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localHeaderOffset = view.getUint32(cursor + 42, true);
    const fileNameBytes = new Uint8Array(arrayBuffer, cursor + 46, fileNameLength);
    const fileName = decoder.decode(fileNameBytes);

    if (selector(fileName)) {
      if (view.getUint32(localHeaderOffset, true) !== 0x04034b50) {
        throw new Error("A document file entry is invalid.");
      }
      const localNameLength = view.getUint16(localHeaderOffset + 26, true);
      const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
      const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const compressedBytes = new Uint8Array(arrayBuffer, dataOffset, compressedSize);
      const inflated = await inflateZipEntry(compressedBytes, compressionMethod);
      result.set(fileName, inflated);
    }

    cursor += 46 + fileNameLength + extraLength + commentLength;
  }

  return result;
}

function parseXmlDocument(xmlText, label = "document") {
  const xml = new DOMParser().parseFromString(xmlText, "application/xml");
  if (xml.querySelector("parsererror")) {
    throw new Error(`The ${label} XML could not be read.`);
  }
  return xml;
}

function walkOfficeXmlText(node, output, mode = "word") {
  if (node.nodeType === 3) {
    if (mode === "odt") output.push(node.nodeValue || "");
    return;
  }
  if (node.nodeType !== 1) {
    Array.from(node.childNodes || []).forEach((child) => walkOfficeXmlText(child, output, mode));
    return;
  }

  const localName = String(node.localName || node.nodeName || "").split(":").pop();
  const textNames = mode === "odt" ? new Set(["span"]) : new Set(["t"]);

  if (textNames.has(localName)) {
    output.push(node.textContent || "");
    return;
  }
  if (["tab"].includes(localName)) {
    output.push("\t");
    return;
  }
  if (["br", "cr", "line-break"].includes(localName)) {
    output.push("\n");
    return;
  }

  Array.from(node.childNodes || []).forEach((child) => walkOfficeXmlText(child, output, mode));

  if (["p", "h"].includes(localName)) output.push("\n");
  if (["tc", "table-cell"].includes(localName)) output.push("\t");
  if (["tr", "table-row"].includes(localName)) output.push("\n");
}

function extractOfficeXmlText(xmlText, mode = "word") {
  const xml = parseXmlDocument(xmlText, mode);
  const output = [];
  walkOfficeXmlText(xml.documentElement, output, mode);
  return normalizeSmartExtractedText(output.join(""));
}

function sortNumberedOfficeFiles(first, second) {
  const firstNumber = Number((first.match(/(\d+)(?=\.xml$)/i) || [])[1] || 0);
  const secondNumber = Number((second.match(/(\d+)(?=\.xml$)/i) || [])[1] || 0);
  return firstNumber - secondNumber || first.localeCompare(second);
}

async function extractDocxText(arrayBuffer) {
  const entries = await readSelectedZipEntries(arrayBuffer, (name) =>
    /^word\/(document|header\d+|footer\d+|footnotes|endnotes)\.xml$/i.test(name)
  );
  if (!entries.has("word/document.xml")) throw new Error("The DOCX main document could not be found.");

  const decoder = new TextDecoder("utf-8");
  const names = [...entries.keys()].sort((first, second) => {
    if (first === "word/document.xml") return -1;
    if (second === "word/document.xml") return 1;
    return sortNumberedOfficeFiles(first, second);
  });
  const sections = names.map((name) => extractOfficeXmlText(decoder.decode(entries.get(name)), "word")).filter(Boolean);
  return { text: normalizeSmartExtractedText(sections.join("\n\n")), sourceType: "docx" };
}

async function extractPptxText(arrayBuffer) {
  const entries = await readSelectedZipEntries(arrayBuffer, (name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name));
  const decoder = new TextDecoder("utf-8");
  const names = [...entries.keys()].sort(sortNumberedOfficeFiles);
  const slides = names.map((name, index) => {
    const text = extractOfficeXmlText(decoder.decode(entries.get(name)), "word");
    return text ? `--- Slide ${index + 1} ---\n${text}` : "";
  }).filter(Boolean);
  if (!slides.length) throw new Error("No readable PowerPoint slide text was found.");
  return { text: normalizeSmartExtractedText(slides.join("\n\n")), slides: names.length, sourceType: "pptx" };
}

function elementsByLocalName(root, localName) {
  return Array.from(root.getElementsByTagName("*")).filter((element) => element.localName === localName);
}

function getCellColumnIndex(reference) {
  const letters = String(reference || "").match(/^[A-Z]+/i)?.[0]?.toUpperCase() || "A";
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return Math.max(0, index - 1);
}

async function extractXlsxText(arrayBuffer) {
  const entries = await readSelectedZipEntries(arrayBuffer, (name) =>
    name === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/i.test(name)
  );
  const decoder = new TextDecoder("utf-8");
  const sharedStrings = [];

  if (entries.has("xl/sharedStrings.xml")) {
    const xml = parseXmlDocument(decoder.decode(entries.get("xl/sharedStrings.xml")), "shared strings");
    elementsByLocalName(xml, "si").forEach((item) => {
      const value = elementsByLocalName(item, "t").map((node) => node.textContent || "").join("");
      sharedStrings.push(value);
    });
  }

  const sheetNames = [...entries.keys()].filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name)).sort(sortNumberedOfficeFiles);
  const sheetTexts = [];

  sheetNames.forEach((name, sheetIndex) => {
    const xml = parseXmlDocument(decoder.decode(entries.get(name)), `worksheet ${sheetIndex + 1}`);
    const rows = [];
    elementsByLocalName(xml, "row").forEach((row) => {
      const values = [];
      elementsByLocalName(row, "c").forEach((cell) => {
        const column = getCellColumnIndex(cell.getAttribute("r"));
        while (values.length < column) values.push("");
        const type = cell.getAttribute("t") || "";
        let value = "";
        if (type === "inlineStr") {
          value = elementsByLocalName(cell, "t").map((node) => node.textContent || "").join("");
        } else {
          const raw = elementsByLocalName(cell, "v")[0]?.textContent || "";
          if (type === "s") value = sharedStrings[Number(raw)] ?? raw;
          else if (type === "b") value = raw === "1" ? "TRUE" : "FALSE";
          else value = raw;
        }
        values[column] = value;
      });
      rows.push(values.join("\t").replace(/\t+$/g, ""));
    });
    const body = rows.filter((row) => row.trim()).join("\n");
    if (body) sheetTexts.push(`--- Sheet ${sheetIndex + 1} ---\n${body}`);
  });

  if (!sheetTexts.length) throw new Error("No readable spreadsheet cell text was found.");
  return { text: normalizeSmartExtractedText(sheetTexts.join("\n\n")), sheets: sheetNames.length, sourceType: "xlsx" };
}

async function extractOdtText(arrayBuffer) {
  const entries = await readSelectedZipEntries(arrayBuffer, (name) => name === "content.xml");
  if (!entries.has("content.xml")) throw new Error("The ODT content file could not be found.");
  const text = extractOfficeXmlText(new TextDecoder("utf-8").decode(entries.get("content.xml")), "odt");
  if (!text) throw new Error("No readable ODT text was found.");
  return { text, sourceType: "odt" };
}

function extractRtfText(rawText) {
  const decodedHex = String(rawText || "").replace(/\\'([0-9a-fA-F]{2})/g, (_match, value) =>
    String.fromCharCode(parseInt(value, 16))
  );
  return normalizeSmartExtractedText(
    decodedHex
      .replace(/\\par[d]?\b/g, "\n")
      .replace(/\\line\b/g, "\n")
      .replace(/\\tab\b/g, "\t")
      .replace(/\\u(-?\d+)\??/g, (_match, value) => String.fromCharCode(Number(value) < 0 ? Number(value) + 65536 : Number(value)))
      .replace(/\\[a-zA-Z]+-?\d* ?/g, "")
      .replace(/[{}]/g, "")
      .replace(/\\([\\{}])/g, "$1")
  );
}

async function extractPlainFileText(blob, documentItem) {
  const extension = getSmartDocumentExtension(documentItem);
  let text = await blob.text();

  if (extension === "json") {
    try { text = JSON.stringify(JSON.parse(text), null, 2); } catch (_error) { /* keep raw text */ }
  } else if (["html", "htm"].includes(extension)) {
    const parsed = new DOMParser().parseFromString(text, "text/html");
    text = parsed.body?.innerText || parsed.body?.textContent || text;
  } else if (extension === "xml") {
    const parsed = new DOMParser().parseFromString(text, "application/xml");
    if (!parsed.querySelector("parsererror")) text = parsed.documentElement?.textContent || text;
  } else if (extension === "rtf") {
    text = extractRtfText(text);
  }

  text = normalizeSmartExtractedText(text);
  if (!text) throw new Error("No readable text was found in this file.");
  return { text, sourceType: extension || "text" };
}

async function extractSmartTextFromBlob(blob, documentItem, onProgress) {
  const support = getSmartDocumentSupport(documentItem);
  if (!support.supported) throw new Error("This file type is not supported for local text extraction.");

  if (support.key === "text" || support.key === "rtf") {
    onProgress?.("Reading text file…");
    return extractPlainFileText(blob, documentItem);
  }

  const arrayBuffer = await blob.arrayBuffer();
  if (support.key === "pdf") return extractPdfText(arrayBuffer, onProgress);
  if (support.key === "docx") return extractDocxText(arrayBuffer);
  if (support.key === "pptx") return extractPptxText(arrayBuffer);
  if (support.key === "xlsx") return extractXlsxText(arrayBuffer);
  if (support.key === "odt") return extractOdtText(arrayBuffer);
  throw new Error("This file type is not supported for local text extraction.");
}

async function extractCurrentSmartDocument({ force = false } = {}) {
  if (!smartDocumentItem || smartDocumentExtractionBusy) return;
  const documentItem = smartDocumentItem;
  const support = getSmartDocumentSupport(documentItem);
  if (!support.supported) return;

  if (!force) {
    const cached = await getCachedSmartDocumentText(documentItem);
    if (cached?.text) {
      renderSmartDocumentRecord(cached, { fromCache: true });
      return;
    }
  }

  setSmartDocumentBusy(true);
  setSmartDocumentStatus("Downloading the private document for local processing…");

  try {
    const result = await window.BoxCloud.downloadDocument(documentItem.storage_path);
    if (result.error || !result.data) throw result.error || new Error("The document could not be downloaded.");
    if (smartDocumentItem?.id !== documentItem.id) return;

    const extracted = await extractSmartTextFromBlob(result.data, documentItem, (message) => {
      if (smartDocumentItem?.id === documentItem.id) setSmartDocumentStatus(message);
    });

    let text = normalizeSmartExtractedText(extracted.text);
    let truncated = Boolean(extracted.truncated);
    if (text.length > SMART_TEXT_MAX_CHARACTERS) {
      text = text.slice(0, SMART_TEXT_MAX_CHARACTERS);
      truncated = true;
    }
    if (!text) throw new Error("No readable text was found in this document.");

    const record = { ...extracted, text, truncated, extractedAt: new Date().toISOString() };
    await saveCachedSmartDocumentText(documentItem, record);
    if (smartDocumentItem?.id === documentItem.id) renderSmartDocumentRecord(record);
  } catch (error) {
    console.error("Smart document extraction failed:", error);
    setSmartDocumentStatus(error?.message || "The document text could not be extracted.", "error");
    setSmartDocumentBusy(false);
    updateSmartActionButtons();
  }
}

function updateSmartDocumentSearch({ keepIndex = false } = {}) {
  const query = $("documentSmartSearch").value.trim().toLocaleLowerCase();
  const text = $("documentSmartText").value;
  smartDocumentSearchMatches = [];

  if (query && text) {
    const haystack = text.toLocaleLowerCase();
    let position = 0;
    while (position < haystack.length && smartDocumentSearchMatches.length < 5000) {
      const match = haystack.indexOf(query, position);
      if (match < 0) break;
      smartDocumentSearchMatches.push({ start: match, end: match + query.length });
      position = match + Math.max(1, query.length);
    }
  }

  if (!keepIndex || smartDocumentSearchIndex >= smartDocumentSearchMatches.length) {
    smartDocumentSearchIndex = smartDocumentSearchMatches.length ? 0 : -1;
  }
  $("documentSmartPreviousMatch").disabled = !smartDocumentSearchMatches.length;
  $("documentSmartNextMatch").disabled = !smartDocumentSearchMatches.length;
  $("documentSmartMatchCount").textContent = smartDocumentSearchMatches.length
    ? `${smartDocumentSearchIndex + 1} of ${smartDocumentSearchMatches.length}`
    : "0 matches";

  if (smartDocumentSearchIndex >= 0) showSmartDocumentSearchMatch(0);
}

function showSmartDocumentSearchMatch(direction) {
  if (!smartDocumentSearchMatches.length) return;
  smartDocumentSearchIndex = (smartDocumentSearchIndex + direction + smartDocumentSearchMatches.length) % smartDocumentSearchMatches.length;
  const match = smartDocumentSearchMatches[smartDocumentSearchIndex];
  const textarea = $("documentSmartText");
  textarea.focus({ preventScroll: true });
  textarea.setSelectionRange(match.start, match.end);
  const ratio = match.start / Math.max(1, textarea.value.length);
  textarea.scrollTop = Math.max(0, ratio * (textarea.scrollHeight - textarea.clientHeight));
  $("documentSmartMatchCount").textContent = `${smartDocumentSearchIndex + 1} of ${smartDocumentSearchMatches.length}`;
  updateSmartSelectionStats();
}

async function copyTextToClipboard(text) {
  const value = String(text || "");
  if (!value) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch (_error) {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  }
}

function getSmartSourceText({ selectedFirst = true } = {}) {
  if (!smartDocumentRecord?.text) return "";
  const selected = selectedFirst ? getSmartSelectedText() : "";
  return selected || smartDocumentRecord.text;
}

function firstUsefulLine(text, maximum = 180) {
  const line = String(text || "").split(/\n+/).map((item) => item.trim()).find(Boolean) || "Document follow-up";
  return line.slice(0, maximum);
}

function workspaceForDocument(documentItem) {
  const folder = String(documentItem?.folder || "").toLocaleLowerCase();
  if (folder === "sk") return "sk";
  if (["fda", "philhealth", "suppliers"].includes(folder)) return "pharmacy";
  if (["hr"].includes(folder)) return "clinic";
  return "personal";
}

function buildSmartDocumentMetadata(documentItem) {
  const compliance = getDocumentCompliance(documentItem);
  const taskIds = new Set(getDocumentLinkedTaskIds(documentItem));
  const eventIds = new Set(getDocumentLinkedEventIds(documentItem));
  const linkedTasks = tasks.filter((task) => taskIds.has(String(task.id))).map((task) => task.text);
  const linkedEvents = events.filter((event) => eventIds.has(String(event.id))).map((event) => `${formatEventDate(event.date)} — ${event.title}`);

  return [
    `Document: ${documentItem.name}`,
    `Folder: ${documentItem.folder || "Personal"}`,
    `File type: ${documentItem.mime_type || getDocumentTypeLabel(documentItem)}`,
    `File size: ${formatBytes(documentItem.size_bytes)}`,
    `Uploaded: ${formatDocumentDate(documentItem.created_at)}`,
    `Current version: ${Math.max(1, Number(documentItem.current_version || 1))}`,
    `Expiry date: ${formatDocumentExpiryDate(documentItem.expiry_date)}`,
    `Compliance status: ${compliance.label}`,
    `Reminder: ${documentItem.expiry_date ? `${Number(documentItem.reminder_days ?? 30)} days before` : "Not applicable"}`,
    `Tags: ${getDocumentTags(documentItem).join(", ") || "None"}`,
    `Details: ${String(documentItem.details || "").trim() || "None"}`,
    `Linked tasks: ${linkedTasks.join("; ") || "None"}`,
    `Linked calendar events: ${linkedEvents.join("; ") || "None"}`
  ].join("\n");
}

async function copySelectedSmartText() {
  const text = getSmartSelectedText();
  if (!text) {
    showToast("Select a passage first");
    return;
  }
  const copied = await copyTextToClipboard(text);
  showToast(copied ? "Selected text copied" : "Could not copy text");
}

async function copyAllSmartText() {
  const copied = await copyTextToClipboard(smartDocumentRecord?.text || "");
  showToast(copied ? "Document text copied" : "Could not copy text");
}

function createTaskFromSmartText() {
  const source = getSmartSourceText();
  if (!source || !smartDocumentItem) return;
  const documentItem = smartDocumentItem;
  const title = firstUsefulLine(source, 180);
  const details = `Source document: ${documentItem.name}\n\n${source}`.slice(0, 4000);
  const workspace = workspaceForDocument(documentItem);
  const dueDate = documentItem.expiry_date || "";
  closeDocumentSmartTools();
  closeDocumentPreview();
  openTaskModal({ text: title, details, workspace, priority: "normal", dueDate });
}

function prepareEventFromSmartText() {
  const source = getSmartSourceText();
  if (!source || !smartDocumentItem) return;
  const title = firstUsefulLine(source, 180);
  const date = smartDocumentItem.expiry_date || new Date().toISOString().slice(0, 10);
  const workspace = workspaceForDocument(smartDocumentItem);
  closeDocumentSmartTools();
  closeDocumentPreview();
  openApp("calendar");
  $("eventTitle").value = title;
  $("eventDate").value = date;
  $("eventWorkspace").value = workspace;
  setTimeout(() => $("eventTitle").focus(), 50);
  showToast("Review the event date, then tap Save event");
}

async function copySmartPromptForChatGPT() {
  if (!smartDocumentItem || !smartDocumentRecord?.text) return;
  const instruction = $("documentSmartChatGPTInstruction").value.trim() || "Summarize this document.";
  const source = getSmartSourceText();
  const maximum = 120000;
  const limited = source.length > maximum ? source.slice(0, maximum) : source;
  const prompt = [
    instruction,
    "",
    "DOCUMENT INFORMATION",
    buildSmartDocumentMetadata(smartDocumentItem),
    "",
    "IMPORTANT:",
    "- Base the response only on the document text below.",
    "- Preserve the document's terminology.",
    "- Do not invent missing details.",
    source.length > maximum ? `- The copied text was limited to the first ${maximum.toLocaleString("en-PH")} characters.` : "",
    "",
    "BEGIN DOCUMENT TEXT",
    limited,
    "END DOCUMENT TEXT"
  ].filter((line) => line !== "").join("\n");
  const copied = await copyTextToClipboard(prompt);
  showToast(copied ? "Prompt copied for ChatGPT" : "Could not copy prompt");
}

function exportSmartDocumentReport() {
  if (!smartDocumentItem || !smartDocumentRecord?.text) return;
  const report = [
    "THE BOX OS — DOCUMENT REPORT",
    `Generated: ${new Date().toLocaleString("en-PH")}`,
    "",
    buildSmartDocumentMetadata(smartDocumentItem),
    "",
    "EXTRACTED TEXT",
    smartDocumentRecord.text
  ].join("\n");
  const fileName = `${cleanFileNameSegment(smartDocumentItem.name.replace(/\.[^.]+$/, ""))}-document-report.txt`;
  downloadTextFile(fileName, report, "text/plain");
  showToast("Document report downloaded");
}

async function clearCurrentSmartDocumentCache() {
  if (!smartDocumentItem) return;
  await deleteCachedSmartDocumentText(smartDocumentItem);
  resetSmartDocumentReader();
  setSmartDocumentStatus("Local extracted text cleared. The cloud document was not changed.", "success");
  setSmartDocumentBusy(false);
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
  renderDashboard();
  renderFavoritesHub();
  renderProjectsHub();
  renderRoutinesHub();
  renderActivityTimeline();
  renderWorkspacesHub();
  renderWeeklyReview();
  renderTodayPlanner();
  renderAgenda();
  if (isCommandPaletteOpen()) renderCommandPalette();
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
  renderDashboard();
  renderFavoritesHub();
  renderActivityTimeline();

  if (uploaded) {
    setDocumentUploadStatus(
      `${uploaded} file${uploaded === 1 ? "" : "s"} uploaded to ${folder}.`,
      "success"
    );
    showToast(`${uploaded} document${uploaded === 1 ? "" : "s"} uploaded`);
  }
}




function getJournalEditorSnapshot() {
  if (!$('journalEntryDate')) return null;
  return {
    selectedId: selectedJournalEntryId,
    entry_date: $('journalEntryDate').value || new Date().toISOString().slice(0, 10),
    entry_time: "",
    title: $('journalEntryTitle').value || "",
    content: $('journalEntryContent').value || "",
    mood: "",
    tags: normalizeJournalTags($('journalEntryTags').value || ""),
    favorite: $('journalEntryFavorite').checked,
    savedAt: new Date().toISOString()
  };
}

function saveJournalDraft() {
  const draft = getJournalEditorSnapshot();
  if (!draft) return;
  const hasWriting = draft.title.trim() || draft.content.trim() || draft.tags.length || draft.favorite;
  if (!hasWriting && !draft.selectedId) {
    localStorage.removeItem(STORAGE.journalDraft);
  } else {
    localStorage.setItem(STORAGE.journalDraft, JSON.stringify(draft));
  }
  $('journalDraftStatus').textContent = 'Draft saved locally';
}

function clearJournalDraft() {
  localStorage.removeItem(STORAGE.journalDraft);
  journalEditorDirty = false;
  if ($('journalDraftStatus')) $('journalDraftStatus').textContent = 'Saved';
}

function readJournalDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(STORAGE.journalDraft) || 'null');
    return draft && typeof draft === 'object' ? draft : null;
  } catch (error) {
    console.error('Could not read journal draft:', error);
    return null;
  }
}

function getJournalToday() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getJournalCurrentTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function getJournalWordCount(value = $('journalEntryContent')?.value || '') {
  const words = String(value).trim().match(/\S+/g);
  return words ? words.length : 0;
}

function updateJournalWordCount() {
  if (!$('journalWordCount')) return;
  const count = getJournalWordCount();
  $('journalWordCount').textContent = `${count} word${count === 1 ? '' : 's'}`;
}

function formatJournalDate(value) {
  if (!value) return 'No date';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatJournalTime(value) {
  if (!value) return '';
  const match = String(value).match(/^(\d{2}):(\d{2})/);
  if (!match) return value;
  const date = new Date();
  date.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
}

function getJournalMoodIcon(mood) {
  return ({ Great: '☀', Good: '◉', Okay: '○', Low: '☂', Stressed: '⚡' })[mood] || '·';
}

function compareJournalEntries(a, b) {
  const dateCompare = String(b.entry_date).localeCompare(String(a.entry_date));
  if (dateCompare) return dateCompare;
  return String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
}

function getFilteredJournalEntries() {
  const query = journalSearchTerm.toLocaleLowerCase();
  return journalEntries
    .filter((entry) => {
      if (journalFavoritesOnly && !entry.favorite) return false;
      if (journalDateFrom && entry.entry_date < journalDateFrom) return false;
      if (journalDateTo && entry.entry_date > journalDateTo) return false;
      if (!query) return true;
      const haystack = [entry.title, entry.content, ...entry.tags].join(' ').toLocaleLowerCase();
      return haystack.includes(query);
    })
    .sort(compareJournalEntries);
}

function canLeaveJournalEditor() {
  if (!journalEditorDirty) return true;
  return window.confirm('You have unsaved journal changes. A local draft has been saved. Continue without saving the entry?');
}

function populateJournalEditor(values = {}, { mode = 'new', draftRestored = false } = {}) {
  if (!$('journalEntryDate')) return;
  selectedJournalEntryId = values.id || values.selectedId || null;
  $('journalEntryDate').value = normalizeJournalDate(values.entry_date || getJournalToday());
    $('journalEntryTitle').value = values.title || '';
  $('journalEntryContent').value = values.content || '';
    $('journalEntryTags').value = normalizeJournalTags(values.tags).join(', ');
  $('journalEntryFavorite').checked = Boolean(values.favorite);

  journalEditorInitialized = true;
  journalEditorDirty = Boolean(draftRestored);
  $('journalEditorModeLabel').textContent = selectedJournalEntryId ? 'EDIT ENTRY' : 'NEW ENTRY';
  $('journalEditorHeading').textContent = selectedJournalEntryId
    ? (values.title || 'Untitled entry')
    : "Write today's entry";
  $('deleteJournalEntryButton').disabled = !selectedJournalEntryId;
  $('exportJournalEntryButton').disabled = !selectedJournalEntryId;
  $('journalDraftStatus').textContent = draftRestored ? 'Local draft restored' : (selectedJournalEntryId ? 'Saved entry' : 'Draft ready');
  updateJournalWordCount();
}

function initializeJournalEditor() {
  if (journalEditorInitialized || !$('journalEntryDate')) return;
  const draft = readJournalDraft();
  if (draft) {
    populateJournalEditor(draft, { mode: draft.selectedId ? 'edit' : 'new', draftRestored: true });
    return;
  }
  populateJournalEditor({ entry_date: getJournalToday() }, { mode: 'new' });
}

function newJournalEntry() {
  if (!canLeaveJournalEditor()) return;
  selectedJournalEntryId = null;
  localStorage.removeItem(STORAGE.journalDraft);
  populateJournalEditor({ entry_date: getJournalToday() }, { mode: 'new' });
  renderJournalCenter();
  $('journalEntryTitle').focus();
}

function selectJournalEntry(entryId, { bypassDirtyCheck = false } = {}) {
  if (!bypassDirtyCheck && !canLeaveJournalEditor()) return;
  const entry = journalEntries.find((item) => item.id === entryId);
  if (!entry) return;
  localStorage.removeItem(STORAGE.journalDraft);
  populateJournalEditor(entry, { mode: 'edit' });
  renderJournalCenter();
}

function renderJournalEntryList() {
  const list = $('journalEntryList');
  if (!list) return;
  const entries = getFilteredJournalEntries();
  $('journalEntryCount').textContent = String(entries.length);
  $('journalEmptyState').hidden = entries.length > 0;

  list.innerHTML = entries.map((entry) => {
    const preview = String(entry.content || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    return `
      <button class="journal-entry-card ${entry.id === selectedJournalEntryId ? 'active' : ''}"
        type="button" data-journal-entry-id="${escapeHtml(entry.id)}">
        <div class="journal-entry-card-top">
          <span>${escapeHtml(formatJournalDate(entry.entry_date))}</span>
          <span class="journal-entry-card-icons">${entry.favorite ? '★' : ''}</span>
        </div>
        <strong>${escapeHtml(entry.title || 'Untitled entry')}</strong>
        <p>${escapeHtml(preview || 'No entry text yet.')}</p>
        <div class="journal-entry-card-tags">
          ${entry.tags.slice(0, 3).map((tag) => `<span>#${escapeHtml(tag)}</span>`).join('')}
        </div>
      </button>`;
  }).join('');

  list.querySelectorAll('[data-journal-entry-id]').forEach((button) => {
    button.addEventListener('click', () => selectJournalEntry(button.dataset.journalEntryId));
  });
}

function updateJournalNavigation() {
  if (!$('previousJournalEntryButton')) return;
  const entries = getFilteredJournalEntries();
  const index = entries.findIndex((entry) => entry.id === selectedJournalEntryId);
  $('previousJournalEntryButton').disabled = index < 0 || index >= entries.length - 1;
  $('nextJournalEntryButton').disabled = index <= 0;
}

function formatCompactCount(value) {
  const count = Number(value) || 0;
  if (count >= 1000000) return `${(count / 1000000).toFixed(count >= 10000000 ? 0 : 1)}m`;
  if (count >= 1000) return `${(count / 1000).toFixed(count >= 10000 ? 0 : 1)}k`;
  return String(count);
}

function renderJournalOverview() {
  if (!$('journalOverviewTotal')) return;

  const now = new Date();
  const monthKey =
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const monthEntries = journalEntries.filter((entry) =>
    String(entry.entry_date || '').startsWith(monthKey)
  );
  const favorites = journalEntries.filter((entry) => entry.favorite);
  const totalWords = journalEntries.reduce((sum, entry) => {
    const content = String(entry.content || '').trim();
    if (!content) return sum;
    return sum + content.split(/\s+/).filter(Boolean).length;
  }, 0);

  $('journalOverviewTotal').textContent = String(journalEntries.length);
  $('journalOverviewMonth').textContent = String(monthEntries.length);
  $('journalOverviewFavorites').textContent = String(favorites.length);
  $('journalOverviewWords').textContent = formatCompactCount(totalWords);
}

function renderJournalCenter() {
  if (!$('journalEntryList')) return;
  initializeJournalEditor();
  $('journalSearchInput').value = journalSearchTerm;
  $('journalFavoritesOnly').checked = journalFavoritesOnly;
  $('journalDateFrom').value = journalDateFrom;
  $('journalDateTo').value = journalDateTo;
  renderJournalOverview();
  renderJournalEntryList();
  updateJournalNavigation();
  updateJournalWordCount();
  renderFavoritesHub();
  renderActivityTimeline();
}

async function saveJournalEntryFromEditor() {
  const snapshot = getJournalEditorSnapshot();
  if (!snapshot) return;
  if (!snapshot.entry_date) {
    showToast('Choose a journal date');
    $('journalEntryDate').focus();
    return;
  }
  if (!snapshot.title.trim() && !snapshot.content.trim()) {
    showToast('Add a title or write something before saving');
    $('journalEntryContent').focus();
    return;
  }

  const now = new Date().toISOString();
  const existing = selectedJournalEntryId
    ? journalEntries.find((entry) => entry.id === selectedJournalEntryId)
    : null;

  const entry = normalizeJournalEntry({
    id: existing?.id || createJournalEntryId(),
    entry_date: snapshot.entry_date,
    entry_time: snapshot.entry_time,
    title: snapshot.title,
    content: snapshot.content,
    mood: snapshot.mood,
    tags: snapshot.tags,
    favorite: snapshot.favorite,
    created_at: existing?.created_at || now,
    updated_at: now
  });

  const index = journalEntries.findIndex((item) => item.id === entry.id);
  if (index >= 0) journalEntries[index] = entry;
  else journalEntries.unshift(entry);

  persistJournalEntries({ pendingCloudSync: !window.BoxCloud?.isReady() });
  selectedJournalEntryId = entry.id;
  clearJournalDraft();
  populateJournalEditor(entry, { mode: 'edit' });
  renderJournalCenter();

  if (window.BoxCloud?.isReady() && window.BoxCloud.saveJournalEntry) {
    $('journalDraftStatus').textContent = 'Syncing…';
    const result = await window.BoxCloud.saveJournalEntry(entry);
    if (result.error) {
      localStorage.setItem(STORAGE.journalPendingSync, '1');
      $('journalDraftStatus').textContent = 'Saved locally · cloud sync pending';
      showToast('Journal saved locally; cloud sync failed');
      return;
    }
    localStorage.removeItem(STORAGE.journalPendingSync);
    $('journalDraftStatus').textContent = 'Saved & synced';
  }
  showToast('Journal entry saved');
}

async function deleteSelectedJournalEntry() {
  if (!selectedJournalEntryId) return;
  const entry = journalEntries.find((item) => item.id === selectedJournalEntryId);
  if (!entry) return;
  if (!window.confirm(`Delete “${entry.title || 'this journal entry'}”?`)) return;

  const deletedId = entry.id;
  journalEntries = journalEntries.filter((item) => item.id !== deletedId);
  persistJournalEntries({ pendingCloudSync: !window.BoxCloud?.isReady() });
  localStorage.removeItem(STORAGE.journalDraft);
  selectedJournalEntryId = null;
  journalEditorInitialized = false;

  if (window.BoxCloud?.isReady() && window.BoxCloud.deleteJournalEntry) {
    const result = await window.BoxCloud.deleteJournalEntry(deletedId);
    if (result.error) {
      localStorage.setItem(STORAGE.journalPendingSync, '1');
      showToast('Deleted locally; cloud delete is pending');
    }
  }

  initializeJournalEditor();
  renderJournalCenter();
  showToast('Journal entry deleted');
}

function journalEntryToText(entry) {
  const lines = [
    entry.title || 'Untitled entry',
    formatJournalDate(entry.entry_date),
    entry.tags.length ? `Tags: ${entry.tags.join(', ')}` : '',
    entry.favorite ? 'Favorite: Yes' : '',
    '',
    entry.content || ''
  ].filter((line, index) => line || index >= 4);
  return lines.join('\n');
}

function exportSelectedJournalEntry() {
  const entry = journalEntries.find((item) => item.id === selectedJournalEntryId);
  if (!entry) return;
  const name = cleanFileNameSegment(entry.title || `journal-${entry.entry_date}`);
  downloadTextFile(`${entry.entry_date}-${name}.txt`, journalEntryToText(entry), 'text/plain');
  showToast('Journal entry exported');
}

function exportFilteredJournalEntries() {
  const entries = getFilteredJournalEntries();
  if (!entries.length) {
    showToast('No journal entries match the current filters');
    return;
  }
  const text = entries.map((entry) => journalEntryToText(entry)).join(`\n\n${'='.repeat(72)}\n\n`);
  const range = journalDateFrom || journalDateTo
    ? `${journalDateFrom || 'start'}-to-${journalDateTo || 'latest'}`
    : 'filtered';
  downloadTextFile(`the-box-journal-${cleanFileNameSegment(range)}.txt`, text, 'text/plain');
  showToast(`${entries.length} journal ${entries.length === 1 ? 'entry' : 'entries'} exported`);
}

function showJournalToday() {
  const today = getJournalToday();
  journalDateFrom = today;
  journalDateTo = today;
  renderJournalCenter();
  const todayEntry = getFilteredJournalEntries()[0];
  if (todayEntry && canLeaveJournalEditor()) selectJournalEntry(todayEntry.id, { bypassDirtyCheck: true });
}

function clearJournalFilters() {
  journalSearchTerm = '';
  journalFavoritesOnly = false;
  journalDateFrom = '';
  journalDateTo = '';
  renderJournalCenter();
}

function navigateJournalEntry(direction) {
  if (!canLeaveJournalEditor()) return;
  const entries = getFilteredJournalEntries();
  const index = entries.findIndex((entry) => entry.id === selectedJournalEntryId);
  const targetIndex = direction === 'previous' ? index + 1 : index - 1;
  const target = entries[targetIndex];
  if (target) selectJournalEntry(target.id, { bypassDirtyCheck: true });
}


function setJournalFocusMode(enabled) {
  const journalWindow = document.querySelector('[data-app-window="journal"]');
  const button = $('journalFocusModeButton');
  if (!journalWindow || !button) return;

  journalFocusMode = Boolean(enabled);
  journalWindow.classList.toggle('journal-focus-mode', journalFocusMode);

  if (journalFocusMode) {
    journalFocusAutoMaximized =
      !isCompactWindowMode() && !journalWindow.classList.contains('maximized');
    if (journalFocusAutoMaximized) toggleMaximize(journalWindow);
    button.textContent = '✕ Exit focus';
    button.title = 'Exit focus writing mode';
    requestAnimationFrame(() => $('journalEntryContent')?.focus());
  } else {
    if (journalFocusAutoMaximized && journalWindow.classList.contains('maximized')) {
      toggleMaximize(journalWindow);
    }
    journalFocusAutoMaximized = false;
    button.textContent = '⛶ Focus';
    button.title = 'Maximize writing area';
  }
}

function toggleJournalFocusMode() {
  setJournalFocusMode(!journalFocusMode);
}

function exitJournalFocusMode() {
  if (journalFocusMode) setJournalFocusMode(false);
}

function markJournalEditorDirty() {
  journalEditorDirty = true;
  $('journalDraftStatus').textContent = 'Saving local draft…';
  updateJournalWordCount();
  saveJournalDraft();
}

async function syncPendingJournalIfNeeded() {
  if (!window.BoxCloud?.isReady() || !window.BoxCloud.replaceJournalEntries) return;
  if (localStorage.getItem(STORAGE.journalPendingSync) !== '1') return;
  const result = await window.BoxCloud.replaceJournalEntries(journalEntries);
  if (!result.error) {
    localStorage.removeItem(STORAGE.journalPendingSync);
    if ($('journalDraftStatus') && !journalEditorDirty) $('journalDraftStatus').textContent = 'Saved & synced';
  }
}


function getOurSpaceToday() {
  return new Date().toISOString().slice(0, 10);
}

function formatOurSpaceDate(value) {
  if (!value) return "No date yet";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function formatOurSpaceMoney(value) {
  if (value === null || value === undefined || value === "") return "";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "";
  return amount.toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 2
  });
}

function getOurSpaceStatusLabel(status) {
  return {
    idea: "Idea",
    planning: "Planning",
    scheduled: "Scheduled",
    someday: "Someday",
    done: "Memory"
  }[status] || "Idea";
}

function getOurSpaceCategoryIcon(category) {
  return {
    "Date": "♥",
    "Travel": "✈",
    "Food / Café": "☕",
    "Movie / Series": "▶",
    "Activity": "✦",
    "Gift idea": "🎁",
    "Future purchase": "◇",
    "Milestone": "★",
    "Bucket list": "✓",
    "Other": "•"
  }[category] || "•";
}

function sortOurSpacePlans(plans) {
  const statusRank = { scheduled: 0, planning: 1, idea: 2, someday: 3, done: 4 };
  return [...plans].sort((a, b) => {
    if (a.status === "done" && b.status === "done") {
      const aDone = a.actual_date || a.target_date || "0000-00-00";
      const bDone = b.actual_date || b.target_date || "0000-00-00";
      return bDone.localeCompare(aDone);
    }
    if (a.status === "done") return 1;
    if (b.status === "done") return -1;

    const aDate = a.target_date || "9999-12-31";
    const bDate = b.target_date || "9999-12-31";
    if (aDate !== bDate) return aDate.localeCompare(bDate);

    const statusDiff = (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9);
    if (statusDiff) return statusDiff;
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
    return String(b.created_at).localeCompare(String(a.created_at));
  });
}

function getFilteredOurSpacePlans() {
  const query = ourSpaceSearchTerm.toLocaleLowerCase();
  return sortOurSpacePlans(ourSpacePlans.filter((plan) => {
    if (ourSpaceCategoryFilter !== "all" && plan.category !== ourSpaceCategoryFilter) return false;
    if (ourSpaceStatusFilter === "all" && plan.status === "done") return false;
    if (ourSpaceStatusFilter !== "all" && plan.status !== ourSpaceStatusFilter) return false;
    if (ourSpaceFavoritesOnly && !plan.favorite) return false;

    if (!query) return true;
    const haystack = [
      plan.title,
      plan.category,
      getOurSpaceStatusLabel(plan.status),
      plan.place,
      plan.notes,
      plan.favorite_memory,
      ...plan.checklist.map((item) => item.text),
      ...plan.links.flatMap((item) => [item.label, item.url]),
      ...plan.attachments.map((item) => item.name)
    ].join(" ").toLocaleLowerCase();
    return haystack.includes(query);
  }));
}

function getOurSpaceSummary() {
  const today = getOurSpaceToday();
  return {
    upcoming: ourSpacePlans.filter((plan) => plan.status !== "done" && plan.target_date && plan.target_date >= today).length,
    bucket: ourSpacePlans.filter((plan) => ["idea", "someday"].includes(plan.status)).length,
    planning: ourSpacePlans.filter((plan) => ["planning", "scheduled"].includes(plan.status)).length,
    archive: ourSpacePlans.filter((plan) => plan.status === "done").length
  };
}

function renderOurSpaceSummary() {
  if (!$("ourSpaceUpcomingCount")) return;
  const summary = getOurSpaceSummary();
  $("ourSpaceUpcomingCount").textContent = String(summary.upcoming);
  $("ourSpaceBucketCount").textContent = String(summary.bucket);
  $("ourSpacePlanningCount").textContent = String(summary.planning);
  $("ourSpaceMemoryCount").textContent = String(summary.archive);
}

function renderOurSpacePlanList() {
  const list = $("ourSpacePlanList");
  if (!list) return;
  const plans = getFilteredOurSpacePlans();
  $("ourSpacePlanCount").textContent = String(plans.length);
  $("ourSpaceEmptyState").hidden = plans.length > 0;

  list.innerHTML = plans.map((plan) => {
    const checklistDone = plan.checklist.filter((item) => item.completed).length;
    const budget = formatOurSpaceMoney(plan.estimated_budget);
    const date = plan.status === "done"
      ? (plan.actual_date || plan.target_date)
      : plan.target_date;
    return `
      <button class="our-space-plan-card ${plan.id === selectedOurSpacePlanId ? "active" : ""} ${plan.status === "done" ? "memory" : ""}"
        type="button" data-our-space-plan-id="${escapeHtml(plan.id)}">
        <span class="our-space-plan-icon">${escapeHtml(getOurSpaceCategoryIcon(plan.category))}</span>
        <span class="our-space-plan-card-body">
          <span class="our-space-plan-card-top">
            <strong>${escapeHtml(plan.title || "Untitled plan")}</strong>
            <span>${plan.favorite ? "♥" : ""}</span>
          </span>
          <small>${escapeHtml(plan.category)} · ${plan.status === "done" ? "Archived" : escapeHtml(getOurSpaceStatusLabel(plan.status))}</small>
          <span class="our-space-plan-card-meta">
            ${date ? `<em>${escapeHtml(formatOurSpaceDate(date))}</em>` : ""}
            ${plan.place ? `<em>${escapeHtml(plan.place)}</em>` : ""}
            ${budget ? `<em>${escapeHtml(budget)}</em>` : ""}
            ${plan.checklist.length ? `<em>${checklistDone}/${plan.checklist.length} checklist</em>` : ""}
          </span>
        </span>
      </button>
    `;
  }).join("");

  list.querySelectorAll("[data-our-space-plan-id]").forEach((button) => {
    button.addEventListener("click", () => selectOurSpacePlan(button.dataset.ourSpacePlanId));
  });
}

function renderOurSpaceChecklist() {
  const list = $("ourSpaceChecklistList");
  if (!list) return;
  $("ourSpaceChecklistEmpty").hidden = ourSpaceDraftChecklist.length > 0;
  list.innerHTML = "";

  ourSpaceDraftChecklist.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "our-space-checklist-item";
    row.dataset.itemId = item.id;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = item.completed;
    checkbox.addEventListener("change", () => {
      item.completed = checkbox.checked;
    });

    const input = document.createElement("input");
    input.type = "text";
    input.maxLength = 240;
    input.placeholder = "Checklist item";
    input.value = item.text;
    input.addEventListener("input", () => { item.text = input.value; });
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      addOurSpaceChecklistItem(index + 1);
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "our-space-small-danger";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      ourSpaceDraftChecklist = ourSpaceDraftChecklist.filter((entry) => entry.id !== item.id);
      renderOurSpaceChecklist();
    });

    row.append(checkbox, input, remove);
    list.appendChild(row);
  });
}

function addOurSpaceChecklistItem(insertAt = ourSpaceDraftChecklist.length) {
  const item = { id: createOurSpaceId(), text: "", completed: false };
  ourSpaceDraftChecklist.splice(insertAt, 0, item);
  renderOurSpaceChecklist();
  setTimeout(() => {
    const input = $("ourSpaceChecklistList")
      ?.querySelector(`[data-item-id="${item.id}"] input[type="text"]`);
    input?.focus();
  }, 0);
}

function renderOurSpaceLinks() {
  const list = $("ourSpaceLinkList");
  if (!list) return;
  $("ourSpaceLinkEmpty").hidden = ourSpaceDraftLinks.length > 0;
  list.innerHTML = "";

  ourSpaceDraftLinks.forEach((link) => {
    const row = document.createElement("div");
    row.className = "our-space-link-item";
    row.dataset.linkId = link.id;

    const label = document.createElement("input");
    label.type = "text";
    label.maxLength = 120;
    label.placeholder = "Label";
    label.value = link.label;
    label.addEventListener("input", () => { link.label = label.value; });

    const url = document.createElement("input");
    url.type = "url";
    url.maxLength = 2000;
    url.placeholder = "https://...";
    url.value = link.url;
    url.addEventListener("input", () => { link.url = url.value; });

    const open = document.createElement("button");
    open.type = "button";
    open.className = "secondary-button";
    open.textContent = "Open";
    open.disabled = !link.url;
    open.addEventListener("click", () => {
      const value = link.url.trim();
      if (!value) return;
      const href = /^https?:\/\//i.test(value) ? value : `https://${value}`;
      window.open(href, "_blank", "noopener,noreferrer");
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "our-space-small-danger";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      ourSpaceDraftLinks = ourSpaceDraftLinks.filter((entry) => entry.id !== link.id);
      renderOurSpaceLinks();
    });

    row.append(label, url, open, remove);
    list.appendChild(row);
  });
}

function addOurSpaceLink() {
  const link = { id: createOurSpaceId(), label: "", url: "" };
  ourSpaceDraftLinks.push(link);
  renderOurSpaceLinks();
  setTimeout(() => {
    $("ourSpaceLinkList")
      ?.querySelector(`[data-link-id="${link.id}"] input`)
      ?.focus();
  }, 0);
}

function renderOurSpaceDocumentPicker() {
  const select = $("ourSpaceDocumentPicker");
  if (!select) return;
  const activeDocuments = documents
    .filter((item) => !item.deleted_at)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));

  const current = select.value;
  select.innerHTML = '<option value="">Choose a Vault file</option>' +
    activeDocuments.map((item) => `
      <option value="${escapeHtml(item.id)}">${escapeHtml(item.name)} · ${escapeHtml(item.folder || "Documents")}</option>
    `).join("");

  if (activeDocuments.some((item) => String(item.id) === current)) select.value = current;
}

function isOurSpaceImageAttachment(attachment = {}) {
  const mime = String(attachment.mimeType || "").toLowerCase();
  const name = String(attachment.name || "").toLowerCase();
  return (
    mime.startsWith("image/") ||
    /\.(png|jpe?g|gif|webp|bmp|svg|heic|heif|avif)$/.test(name)
  );
}

function getOurSpaceAttachmentDocument(attachment = {}) {
  return documents.find(
    (item) => String(item.id) === String(attachment.documentId)
  ) || null;
}

function getOurSpaceAttachmentStoragePath(attachment = {}) {
  const documentItem = getOurSpaceAttachmentDocument(attachment);
  return String(
    documentItem?.storage_path ||
    attachment.storagePath ||
    ""
  );
}

function setOurSpaceImagePreview(image, signedUrl) {
  if (!image?.isConnected || !signedUrl) return;
  const shell = image.closest(".our-space-media-canvas");
  image.onload = () => {
    image.hidden = false;
    shell?.classList.add("loaded");
  };
  image.onerror = () => {
    image.hidden = true;
    shell?.classList.add("error");
    const message = shell?.querySelector(".our-space-media-loading");
    if (message) message.textContent = "Preview unavailable";
  };
  image.src = signedUrl;
}

async function hydrateOurSpaceAttachmentPreviews() {
  const list = $("ourSpaceAttachmentList");
  if (!list) return;

  const images = Array.from(
    list.querySelectorAll("img[data-our-space-image-document-id]")
  );
  if (!images.length) return;

  if (!window.BoxCloud?.isReady()) {
    images.forEach((image) => {
      const shell = image.closest(".our-space-media-canvas");
      const message = shell?.querySelector(".our-space-media-loading");
      if (message) message.textContent = "Sign in to show photo";
    });
    return;
  }

  await Promise.all(images.map(async (image) => {
    const documentId = image.dataset.ourSpaceImageDocumentId;
    const attachment = ourSpaceDraftAttachments.find(
      (item) => item.documentId === documentId
    );
    if (!attachment || !image.isConnected) return;

    const cached = ourSpaceAttachmentPreviewCache.get(documentId);
    if (cached?.url && cached.expiresAt > Date.now() + 60_000) {
      setOurSpaceImagePreview(image, cached.url);
      return;
    }

    const storagePath = getOurSpaceAttachmentStoragePath(attachment);
    if (!storagePath) {
      const shell = image.closest(".our-space-media-canvas");
      const message = shell?.querySelector(".our-space-media-loading");
      if (message) message.textContent = "Photo is loading from Vault…";
      return;
    }

    const result = await window.BoxCloud.createDocumentUrl(storagePath, 1800);
    const signedUrl = result.data?.signedUrl || result.data?.signedURL || "";
    if (result.error || !signedUrl || !image.isConnected) {
      const shell = image.closest(".our-space-media-canvas");
      const message = shell?.querySelector(".our-space-media-loading");
      if (message) message.textContent = "Preview unavailable";
      return;
    }

    ourSpaceAttachmentPreviewCache.set(documentId, {
      url: signedUrl,
      expiresAt: Date.now() + 28 * 60 * 1000
    });
    setOurSpaceImagePreview(image, signedUrl);
  }));
}

function renderOurSpaceAttachments() {
  const list = $("ourSpaceAttachmentList");
  if (!list) return;

  $("ourSpaceAttachmentEmpty").hidden = ourSpaceDraftAttachments.length > 0;
  list.classList.toggle(
    "has-images",
    ourSpaceDraftAttachments.some(isOurSpaceImageAttachment)
  );

  list.innerHTML = ourSpaceDraftAttachments.map((attachment) => {
    const documentId = escapeHtml(attachment.documentId);
    const name = escapeHtml(attachment.name);
    const folder = escapeHtml(attachment.folder || "Documents");
    const size = attachment.sizeBytes ? escapeHtml(formatBytes(attachment.sizeBytes)) : "";

    if (isOurSpaceImageAttachment(attachment)) {
      return `
        <article class="our-space-media-card our-space-media-card-image" data-attachment-id="${documentId}">
          <button class="our-space-media-open" type="button" data-attachment-open="${documentId}" aria-label="Open ${name}">
            <span class="our-space-media-canvas">
              <span class="our-space-media-loading">Loading private photo…</span>
              <img
                data-our-space-image-document-id="${documentId}"
                alt="${name}"
                loading="lazy"
                hidden
              >
            </span>
          </button>
          <div class="our-space-media-caption">
            <div>
              <strong title="${name}">${name}</strong>
              <small>${folder}${size ? ` · ${size}` : ""}</small>
            </div>
            <button class="our-space-media-remove" type="button" data-attachment-remove="${documentId}" aria-label="Remove ${name}">✕</button>
          </div>
        </article>
      `;
    }

    return `
      <article class="our-space-media-card our-space-media-card-file" data-attachment-id="${documentId}">
        <button class="our-space-file-open" type="button" data-attachment-open="${documentId}">
          <span class="our-space-file-icon">▣</span>
          <span class="our-space-file-copy">
            <strong>${name}</strong>
            <small>${folder}${size ? ` · ${size}` : ""}</small>
          </span>
          <span class="our-space-file-action">Open</span>
        </button>
        <button class="our-space-media-remove our-space-file-remove" type="button" data-attachment-remove="${documentId}">Remove</button>
      </article>
    `;
  }).join("");

  list.querySelectorAll("[data-attachment-open]").forEach((button) => {
    button.addEventListener("click", () => {
      openOurSpaceAttachment(button.dataset.attachmentOpen);
    });
  });

  list.querySelectorAll("[data-attachment-remove]").forEach((button) => {
    button.addEventListener("click", () => {
      const documentId = button.dataset.attachmentRemove;
      ourSpaceDraftAttachments = ourSpaceDraftAttachments.filter(
        (item) => item.documentId !== documentId
      );
      ourSpaceAttachmentPreviewCache.delete(documentId);
      renderOurSpaceAttachments();
    });
  });

  hydrateOurSpaceAttachmentPreviews();
}

function setOurSpaceDirectUploadStatus(message = "", type = "") {
  const element = $("ourSpaceDirectUploadStatus");
  if (!element) return;
  element.textContent = message;
  element.className = `our-space-direct-upload-status ${type}`.trim();
}

async function uploadOurSpaceFilesFromDevice() {
  if (!window.BoxCloud?.isReady()) {
    setOurSpaceDirectUploadStatus("Sign in before attaching private files.", "error");
    openAuthOverlay();
    return;
  }

  const input = $("ourSpaceDeviceFileInput");
  const files = Array.from(input?.files || []);
  if (!files.length) {
    input?.click();
    return;
  }

  const oversized = files.find((file) => file.size > 25 * 1024 * 1024);
  if (oversized) {
    setOurSpaceDirectUploadStatus(
      `${oversized.name} is larger than the 25 MB limit.`,
      "error"
    );
    input.value = "";
    return;
  }

  const button = $("ourSpaceChooseDeviceFilesButton");
  button.disabled = true;

  let uploaded = 0;
  const planTitle = $("ourSpaceTitle")?.value.trim() || "Our Space";
  const attachmentDetails = `Our Space attachment: ${planTitle}`;

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    button.textContent = `Uploading ${index + 1}/${files.length}…`;
    setOurSpaceDirectUploadStatus(`Uploading ${file.name}…`);

    const result = await window.BoxCloud.uploadDocument(
      file,
      "Personal",
      attachmentDetails,
      { tags: ["our-space"] }
    );

    if (result.error) {
      setOurSpaceDirectUploadStatus(
        `Upload stopped at ${file.name}: ${result.error.message}`,
        "error"
      );
      break;
    }

    documents = [
      result.data,
      ...documents.filter((item) => String(item.id) !== String(result.data.id))
    ];

    const attachment = {
      documentId: String(result.data.id),
      name: result.data.name || file.name || "Attached file",
      folder: result.data.folder || "Personal",
      mimeType: result.data.mime_type || file.type || "",
      sizeBytes: Number(result.data.size_bytes) || file.size || 0,
      storagePath: result.data.storage_path || ""
    };

    if (!ourSpaceDraftAttachments.some(
      (item) => item.documentId === attachment.documentId
    )) {
      ourSpaceDraftAttachments.push(attachment);
    }

    uploaded += 1;
  }

  input.value = "";
  button.disabled = false;
  button.textContent = "＋ Add photos / files from device";

  renderOurSpaceAttachments();
  renderOurSpaceDocumentPicker();
  renderDocuments();

  if (uploaded) {
    setOurSpaceDirectUploadStatus(
      `${uploaded} file${uploaded === 1 ? "" : "s"} uploaded privately and attached.`,
      "success"
    );
    showToast(`${uploaded} file${uploaded === 1 ? "" : "s"} attached to Our Space`);
  }
}

function attachSelectedOurSpaceDocument() {
  const documentId = $("ourSpaceDocumentPicker").value;
  if (!documentId) {
    showToast("Choose a Document Vault file first");
    return;
  }
  const documentItem = documents.find((item) => String(item.id) === String(documentId));
  if (!documentItem) {
    showToast("That Vault file is not currently available");
    return;
  }
  if (ourSpaceDraftAttachments.some((item) => item.documentId === String(documentId))) {
    showToast("That file is already attached");
    return;
  }

  ourSpaceDraftAttachments.push({
    documentId: String(documentItem.id),
    name: documentItem.name || "Attached file",
    folder: documentItem.folder || "Documents",
    mimeType: documentItem.mime_type || "",
    sizeBytes: Number(documentItem.size_bytes) || 0,
    storagePath: documentItem.storage_path || ""
  });
  renderOurSpaceAttachments();
  $("ourSpaceDocumentPicker").value = "";
  showToast("Vault file attached");
}

async function openOurSpaceAttachment(documentId) {
  const documentItem = documents.find((item) => String(item.id) === String(documentId));
  if (!documentItem) {
    showToast("Open Documents to find this file");
    openApp("documents");
    return;
  }
  if (typeof openDocumentPreview === "function") {
    openDocumentPreview(documentItem);
    return;
  }
  openApp("documents");
}


function updateOurSpaceArchiveButton() {
  const button = $("ourSpaceArchiveButton");
  if (!button) return;

  const savedPlan = ourSpacePlans.find((item) => item.id === selectedOurSpacePlanId);
  if (!savedPlan) {
    button.disabled = true;
    button.textContent = "✓ Mark done & archive";
    button.classList.remove("restore");
    return;
  }

  button.disabled = false;
  const archived = savedPlan.status === "done";
  button.textContent = archived ? "↩ Restore plan" : "✓ Mark done & archive";
  button.classList.toggle("restore", archived);
}

async function markSelectedOurSpacePlanDone() {
  const plan = ourSpacePlans.find((item) => item.id === selectedOurSpacePlanId);
  if (!plan) {
    showToast("Save the plan first");
    return;
  }

  if (plan.status === "done") {
    const confirmed = window.confirm(
      `Restore “${plan.title || "this plan"}” from the archive and move it back to Planning?`
    );
    if (!confirmed) return;

    $("ourSpaceStatus").value = "planning";
    updateOurSpaceMemoryVisibility();
    await saveOurSpacePlanFromEditor();
    showToast("Plan restored from archive");
    return;
  }

  const confirmed = window.confirm(
    `Mark “${plan.title || "this plan"}” as done and move it to the Our Space archive?`
  );
  if (!confirmed) return;

  $("ourSpaceStatus").value = "done";
  if (!$("ourSpaceActualDate").value) {
    $("ourSpaceActualDate").value = $("ourSpaceTargetDate").value || getOurSpaceToday();
  }
  updateOurSpaceMemoryVisibility();
  await saveOurSpacePlanFromEditor();

  // Keep active plans clean after archiving.
  ourSpaceStatusFilter = "all";
  renderOurSpaceCenter();
  showToast("Plan marked done and moved to Archive ♥");
}

function updateOurSpaceSidebarHeading() {
  const eyebrow = $("ourSpaceSidebarEyebrow");
  const title = $("ourSpaceSidebarTitle");
  if (!eyebrow || !title) return;

  if (ourSpaceStatusFilter === "done") {
    eyebrow.textContent = "ARCHIVE";
    title.textContent = "Completed plans";
  } else {
    eyebrow.textContent = "OUR PLANS";
    title.textContent = ourSpaceStatusFilter === "all"
      ? "Active plans"
      : `${getOurSpaceStatusLabel(ourSpaceStatusFilter)} plans`;
  }
}

function updateOurSpaceMemoryVisibility() {
  const isDone = $("ourSpaceStatus")?.value === "done";
  $("ourSpaceMemorySection")?.classList.toggle("hidden", !isDone);
  if (isDone && !$("ourSpaceActualDate").value) {
    $("ourSpaceActualDate").value = $("ourSpaceTargetDate").value || getOurSpaceToday();
  }
}

function resetOurSpaceEditor() {
  selectedOurSpacePlanId = null;
  ourSpaceDraftChecklist = [];
  ourSpaceDraftLinks = [];
  ourSpaceDraftAttachments = [];

  $("ourSpaceTitle").value = "";
  $("ourSpaceCategory").value = "Date";
  $("ourSpaceStatus").value = "idea";
  $("ourSpacePriority").value = "medium";
  $("ourSpaceTargetDate").value = "";
  $("ourSpacePlace").value = "";
  $("ourSpaceEstimatedBudget").value = "";
  $("ourSpaceNotes").value = "";
  $("ourSpaceFavorite").checked = false;
  $("ourSpaceActualDate").value = "";
  $("ourSpaceActualBudget").value = "";
  $("ourSpaceRating").value = "";
  $("ourSpaceFavoriteMemory").value = "";
  $("ourSpaceDeviceFileInput").value = "";
  setOurSpaceDirectUploadStatus(
    "Photos appear here as a private visual gallery. Other files remain available as file cards."
  );

  $("ourSpaceEditorModeLabel").textContent = "NEW PLAN";
  $("ourSpaceEditorHeading").textContent = "Plan something together";
  $("deleteOurSpacePlanButton").disabled = true;
  $("ourSpaceCreateTaskButton").disabled = true;
  $("ourSpaceAddCalendarButton").disabled = true;
  $("ourSpaceArchiveButton").disabled = true;
  $("ourSpaceArchiveButton").textContent = "✓ Mark done & archive";
  $("ourSpaceArchiveButton").classList.remove("restore");

  renderOurSpaceChecklist();
  renderOurSpaceLinks();
  renderOurSpaceAttachments();
  renderOurSpaceDocumentPicker();
  updateOurSpaceMemoryVisibility();
}

function populateOurSpaceEditor(plan) {
  if (!plan) return resetOurSpaceEditor();

  selectedOurSpacePlanId = plan.id;
  ourSpaceDraftChecklist = normalizeOurSpaceChecklist(plan.checklist);
  ourSpaceDraftLinks = normalizeOurSpaceLinks(plan.links);
  ourSpaceDraftAttachments = normalizeOurSpaceAttachments(plan.attachments);

  $("ourSpaceTitle").value = plan.title;
  $("ourSpaceCategory").value = plan.category;
  $("ourSpaceStatus").value = plan.status;
  $("ourSpacePriority").value = plan.priority;
  $("ourSpaceTargetDate").value = plan.target_date;
  $("ourSpacePlace").value = plan.place;
  $("ourSpaceEstimatedBudget").value = plan.estimated_budget ?? "";
  $("ourSpaceNotes").value = plan.notes;
  $("ourSpaceFavorite").checked = plan.favorite;
  $("ourSpaceActualDate").value = plan.actual_date;
  $("ourSpaceActualBudget").value = plan.actual_budget ?? "";
  $("ourSpaceRating").value = plan.rating ?? "";
  $("ourSpaceFavoriteMemory").value = plan.favorite_memory;

  $("ourSpaceEditorModeLabel").textContent = plan.status === "done" ? "ARCHIVED MEMORY" : "EDIT PLAN";
  $("ourSpaceEditorHeading").textContent = plan.title || "Edit plan";
  $("deleteOurSpacePlanButton").disabled = false;
  $("ourSpaceCreateTaskButton").disabled = false;
  $("ourSpaceAddCalendarButton").disabled = !plan.target_date;
  updateOurSpaceArchiveButton();

  renderOurSpaceChecklist();
  renderOurSpaceLinks();
  renderOurSpaceAttachments();
  renderOurSpaceDocumentPicker();
  updateOurSpaceMemoryVisibility();
}

function selectOurSpacePlan(planId) {
  const plan = ourSpacePlans.find((item) => item.id === planId);
  if (!plan) return;
  populateOurSpaceEditor(plan);
  renderOurSpacePlanList();
}

function renderOurSpaceHeroHighlight() {
  if (!$("ourSpaceHeroNextTitle")) return;

  const today = getOurSpaceToday();
  const nextPlan = [...ourSpacePlans]
    .filter((plan) =>
      plan.status !== "done" &&
      plan.target_date &&
      plan.target_date >= today
    )
    .sort((a, b) => {
      if (a.target_date !== b.target_date) {
        return a.target_date.localeCompare(b.target_date);
      }
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
      return String(b.updated_at || "").localeCompare(String(a.updated_at || ""));
    })[0];

  if (!nextPlan) {
    $("ourSpaceHeroNextTitle").textContent = "Nothing scheduled yet";
    $("ourSpaceHeroNextMeta").textContent =
      "Add a date to a plan and it will appear here.";
    $("ourSpaceHeroNext").classList.remove("has-plan");
    $("ourSpaceHeroNext").dataset.planId = "";
    return;
  }

  const meta = [
    formatOurSpaceDate(nextPlan.target_date),
    nextPlan.place || "",
    getOurSpaceStatusLabel(nextPlan.status)
  ].filter(Boolean);

  $("ourSpaceHeroNextTitle").textContent =
    nextPlan.title || "Untitled plan";
  $("ourSpaceHeroNextMeta").textContent = meta.join(" · ");
  $("ourSpaceHeroNext").classList.add("has-plan");
  $("ourSpaceHeroNext").dataset.planId = nextPlan.id;
}

function renderOurSpaceCenter() {
  if (!$("ourSpacePlanList")) return;
  $("ourSpaceSearchInput").value = ourSpaceSearchTerm;
  $("ourSpaceCategoryFilter").value = ourSpaceCategoryFilter;
  $("ourSpaceStatusFilter").value = ourSpaceStatusFilter;
  $("ourSpaceFavoritesOnly").checked = ourSpaceFavoritesOnly;

  renderOurSpaceHeroHighlight();
  renderOurSpaceSummary();
  updateOurSpaceSidebarHeading();
  renderOurSpacePlanList();
  renderOurSpaceDocumentPicker();
  updateOurSpaceArchiveButton();

  if (!selectedOurSpacePlanId && !$("ourSpaceTitle").value && !$("ourSpaceEditorModeLabel").textContent.includes("NEW")) {
    resetOurSpaceEditor();
  }
  renderDashboard();
  renderFavoritesHub();
  renderActivityTimeline();
}

function collectOurSpaceEditorPlan() {
  const estimated = $("ourSpaceEstimatedBudget").value;
  const actual = $("ourSpaceActualBudget").value;
  return normalizeOurSpacePlan({
    id: selectedOurSpacePlanId || createOurSpaceId(),
    title: $("ourSpaceTitle").value,
    category: $("ourSpaceCategory").value,
    status: $("ourSpaceStatus").value,
    priority: $("ourSpacePriority").value,
    target_date: $("ourSpaceTargetDate").value,
    place: $("ourSpacePlace").value,
    estimated_budget: estimated === "" ? null : Number(estimated),
    notes: $("ourSpaceNotes").value,
    checklist: ourSpaceDraftChecklist.filter((item) => item.text.trim()),
    links: ourSpaceDraftLinks.filter((item) => item.url.trim()),
    attachments: ourSpaceDraftAttachments,
    favorite: $("ourSpaceFavorite").checked,
    actual_date: $("ourSpaceActualDate").value,
    actual_budget: actual === "" ? null : Number(actual),
    rating: $("ourSpaceRating").value ? Number($("ourSpaceRating").value) : null,
    favorite_memory: $("ourSpaceFavoriteMemory").value,
    created_at: ourSpacePlans.find((item) => item.id === selectedOurSpacePlanId)?.created_at,
    updated_at: new Date().toISOString()
  });
}

async function saveOurSpacePlanFromEditor() {
  const plan = collectOurSpaceEditorPlan();
  if (!plan.title.trim()) {
    showToast("Give this plan a title first");
    $("ourSpaceTitle").focus();
    return;
  }

  const existingIndex = ourSpacePlans.findIndex((item) => item.id === plan.id);
  if (existingIndex >= 0) ourSpacePlans[existingIndex] = plan;
  else ourSpacePlans.unshift(plan);

  persistOurSpacePlans({ pendingCloudSync: !window.BoxCloud?.isReady() });
  selectedOurSpacePlanId = plan.id;
  populateOurSpaceEditor(plan);
  renderOurSpaceCenter();

  if (window.BoxCloud?.isReady() && window.BoxCloud.saveOurSpacePlan) {
    const result = await window.BoxCloud.saveOurSpacePlan(plan);
    if (result.error) {
      localStorage.setItem(STORAGE.ourSpacePendingSync, "1");
      showToast("Plan saved locally; cloud sync pending");
      return;
    }
    localStorage.removeItem(STORAGE.ourSpacePendingSync);
  }

  showToast(plan.status === "done" ? "Archived memory saved ♥" : "Plan saved");
}

async function deleteSelectedOurSpacePlan() {
  if (!selectedOurSpacePlanId) return;
  const plan = ourSpacePlans.find((item) => item.id === selectedOurSpacePlanId);
  if (!plan) return;
  if (!window.confirm(`Delete “${plan.title || "this plan"}”?`)) return;

  const planId = plan.id;
  ourSpacePlans = ourSpacePlans.filter((item) => item.id !== planId);
  persistOurSpacePlans({ pendingCloudSync: !window.BoxCloud?.isReady() });

  if (window.BoxCloud?.isReady() && window.BoxCloud.deleteOurSpacePlan) {
    const result = await window.BoxCloud.deleteOurSpacePlan(planId);
    if (result.error) {
      localStorage.setItem(STORAGE.ourSpacePendingSync, "1");
      showToast("Deleted locally; cloud delete pending");
    }
  }

  resetOurSpaceEditor();
  renderOurSpaceCenter();
  showToast("Plan deleted");
}

function clearOurSpaceFilters() {
  ourSpaceSearchTerm = "";
  ourSpaceCategoryFilter = "all";
  ourSpaceStatusFilter = "all";
  ourSpaceFavoritesOnly = false;
  renderOurSpaceCenter();
}

function applyOurSpaceQuickFilter(mode) {
  ourSpaceSearchTerm = "";
  ourSpaceCategoryFilter = "all";
  ourSpaceFavoritesOnly = false;

  if (mode === "archive") {
    ourSpaceStatusFilter = "done";
  } else if (mode === "bucket") {
    ourSpaceStatusFilter = "someday";
  } else if (mode === "active") {
    ourSpaceStatusFilter = "planning";
  } else {
    ourSpaceStatusFilter = "all";
  }

  renderOurSpaceCenter();

  if (mode === "upcoming") {
    const today = getOurSpaceToday();
    const upcoming = sortOurSpacePlans(
      ourSpacePlans.filter((plan) => plan.status !== "done" && plan.target_date && plan.target_date >= today)
    );
    $("ourSpacePlanList").innerHTML = upcoming.map((plan) => `
      <button class="our-space-plan-card ${plan.id === selectedOurSpacePlanId ? "active" : ""}"
        type="button" data-our-space-plan-id="${escapeHtml(plan.id)}">
        <span class="our-space-plan-icon">${escapeHtml(getOurSpaceCategoryIcon(plan.category))}</span>
        <span class="our-space-plan-card-body">
          <span class="our-space-plan-card-top"><strong>${escapeHtml(plan.title)}</strong><span>${plan.favorite ? "♥" : ""}</span></span>
          <small>${escapeHtml(plan.category)} · ${escapeHtml(formatOurSpaceDate(plan.target_date))}</small>
        </span>
      </button>
    `).join("");
    $("ourSpacePlanCount").textContent = String(upcoming.length);
    $("ourSpaceEmptyState").hidden = upcoming.length > 0;
    $("ourSpacePlanList").querySelectorAll("[data-our-space-plan-id]").forEach((button) => {
      button.addEventListener("click", () => selectOurSpacePlan(button.dataset.ourSpacePlanId));
    });
  }
}

function createTaskFromOurSpacePlan() {
  const plan = ourSpacePlans.find((item) => item.id === selectedOurSpacePlanId);
  if (!plan) return;
  const now = new Date().toISOString();
  const task = normalizeTask({
    id: Date.now() + Math.random(),
    text: plan.title,
    details: [
      "Our Space plan",
      plan.place ? `Place: ${plan.place}` : "",
      plan.notes || ""
    ].filter(Boolean).join("\n"),
    dueDate: plan.target_date || "",
    workspace: "personal",
    priority: plan.priority === "high" ? "high" : "normal",
    status: "todo",
    tags: ["our-space", plan.category],
    subtasks: plan.checklist.map((item) => ({
      id: `our-space-${item.id}`,
      text: item.text,
      details: "",
      completed: item.completed,
      attachments: []
    })),
    recurrence: { type: "none", days: [] },
    createdAt: now,
    updatedAt: now
  });
  tasks.unshift(task);
  saveJSON(STORAGE.tasks, tasks);
  renderAll();
  showToast("Task created from Our Space");
}

function addOurSpacePlanToCalendar() {
  const plan = ourSpacePlans.find((item) => item.id === selectedOurSpacePlanId);
  if (!plan) return;
  if (!plan.target_date) {
    showToast("Add a target date first");
    return;
  }

  const event = {
    id: Date.now() + Math.random(),
    title: `♥ ${plan.title}`,
    date: plan.target_date,
    workspace: "personal"
  };
  events.unshift(event);
  saveJSON(STORAGE.events, events);
  renderAll();
  showToast("Added to Calendar");
}

async function syncPendingOurSpaceIfNeeded() {
  if (!window.BoxCloud?.isReady() || !window.BoxCloud.replaceOurSpacePlans) return;
  if (localStorage.getItem(STORAGE.ourSpacePendingSync) !== "1") return;
  const result = await window.BoxCloud.replaceOurSpacePlans(ourSpacePlans);
  if (!result.error) localStorage.removeItem(STORAGE.ourSpacePendingSync);
}

function getAllTemplates() {
  return [
    ...BUILT_IN_TEMPLATES.map((template) => ({ ...template, builtIn: true })),
    ...customTemplates.map((template) => ({ ...template, builtIn: false }))
  ];
}

function getSelectedTemplate() {
  return getAllTemplates().find((template) => template.id === selectedTemplateId)
    || getAllTemplates()[0]
    || null;
}

function persistCustomTemplates() {
  customTemplates = normalizeCustomTemplates(customTemplates);
  localStorage.setItem(STORAGE.customTemplates, JSON.stringify(customTemplates));
}

async function loadCustomTemplatesFromCloud({ mergeLocal = false } = {}) {
  if (!window.BoxCloud?.isReady() || templatesCloudLoading) return;
  templatesCloudLoading = true;

  try {
    const result = await window.BoxCloud.listCustomTemplates();
    if (result.error) throw result.error;

    const cloudTemplates = normalizeCustomTemplates(result.data || []);
    if (mergeLocal && customTemplates.length) {
      const merged = new Map();
      [...cloudTemplates, ...customTemplates].forEach((template) => {
        const current = merged.get(template.id);
        if (!current || new Date(template.updatedAt) >= new Date(current.updatedAt)) {
          merged.set(template.id, template);
        }
      });
      customTemplates = Array.from(merged.values());
      persistCustomTemplates();
      await window.BoxCloud.replaceCustomTemplates(customTemplates);
    } else {
      customTemplates = cloudTemplates;
      persistCustomTemplates();
    }

    if (!getSelectedTemplate()) {
      selectedTemplateId = BUILT_IN_TEMPLATES[0]?.id || customTemplates[0]?.id || "";
    }
    renderTemplateCenter();
  } catch (error) {
    console.error("Could not load custom templates:", error);
    showToast("Templates are available locally");
  } finally {
    templatesCloudLoading = false;
  }
}

function resolveTemplateDynamicFields(content) {
  const now = new Date();
  const today = now.toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric"
  });

  return String(content || "")
    .replaceAll("{{today}}", today)
    .replaceAll("{{current_date}}", today)
    .replaceAll("{{year}}", String(now.getFullYear()));
}

function getTemplateCategories() {
  return Array.from(new Set(
    getAllTemplates()
      .map((template) => template.category)
      .filter(Boolean)
  )).sort((a, b) => a.localeCompare(b));
}

function renderTemplateCategoryFilter() {
  const select = $("templateCategoryFilter");
  if (!select) return;

  const current = templateCategoryFilter;
  select.innerHTML = `<option value="all">All categories</option>` +
    getTemplateCategories()
      .map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)
      .join("");

  select.value = getTemplateCategories().includes(current) ? current : "all";
  templateCategoryFilter = select.value;
}

function renderTemplateLibrary() {
  const list = $("templateList");
  if (!list) return;

  const query = templateSearchTerm.toLocaleLowerCase();
  const filtered = getAllTemplates().filter((template) => {
    const categoryMatch = templateCategoryFilter === "all"
      || template.category === templateCategoryFilter;
    const searchMatch = !query
      || template.title.toLocaleLowerCase().includes(query)
      || template.category.toLocaleLowerCase().includes(query)
      || template.content.toLocaleLowerCase().includes(query);
    return categoryMatch && searchMatch;
  });

  $("templateLibraryCount").textContent = String(getAllTemplates().length);
  $("templateEmptyState").hidden = filtered.length > 0;

  list.innerHTML = filtered.map((template) => `
    <button class="template-list-item ${template.id === selectedTemplateId ? "active" : ""}"
      type="button" data-template-id="${escapeHtml(template.id)}">
      <span class="template-list-icon">${template.builtIn ? "▤" : "✎"}</span>
      <span>
        <strong>${escapeHtml(template.title)}</strong>
        <small>${escapeHtml(template.category)} · ${template.builtIn ? "Built-in" : "Custom"}</small>
      </span>
    </button>
  `).join("");

  list.querySelectorAll("[data-template-id]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedTemplateId = button.dataset.templateId;
      renderTemplateCenter();
    });
  });
}

function populateTemplateEditor() {
  const template = getSelectedTemplate();
  if (!template || !$("templateEditorTitle")) return;

  $("templateEditorTitle").value = template.title;
  $("templateEditorCategory").value = template.category;
  $("templateEditorContent").value = template.content;

  $("templateEditorBadge").textContent = template.builtIn ? "Built-in" : "Custom";
  $("templateEditorBadge").className = `template-editor-badge ${template.builtIn ? "built-in" : "custom"}`;
  $("saveTemplateButton").textContent = template.builtIn ? "Save as custom copy" : "Save changes";
  $("deleteTemplateButton").disabled = template.builtIn;
  $("resetTemplateButton").disabled = !template.builtIn;
}

function renderComplianceReportFolderOptions() {
  const select = $("complianceReportFolder");
  if (!select) return;

  const current = select.value || "all";
  const folders = Array.from(new Set([
    ...DEFAULT_DOCUMENT_FOLDERS,
    ...documentFolders.map((folder) => folder.name),
    ...documents.map((documentItem) => documentItem.folder)
  ].filter(Boolean))).sort((a, b) => a.localeCompare(b));

  select.innerHTML = `<option value="all">All folders</option>` +
    folders.map((folder) => `<option value="${escapeHtml(folder)}">${escapeHtml(folder)}</option>`).join("");
  select.value = folders.includes(current) ? current : "all";
}

function renderTemplateCenter() {
  if (!$("templateList")) return;
  renderTemplateCategoryFilter();
  renderTemplateLibrary();
  populateTemplateEditor();
  renderComplianceReportFolderOptions();
  if (generatedComplianceReport) renderComplianceReport(generatedComplianceReport);
}

function createNewCustomTemplate() {
  const now = new Date().toISOString();
  const template = normalizeCustomTemplate({
    id: createLocalTemplateId(),
    title: "Untitled template",
    category: "General",
    content: "TITLE\n\nWrite your reusable content here.",
    createdAt: now,
    updatedAt: now
  });

  customTemplates.unshift(template);
  persistCustomTemplates();
  selectedTemplateId = template.id;
  renderTemplateCenter();
  $("templateEditorTitle").focus();

  if (window.BoxCloud?.isReady()) {
    window.BoxCloud.saveCustomTemplate(template).catch(console.error);
  }
}

async function saveTemplateEditor() {
  const source = getSelectedTemplate();
  if (!source) return;

  const title = $("templateEditorTitle").value.trim();
  const category = $("templateEditorCategory").value.trim() || "General";
  const content = $("templateEditorContent").value;

  if (!title) {
    showToast("Enter a template title");
    $("templateEditorTitle").focus();
    return;
  }
  if (!content.trim()) {
    showToast("Template content cannot be empty");
    $("templateEditorContent").focus();
    return;
  }

  const now = new Date().toISOString();
  let savedTemplate;

  if (source.builtIn) {
    savedTemplate = normalizeCustomTemplate({
      id: createLocalTemplateId(),
      title,
      category,
      content,
      createdAt: now,
      updatedAt: now
    });
    customTemplates.unshift(savedTemplate);
  } else {
    const index = customTemplates.findIndex((template) => template.id === source.id);
    if (index < 0) return;
    savedTemplate = normalizeCustomTemplate({
      ...customTemplates[index],
      title,
      category,
      content,
      updatedAt: now
    });
    customTemplates[index] = savedTemplate;
  }

  persistCustomTemplates();
  selectedTemplateId = savedTemplate.id;
  renderTemplateCenter();

  if (window.BoxCloud?.isReady()) {
    const result = await window.BoxCloud.saveCustomTemplate(savedTemplate);
    if (result.error) {
      showToast("Saved locally; cloud sync failed");
      return;
    }
  }
  showToast(source.builtIn ? "Custom template created" : "Template saved");
}

async function duplicateSelectedTemplate() {
  const source = getSelectedTemplate();
  if (!source) return;
  const now = new Date().toISOString();
  const copy = normalizeCustomTemplate({
    id: createLocalTemplateId(),
    title: `${source.title} — Copy`,
    category: source.category,
    content: $("templateEditorContent").value || source.content,
    createdAt: now,
    updatedAt: now
  });

  customTemplates.unshift(copy);
  persistCustomTemplates();
  selectedTemplateId = copy.id;
  renderTemplateCenter();

  if (window.BoxCloud?.isReady()) {
    await window.BoxCloud.saveCustomTemplate(copy);
  }
  showToast("Template duplicated");
}

async function deleteSelectedTemplate() {
  const source = getSelectedTemplate();
  if (!source || source.builtIn) return;
  if (!window.confirm(`Delete “${source.title}”?`)) return;

  customTemplates = customTemplates.filter((template) => template.id !== source.id);
  persistCustomTemplates();
  selectedTemplateId = BUILT_IN_TEMPLATES[0]?.id || customTemplates[0]?.id || "";
  renderTemplateCenter();

  if (window.BoxCloud?.isReady()) {
    const result = await window.BoxCloud.deleteCustomTemplate(source.id);
    if (result.error) showToast("Deleted locally; cloud delete failed");
  }
  showToast("Template deleted");
}

function resetBuiltInTemplateEditor() {
  const source = getSelectedTemplate();
  if (!source?.builtIn) return;
  populateTemplateEditor();
  showToast("Built-in template restored");
}

function getEditorTemplateOutput() {
  return resolveTemplateDynamicFields($("templateEditorContent")?.value || "");
}

async function copySelectedTemplate() {
  const output = getEditorTemplateOutput();
  if (!output.trim()) return;
  await copyTextToClipboard(output);
  showToast("Template copied");
}

function downloadSelectedTemplate() {
  const title = $("templateEditorTitle").value.trim() || "template";
  downloadTextFile(
    `${cleanFileNameSegment(title)}.txt`,
    getEditorTemplateOutput(),
    "text/plain"
  );
  showToast("Template downloaded");
}

function insertTemplatePlaceholder(value) {
  const textarea = $("templateEditorContent");
  if (!textarea) return;

  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? start;
  textarea.setRangeText(value, start, end, "end");
  textarea.focus();
}

function escapeCsvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function getComplianceReportRows() {
  const reportType = $("complianceReportType").value;
  const folder = $("complianceReportFolder").value;
  const status = $("complianceReportStatus").value;
  const month = $("complianceReportMonth").value;

  return documents
    .filter((documentItem) => !documentItem.deleted_at)
    .map((documentItem) => {
      const compliance = getDocumentCompliance(documentItem);
      return {
        documentItem,
        compliance,
        name: documentItem.name || "Untitled document",
        folder: documentItem.folder || "Unfiled",
        status: compliance.key,
        statusLabel: compliance.label,
        expiryDate: documentItem.expiry_date || "",
        reminderDays: compliance.reminderDays,
        tags: getDocumentTags(documentItem),
        details: documentItem.details || "",
        version: Number(documentItem.current_version || 1),
        uploadedAt: documentItem.created_at || ""
      };
    })
    .filter((row) => {
      if (folder !== "all" && row.folder !== folder) return false;
      if (status !== "all" && row.status !== status) return false;
      if (month && !row.expiryDate.startsWith(month)) return false;
      if (reportType === "expiry" && !row.expiryDate) return false;
      if (reportType === "attention" && !["expiring", "expired"].includes(row.status)) return false;
      return true;
    })
    .sort((a, b) => {
      const aDate = a.expiryDate || "9999-12-31";
      const bDate = b.expiryDate || "9999-12-31";
      return aDate.localeCompare(bDate) || a.name.localeCompare(b.name);
    });
}

function buildComplianceReport() {
  const rows = getComplianceReportRows();
  const reportType = $("complianceReportType").value;
  const now = new Date();
  const summary = {
    total: rows.length,
    active: rows.filter((row) => row.status === "active").length,
    expiring: rows.filter((row) => row.status === "expiring").length,
    expired: rows.filter((row) => row.status === "expired").length,
    noExpiry: rows.filter((row) => row.status === "no-expiry").length
  };

  const titleMap = {
    inventory: "Document Inventory",
    expiry: "Document Expiry Report",
    attention: "Documents Requiring Attention",
    "folder-summary": "Document Folder Summary"
  };

  const folderGroups = rows.reduce((groups, row) => {
    groups[row.folder] = groups[row.folder] || [];
    groups[row.folder].push(row);
    return groups;
  }, {});

  let text = `${titleMap[reportType] || "Compliance Report"}\n`;
  text += `Generated: ${now.toLocaleString("en-PH")}\n`;
  text += `Included: ${summary.total} | Active: ${summary.active} | Expiring: ${summary.expiring} | Expired: ${summary.expired} | No expiry: ${summary.noExpiry}\n`;
  text += `${"=".repeat(78)}\n\n`;

  if (!rows.length) {
    text += "No documents matched the selected filters.\n";
  } else if (reportType === "folder-summary") {
    Object.entries(folderGroups)
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([folderName, folderRows]) => {
        const folderExpired = folderRows.filter((row) => row.status === "expired").length;
        const folderExpiring = folderRows.filter((row) => row.status === "expiring").length;
        text += `${folderName}: ${folderRows.length} document(s), ${folderExpiring} expiring, ${folderExpired} expired\n`;
      });
  } else {
    rows.forEach((row, index) => {
      text += `${index + 1}. ${row.name}\n`;
      text += `   Folder: ${row.folder}\n`;
      text += `   Status: ${row.statusLabel}\n`;
      text += `   Expiry: ${row.expiryDate ? formatDocumentExpiryDate(row.expiryDate) : "Not set"}\n`;
      text += `   Tags: ${row.tags.length ? row.tags.join(", ") : "None"}\n`;
      if (row.details) text += `   Details: ${row.details}\n`;
      text += "\n";
    });
  }

  const csvRows = [
    ["Name", "Folder", "Status", "Expiry Date", "Reminder Days", "Tags", "Details", "Version", "Uploaded At"],
    ...rows.map((row) => [
      row.name,
      row.folder,
      row.statusLabel,
      row.expiryDate,
      row.reminderDays,
      row.tags.join(", "),
      row.details,
      row.version,
      row.uploadedAt
    ])
  ];

  return {
    generatedAt: now.toISOString(),
    reportType,
    title: titleMap[reportType] || "Compliance Report",
    rows,
    summary,
    text,
    csv: csvRows.map((row) => row.map(escapeCsvCell).join(",")).join("\n")
  };
}

function renderComplianceReport(report) {
  if (!report || !$("complianceReportPreview")) return;
  $("complianceReportIncludedCount").textContent = String(report.summary.total);
  $("complianceReportActiveCount").textContent = String(report.summary.active);
  $("complianceReportExpiringCount").textContent = String(report.summary.expiring);
  $("complianceReportExpiredCount").textContent = String(report.summary.expired);
  $("complianceReportPreview").textContent = report.text;
  $("downloadComplianceCsvButton").disabled = false;
  $("downloadComplianceTextButton").disabled = false;
  $("printComplianceReportButton").disabled = false;
}

function generateComplianceReport() {
  generatedComplianceReport = buildComplianceReport();
  renderComplianceReport(generatedComplianceReport);
  showToast("Compliance report generated");
}

function downloadComplianceCsv() {
  if (!generatedComplianceReport) return;
  downloadTextFile(
    `the-box-${cleanFileNameSegment(generatedComplianceReport.title)}.csv`,
    generatedComplianceReport.csv,
    "text/csv"
  );
}

function downloadComplianceText() {
  if (!generatedComplianceReport) return;
  downloadTextFile(
    `the-box-${cleanFileNameSegment(generatedComplianceReport.title)}.txt`,
    generatedComplianceReport.text,
    "text/plain"
  );
}

function printComplianceReport() {
  if (!generatedComplianceReport) return;
  const report = generatedComplianceReport;
  const printable = window.open("", "_blank", "noopener,noreferrer");
  if (!printable) {
    showToast("Allow pop-ups to print the report");
    return;
  }

  const rows = report.rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.name)}</td>
      <td>${escapeHtml(row.folder)}</td>
      <td>${escapeHtml(row.statusLabel)}</td>
      <td>${escapeHtml(row.expiryDate ? formatDocumentExpiryDate(row.expiryDate) : "Not set")}</td>
      <td>${escapeHtml(row.tags.join(", ") || "None")}</td>
    </tr>
  `).join("");

  printable.document.write(`<!doctype html>
    <html><head><title>${escapeHtml(report.title)}</title>
    <style>
      body{font-family:Arial,sans-serif;padding:24px;color:#111}
      h1{margin-bottom:6px}
      p{color:#444}
      table{width:100%;border-collapse:collapse;margin-top:20px}
      th,td{border:1px solid #bbb;padding:8px;text-align:left;vertical-align:top}
      th{background:#eee}
      .summary{display:flex;gap:16px;flex-wrap:wrap;margin:18px 0}
      .summary span{border:1px solid #ccc;padding:8px 12px;border-radius:8px}
    </style></head><body>
      <h1>${escapeHtml(report.title)}</h1>
      <p>Generated ${escapeHtml(new Date(report.generatedAt).toLocaleString("en-PH"))}</p>
      <div class="summary">
        <span>Included: ${report.summary.total}</span>
        <span>Active: ${report.summary.active}</span>
        <span>Expiring: ${report.summary.expiring}</span>
        <span>Expired: ${report.summary.expired}</span>
      </div>
      <table>
        <thead><tr><th>Document</th><th>Folder</th><th>Status</th><th>Expiry</th><th>Tags</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5">No matching documents.</td></tr>'}</tbody>
      </table>
      <script>window.addEventListener("load",()=>{window.print();});<\/script>
    </body></html>`);
  printable.document.close();
}



function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function daysFromToday(dateKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ""))) return null;
  const today = new Date(`${getLocalDateKey()}T00:00:00`);
  const target = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  return Math.round((target - today) / 86400000);
}

function formatReminderDate(dateKey) {
  if (!dateKey) return "No date";
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;
  return date.toLocaleDateString("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function loadDismissedReminderMap() {
  const value = loadJSON(STORAGE.dismissedReminders, {});
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function saveReminderSettings() {
  reminderSettings = {
    dailySummary: Boolean(reminderSettings.dailySummary),
    browserNotifications: Boolean(reminderSettings.browserNotifications),
    taskLeadDays: Math.min(30, Math.max(0, Number(reminderSettings.taskLeadDays) || 3)),
    eventLeadDays: Math.min(30, Math.max(0, Number(reminderSettings.eventLeadDays) || 3))
  };
  localStorage.setItem(STORAGE.reminderSettings, JSON.stringify(reminderSettings));
}

function dismissReminderForToday(reminderId) {
  const today = getLocalDateKey();
  const dismissed = loadDismissedReminderMap();
  dismissed[reminderId] = today;

  Object.keys(dismissed).forEach((key) => {
    if (dismissed[key] !== today) delete dismissed[key];
  });

  localStorage.setItem(STORAGE.dismissedReminders, JSON.stringify(dismissed));
  renderReminderCenter();
  renderJournalCenter();
}

function dismissAllRemindersForToday() {
  const today = getLocalDateKey();
  const dismissed = loadDismissedReminderMap();
  getRawReminderItems().forEach((item) => {
    dismissed[item.id] = today;
  });
  localStorage.setItem(STORAGE.dismissedReminders, JSON.stringify(dismissed));
  renderReminderCenter();
  showToast("Reminders dismissed for today");
}

function getTaskReminderItems() {
  const leadDays = Number(reminderSettings.taskLeadDays) || 3;

  return tasks
    .filter((task) => !task.completed && task.dueDate)
    .map((task) => {
      const days = daysFromToday(task.dueDate);
      if (days === null || days > leadDays) return null;

      let severity = "upcoming";
      let label = `${days} days remaining`;

      if (days < 0) {
        severity = "critical";
        label = `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`;
      } else if (days === 0) {
        severity = "today";
        label = "Due today";
      } else if (days === 1) {
        severity = "upcoming";
        label = "Due tomorrow";
      }

      return {
        id: `task-${task.id}-${task.dueDate}`,
        type: "task",
        severity,
        title: task.text || "Untitled task",
        meta: `${label} · ${formatReminderDate(task.dueDate)}`,
        dateKey: task.dueDate,
        workspace: task.workspace || "personal",
        entityId: task.id
      };
    })
    .filter(Boolean);
}

function getEventReminderItems() {
  const leadDays = Number(reminderSettings.eventLeadDays) || 3;

  return events
    .map((eventItem) => {
      const days = daysFromToday(eventItem.date);
      if (days === null || days < 0 || days > leadDays) return null;

      let severity = "upcoming";
      let label = `In ${days} days`;

      if (days === 0) {
        severity = "today";
        label = "Today";
      } else if (days === 1) {
        label = "Tomorrow";
      }

      return {
        id: `event-${eventItem.id}-${eventItem.date}`,
        type: "event",
        severity,
        title: eventItem.title || "Untitled event",
        meta: `${label} · ${formatReminderDate(eventItem.date)}`,
        dateKey: eventItem.date,
        workspace: eventItem.workspace || "personal",
        entityId: eventItem.id
      };
    })
    .filter(Boolean);
}

function getDocumentReminderItems() {
  return documents
    .filter((documentItem) => !documentItem.deleted_at && documentItem.expiry_date)
    .map((documentItem) => {
      const days = daysFromToday(documentItem.expiry_date);
      if (days === null) return null;

      const reminderDays = Math.max(0, Number(documentItem.reminder_days) || 30);
      if (days > reminderDays) return null;

      let severity = "upcoming";
      let label = `${days} days remaining`;

      if (days < 0) {
        severity = "critical";
        label = `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago`;
      } else if (days === 0) {
        severity = "today";
        label = "Expires today";
      } else if (days === 1) {
        label = "Expires tomorrow";
      }

      return {
        id: `document-${documentItem.id}-${documentItem.expiry_date}`,
        type: "document",
        severity,
        title: documentItem.name || "Untitled document",
        meta: `${label} · ${formatReminderDate(documentItem.expiry_date)}`,
        dateKey: documentItem.expiry_date,
        workspace: documentItem.folder || "Documents",
        entityId: documentItem.id
      };
    })
    .filter(Boolean);
}

function getRawReminderItems() {
  const severityOrder = { critical: 0, today: 1, upcoming: 2 };

  return [
    ...getTaskReminderItems(),
    ...getEventReminderItems(),
    ...getDocumentReminderItems()
  ].sort((a, b) => {
    return (severityOrder[a.severity] - severityOrder[b.severity])
      || String(a.dateKey).localeCompare(String(b.dateKey))
      || a.title.localeCompare(b.title);
  });
}

function getVisibleReminderItems() {
  const today = getLocalDateKey();
  const dismissed = loadDismissedReminderMap();
  return getRawReminderItems().filter((item) => dismissed[item.id] !== today);
}

function getReminderSummary(items = currentReminderItems) {
  return {
    attention: items.filter((item) => item.severity === "critical").length,
    today: items.filter((item) => item.severity === "today").length,
    upcoming: items.filter((item) => item.severity === "upcoming").length,
    total: items.length
  };
}

function getReminderTypeLabel(type) {
  if (type === "task") return "Task";
  if (type === "event") return "Event";
  return "Document";
}

function openReminderSource(item) {
  if (item.type === "task") openApp("tasks");
  else if (item.type === "event") openApp("calendar");
  else openApp("documents");
}

function updateReminderBadges(summary) {
  const count = summary.attention + summary.today;
  const topBadge = $("notificationBadge");
  const dockBadge = $("dockReminderBadge");
  const mobileMoreBadge = $("mobileMoreBadge");

  [topBadge, dockBadge, mobileMoreBadge].forEach((badge) => {
    if (!badge) return;
    badge.textContent = count > 99 ? "99+" : String(count);
    badge.classList.toggle("hidden", count === 0);
  });
}

function updateBrowserNotificationStatus() {
  const badge = $("browserNotificationStatus");
  const toggle = $("browserReminderToggle");
  if (!badge || !toggle) return;

  if (!("Notification" in window)) {
    badge.textContent = "Not supported";
    badge.className = "reminder-permission-badge unavailable";
    toggle.disabled = true;
    toggle.checked = false;
    return;
  }

  const permission = Notification.permission;
  const labelMap = {
    granted: "Permission granted",
    denied: "Permission blocked",
    default: "Permission not requested"
  };

  badge.textContent = labelMap[permission] || permission;
  badge.className = `reminder-permission-badge ${permission}`;
  toggle.disabled = permission === "denied";
  toggle.checked = Boolean(reminderSettings.browserNotifications && permission === "granted");
}

function renderReminderCenter() {
  currentReminderItems = getVisibleReminderItems();
  const summary = getReminderSummary(currentReminderItems);
  updateReminderBadges(summary);

  if (!$("reminderList")) return;

  $("reminderAttentionCount").textContent = String(summary.attention);
  $("reminderTodayCount").textContent = String(summary.today);
  $("reminderUpcomingCount").textContent = String(summary.upcoming);
  $("reminderTotalCount").textContent = String(summary.total);

  $("dailySummaryToggle").checked = Boolean(reminderSettings.dailySummary);
  $("taskReminderLeadDays").value = String(reminderSettings.taskLeadDays);
  $("eventReminderLeadDays").value = String(reminderSettings.eventLeadDays);
  updateBrowserNotificationStatus();

  $("emptyReminders").hidden = currentReminderItems.length > 0;
  $("dismissAllRemindersButton").disabled = currentReminderItems.length === 0;

  $("reminderList").innerHTML = currentReminderItems.map((item) => `
    <article class="reminder-item ${escapeHtml(item.severity)}">
      <span class="reminder-item-icon" aria-hidden="true">${
        item.type === "task" ? "✓" : item.type === "event" ? "◫" : "▣"
      }</span>
      <div class="reminder-item-body">
        <div class="reminder-item-heading">
          <span>${escapeHtml(getReminderTypeLabel(item.type))}</span>
          <small>${escapeHtml(item.workspace)}</small>
        </div>
        <strong>${escapeHtml(item.title)}</strong>
        <p>${escapeHtml(item.meta)}</p>
      </div>
      <div class="reminder-item-actions">
        <button class="secondary-button" type="button" data-reminder-open="${escapeHtml(item.id)}">Open</button>
        <button class="reminder-dismiss-button" type="button" data-reminder-dismiss="${escapeHtml(item.id)}">Dismiss today</button>
      </div>
    </article>
  `).join("");

  $("reminderList").querySelectorAll("[data-reminder-open]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = currentReminderItems.find((entry) => entry.id === button.dataset.reminderOpen);
      if (item) openReminderSource(item);
    });
  });

  $("reminderList").querySelectorAll("[data-reminder-dismiss]").forEach((button) => {
    button.addEventListener("click", () => {
      dismissReminderForToday(button.dataset.reminderDismiss);
    });
  });
}

async function requestBrowserNotificationAccess() {
  if (!("Notification" in window)) {
    showToast("Browser notifications are not supported");
    return false;
  }

  if (Notification.permission === "denied") {
    showToast("Enable notifications in your browser site settings");
    return false;
  }

  const permission = Notification.permission === "granted"
    ? "granted"
    : await Notification.requestPermission();

  reminderSettings.browserNotifications = permission === "granted";
  saveReminderSettings();
  updateBrowserNotificationStatus();

  if (permission === "granted") {
    showToast("Browser reminders enabled");
    return true
  }

  showToast("Notification permission was not granted");
  return false;
}

async function showBrowserReminderNotification(items) {
  if (!reminderSettings.browserNotifications || !items.length) return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  const urgent = items.filter((item) => ["critical", "today"].includes(item.severity));
  if (!urgent.length) return;

  const signature = `${getLocalDateKey()}|${urgent.map((item) => item.id).join(",")}`;
  if (localStorage.getItem(STORAGE.lastBrowserReminderSignature) === signature) return;

  const summary = getReminderSummary(items);
  const bodyParts = [];
  if (summary.attention) bodyParts.push(`${summary.attention} overdue or expired`);
  if (summary.today) bodyParts.push(`${summary.today} due today`);

  const options = {
    body: bodyParts.join(" · "),
    icon: "./icons/icon-192.png",
    badge: "./icons/icon-192.png",
    tag: "the-box-reminder-summary",
    renotify: false
  };

  try {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification("The Box OS reminders", options);
    } else {
      new Notification("The Box OS reminders", options);
    }
    localStorage.setItem(STORAGE.lastBrowserReminderSignature, signature);
  } catch (error) {
    console.error("Browser notification failed:", error);
  }
}

function showDailyReminderSummary() {
  if (!reminderSettings.dailySummary) return;

  const today = getLocalDateKey();
  if (localStorage.getItem(STORAGE.lastDailyReminderSummary) === today) return;

  const items = getVisibleReminderItems();
  localStorage.setItem(STORAGE.lastDailyReminderSummary, today);

  if (!items.length) {
    showToast("Reminder check complete — nothing urgent today");
    return;
  }

  const summary = getReminderSummary(items);
  const parts = [];
  if (summary.attention) parts.push(`${summary.attention} overdue or expired`);
  if (summary.today) parts.push(`${summary.today} due today`);
  if (summary.upcoming) parts.push(`${summary.upcoming} upcoming`);

  showToast(`Reminder summary: ${parts.join(" · ")}`);
  showBrowserReminderNotification(items);
}

function checkReminders({ manual = false } = {}) {
  renderReminderCenter();
  const summary = getReminderSummary(currentReminderItems);

  if (manual) {
    const message = summary.total
      ? `${summary.total} reminder${summary.total === 1 ? "" : "s"} found`
      : "Nothing needs your attention";
    showToast(message);
  }

  showBrowserReminderNotification(currentReminderItems);
}

function scheduleReminderChecks() {
  clearInterval(reminderCheckTimer);
  reminderCheckTimer = setInterval(() => checkReminders(), 15 * 60 * 1000);
}

function updateReminderSettingFromControls() {
  reminderSettings.dailySummary = $("dailySummaryToggle").checked;
  reminderSettings.taskLeadDays = Number($("taskReminderLeadDays").value) || 3;
  reminderSettings.eventLeadDays = Number($("eventReminderLeadDays").value) || 3;
  saveReminderSettings();
  renderReminderCenter();
  renderJournalCenter();
  renderOurSpaceCenter();
}


const BACKUP_FORMAT = "the-box-os-backup";
const BACKUP_FORMAT_VERSION = 1;
const BACKUP_APP_VERSION = "7O.11-Free";
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
    goals: goals.map((goal) => ({ ...goal, linkedProjects: [...goal.linkedProjects], linkedTaskIds: [...goal.linkedTaskIds], milestones: goal.milestones.map((item) => ({ ...item })) })),
    routines: routines.map((routine) => ({ ...routine, days: [...routine.days] })),
    events: events.map((event) => ({ ...event })),
    journalEntries: journalEntries.map((entry) => ({ ...entry, tags: [...entry.tags] })),
    ourSpacePlans: ourSpacePlans.map((plan) => ({
      ...plan,
      checklist: plan.checklist.map((item) => ({ ...item })),
      links: plan.links.map((item) => ({ ...item })),
      attachments: plan.attachments.map((item) => ({ ...item }))
    })),
    financeEntries: financeEntries.map((entry) => ({ ...entry })),
    notes: serializeNotesPayload(),
    customTemplates: customTemplates.map((template) => ({ ...template })),
    preferences: {
      theme: localStorage.getItem(STORAGE.theme) || "dark",
      timerMinutes: Number(localStorage.getItem(STORAGE.timerMinutes) || 25),
      focusTotal: Number(localStorage.getItem(STORAGE.focusTotal) || 0),
      windowLayouts: readWindowLayouts(),
      documentView: localStorage.getItem(STORAGE.documentView) || "grid",
      reminderSettings: { ...reminderSettings }
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
  $("backupGoalCount").textContent = String(goals.length);
  $("backupRoutineCount").textContent = String(routines.length);
  $("backupEventCount").textContent = String(events.length);
  $("backupJournalCount").textContent = String(journalEntries.length);
  $("backupOurSpaceCount").textContent = String(ourSpacePlans.length);
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
      <small>${backup.data.goals?.length || 0} goals</small>
      <small>${backup.data.routines?.length || 0} routines</small>
      <small>${backup.data.events.length} events</small>
      <small>${backup.data.journalEntries?.length || 0} journal entries</small>
      <small>${backup.data.ourSpacePlans?.length || 0} Our Space plans</small>
      <small>${backup.data.financeEntries.length} finance entries</small>
      <small>${inventory?.documents?.length || 0} document records</small>
      <small>${backup.data.customTemplates?.length || 0} custom templates</small>
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
    const hasGoals = Array.isArray(parsed.data.goals);
    const hasRoutines = Array.isArray(parsed.data.routines);
    $("restoreBackupGoals").disabled = !hasGoals;
    $("restoreBackupGoals").checked = hasGoals;
    $("restoreBackupRoutines").disabled = !hasRoutines;
    $("restoreBackupRoutines").checked = hasRoutines;
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

  reminderSettings = {
    ...DEFAULT_REMINDER_SETTINGS,
    ...(preferences.reminderSettings || {})
  };
  saveReminderSettings();

  document.body.classList.toggle("light-theme", theme === "light");
  $("themeButton").textContent = theme === "light" ? "☀" : "☾";
  updateTimerDisplay();
}

async function restoreSelectedBackup() {
  if (!pendingBackupImport || backupBusy) return;

  const selected = {
    tasks: $("restoreBackupTasks").checked,
    goals: $("restoreBackupGoals").checked,
    routines: $("restoreBackupRoutines").checked,
    events: $("restoreBackupEvents").checked,
    journal: $("restoreBackupJournal").checked,
    ourSpace: $("restoreBackupOurSpace").checked,
    finance: $("restoreBackupFinance").checked,
    notes: $("restoreBackupNotes").checked,
    preferences: $("restoreBackupPreferences").checked,
    templates: $("restoreBackupTemplates").checked
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
    }
    if (selected.goals) {
      goals = normalizeGoals(data.goals || []);
      selectedGoalId = null;
      goalDraftMilestones = [];
      goalDraftLinkedProjects = [];
      goalDraftLinkedTaskIds = [];
    }
    if (selected.routines) {
      routines = normalizeRoutines(data.routines || []);
      selectedRoutineId = null;
    }
    if (selected.tasks || selected.goals || selected.routines) {
      writeTaskGoalLocalRecords();
    }
    if (selected.events) {
      events = normalizeBackupEvents(data.events);
      localStorage.setItem(STORAGE.events, JSON.stringify(events));
    }
    if (selected.journal) {
      journalEntries = normalizeJournalEntries(data.journalEntries || []);
      persistJournalEntries({ pendingCloudSync: shouldSync });
      selectedJournalEntryId = null;
      journalEditorInitialized = false;
      localStorage.removeItem(STORAGE.journalDraft);
    }
    if (selected.ourSpace) {
      ourSpacePlans = normalizeOurSpacePlans(data.ourSpacePlans || []);
      persistOurSpacePlans({ pendingCloudSync: shouldSync });
      selectedOurSpacePlanId = null;
      resetOurSpaceEditor();
    }
    if (selected.finance) {
      financeEntries = normalizeBackupFinance(data.financeEntries);
      localStorage.setItem(STORAGE.finance, JSON.stringify(financeEntries));
    }
    if (selected.notes) {
      const notesPayload = String(data.notes || "").slice(0, 4000000);
      localStorage.setItem(STORAGE.notes, notesPayload);
      initializeNoteItems(notesPayload);
      renderNotesCenter();
    }
    if (selected.preferences) {
      restoreBackupPreferences(data.preferences || {});
    }
    if (selected.templates) {
      customTemplates = normalizeCustomTemplates(data.customTemplates || []);
      persistCustomTemplates();
      selectedTemplateId = BUILT_IN_TEMPLATES[0]?.id || customTemplates[0]?.id || "";
    }

    renderAll();

    if (shouldSync) {
      setBackupStatus("Local restore complete. Syncing restored data to cloud…", "working");
      if (selected.templates && window.BoxCloud?.replaceCustomTemplates) {
        const templateSyncResult = await window.BoxCloud.replaceCustomTemplates(customTemplates);
        if (templateSyncResult.error) throw templateSyncResult.error;
      }
      if (selected.ourSpace && window.BoxCloud?.replaceOurSpacePlans) {
        const ourSpaceSyncResult = await window.BoxCloud.replaceOurSpacePlans(ourSpacePlans);
        if (ourSpaceSyncResult.error) throw ourSpaceSyncResult.error;
      }
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








function getAgendaDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function getAgendaItems() {
  const items = [];

  tasks
    .filter((task) => !task.completed && task.dueDate)
    .forEach((task) => {
      items.push({
        kind: "task",
        id: String(task.id),
        date: task.dueDate,
        icon: task.priority === "urgent" ? "!" : "✓",
        title: task.text || "Untitled task",
        meta: [
          task.workspace || "personal",
          task.project ? `◆ ${task.project}` : "",
          task.priority || "normal"
        ].filter(Boolean).join(" · "),
        workspace: task.workspace || "personal",
        searchText: `${task.text || ""} ${task.details || ""} ${task.project || ""} ${(task.tags || []).join(" ")}`
      });
    });

  events
    .filter((eventItem) => eventItem.date)
    .forEach((eventItem) => {
      items.push({
        kind: "event",
        id: String(eventItem.id),
        date: eventItem.date,
        icon: "◫",
        title: eventItem.title || "Untitled event",
        meta: eventItem.workspace || "personal",
        workspace: eventItem.workspace || "personal",
        searchText: `${eventItem.title || ""} ${eventItem.workspace || ""}`
      });
    });

  routines
    .filter((routine) => routine.state === "active")
    .forEach((routine) => {
      const nextDate = getNextRoutineDate(routine, { afterToday: true, maxDays: 120 });
      if (!nextDate) return;
      items.push({
        kind: "routine",
        id: String(routine.id),
        date: nextDate,
        icon: "↻",
        title: routine.title || "Untitled routine",
        meta: [
          routine.workspace || "personal",
          getRoutineScheduleLabel(routine),
          routine.preferredTime ? `Preferred ${routine.preferredTime}` : ""
        ].filter(Boolean).join(" · "),
        workspace: routine.workspace || "personal",
        searchText: `${routine.title || ""} ${routine.details || ""} ${routine.project || ""} ${getRoutineScheduleLabel(routine)}`
      });
    });

  goals
    .filter((goal) =>
      goal.targetDate &&
      getGoalDerivedStatus(goal) !== "completed"
    )
    .forEach((goal) => {
      const status = getGoalDerivedStatus(goal);
      items.push({
        kind: "goal",
        id: String(goal.id),
        date: goal.targetDate,
        icon: "◎",
        title: goal.title || "Untitled goal",
        meta: [
          goal.workspace || "personal",
          getGoalStatusLabel(status),
          `${getGoalProgress(goal)}%`
        ].filter(Boolean).join(" · "),
        workspace: goal.workspace || "personal",
        searchText: `${goal.title || ""} ${goal.description || ""} ${(goal.linkedProjects || []).join(" ")} ${(goal.milestones || []).map((item) => item.text).join(" ")}`
      });
    });

  ourSpacePlans
    .filter((plan) => plan.status !== "done" && plan.target_date)
    .forEach((plan) => {
      items.push({
        kind: "ourspace",
        id: String(plan.id),
        date: plan.target_date,
        icon: getOurSpaceCategoryIcon(plan.category),
        title: plan.title || "Untitled plan",
        meta: [
          plan.category || "Other",
          plan.place || "",
          getOurSpaceStatusLabel(plan.status)
        ].filter(Boolean).join(" · "),
        workspace: "",
        searchText: `${plan.title || ""} ${plan.notes || ""} ${plan.place || ""} ${plan.category || ""}`
      });
    });

  documents
    .filter((documentItem) => !documentItem.deleted_at && documentItem.expiry_date)
    .forEach((documentItem) => {
      const compliance = getDocumentCompliance(documentItem);
      items.push({
        kind: "document",
        id: String(documentItem.id),
        date: documentItem.expiry_date,
        icon: compliance.key === "expired" ? "!" : "⌛",
        title: documentItem.name || "Untitled file",
        meta: [
          documentItem.folder || "Documents",
          compliance.label
        ].filter(Boolean).join(" · "),
        workspace: "",
        searchText: `${documentItem.name || ""} ${documentItem.folder || ""} ${documentItem.details || ""} ${(getDocumentTags(documentItem) || []).join(" ")}`,
        complianceKey: compliance.key
      });
    });

  return items.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    const rank = { task: 0, routine: 1, goal: 2, event: 3, ourspace: 4, document: 5 };
    return (rank[a.kind] ?? 9) - (rank[b.kind] ?? 9);
  });
}

function getFilteredAgendaItems() {
  const today = getLocalDateKey();
  const end = new Date(`${today}T00:00:00`);
  end.setDate(end.getDate() + Number(agendaRangeDays || 14));
  const endKey = getAgendaDateKey(end);
  const query = agendaSearchTerm.toLocaleLowerCase();

  return getAgendaItems().filter((item) => {
    const withinDateRange =
      item.date < today ||
      (item.date >= today && item.date <= endKey);
    if (!withinDateRange) return false;

    if (agendaTypeFilter !== "all" && item.kind !== agendaTypeFilter) return false;

    if (agendaWorkspaceFilter !== "all") {
      if (!["task", "event", "goal", "routine"].includes(item.kind)) return false;
      if (item.workspace !== agendaWorkspaceFilter) return false;
    }

    if (query) {
      const haystack = `${item.title} ${item.meta || ""} ${item.searchText || ""}`
        .toLocaleLowerCase();
      if (!haystack.includes(query)) return false;
    }

    return true;
  });
}

function getAgendaGroupKey(item) {
  const today = getLocalDateKey();
  if (item.date < today) return "overdue";
  return item.date;
}

function getAgendaGroupLabel(groupKey) {
  if (groupKey === "overdue") return "Overdue";

  const today = getLocalDateKey();
  if (groupKey === today) return "Today";

  const tomorrow = new Date(`${today}T00:00:00`);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = getAgendaDateKey(tomorrow);
  if (groupKey === tomorrowKey) return "Tomorrow";

  const date = new Date(`${groupKey}T00:00:00`);
  return date.toLocaleDateString("en-PH", {
    weekday: "long",
    month: "short",
    day: "numeric"
  });
}

function getAgendaKindLabel(kind) {
  return {
    task: "Task",
    event: "Event",
    ourspace: "Our Space",
    document: "Vault"
  }[kind] || "Item";
}

function getAgendaDateMeta(item) {
  const today = getLocalDateKey();
  if (item.date < today) {
    if (item.kind === "document") {
      return getDocumentCompliance(
        documents.find((documentItem) => String(documentItem.id) === String(item.id)) || {}
      ).label;
    }
    return getDueDateInfo(
      tasks.find((task) => String(task.id) === String(item.id)) || { dueDate: item.date }
    )?.label || formatTaskDate(item.date);
  }

  if (item.date === today) return "Today";
  return formatTaskDate(item.date);
}

function openAgendaItem(kind, id) {
  if (kind === "task") {
    const task = tasks.find((item) => String(item.id) === String(id));
    if (!task) return;
    openApp("tasks");
    openTaskModal(task, "tasks", task.id);
    return;
  }

  if (kind === "routine") {
    openApp("routines");
    selectRoutine(id);
    return;
  }

  if (kind === "goal") {
    openApp("goals");
    selectGoal(id);
    return;
  }

  if (kind === "event") {
    const eventItem = events.find((item) => String(item.id) === String(id));
    if (!eventItem) return;
    const date = new Date(`${eventItem.date}T00:00:00`);
    shownMonth = date.getMonth();
    shownYear = date.getFullYear();
    openApp("calendar");
    renderCalendar();
    renderEvents();
    return;
  }

  if (kind === "ourspace") {
    openApp("ourspace");
    selectOurSpacePlan(id);
    return;
  }

  if (kind === "document") {
    const documentItem = documents.find((item) => String(item.id) === String(id));
    openApp("documents");
    if (documentItem) openDocumentPreview(documentItem);
  }
}

function renderAgenda() {
  if (!$("agendaTimeline")) return;

  const all = getAgendaItems();
  const visible = getFilteredAgendaItems();
  const today = getLocalDateKey();

  const sevenDaysOut = new Date(`${today}T00:00:00`);
  sevenDaysOut.setDate(sevenDaysOut.getDate() + 7);
  const sevenDaysOutKey = getAgendaDateKey(sevenDaysOut);

  $("agendaOverdueCount").textContent = String(
    all.filter((item) => item.date < today).length
  );
  $("agendaTodayCount").textContent = String(
    all.filter((item) => item.date === today).length
  );
  $("agendaNextWeekCount").textContent = String(
    all.filter((item) => item.date > today && item.date <= sevenDaysOutKey).length
  );
  $("agendaComplianceCount").textContent = String(
    all.filter((item) =>
      item.kind === "document" &&
      ["expired", "expiring"].includes(item.complianceKey)
    ).length
  );

  $("agendaSearchInput").value = agendaSearchTerm;
  $("agendaTypeFilter").value = agendaTypeFilter;
  $("agendaWorkspaceFilter").value = agendaWorkspaceFilter;
  $("agendaRangeFilter").value = String(agendaRangeDays);

  const rangeText = `Overdue + next ${agendaRangeDays} days`;
  $("agendaRangeLabel").textContent = rangeText;
  $("agendaHeading").textContent = rangeText;
  $("agendaEyebrow").textContent =
    agendaTypeFilter === "all"
      ? "TIMELINE"
      : `${getAgendaKindLabel(agendaTypeFilter).toUpperCase()} AGENDA`;
  $("agendaResultCount").textContent =
    `${visible.length} item${visible.length === 1 ? "" : "s"}`;
  $("agendaEmptyState").hidden = visible.length > 0;

  const grouped = new Map();
  visible.forEach((item) => {
    const key = getAgendaGroupKey(item);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item);
  });

  const orderedKeys = Array.from(grouped.keys()).sort((a, b) => {
    if (a === "overdue") return -1;
    if (b === "overdue") return 1;
    return a.localeCompare(b);
  });

  $("agendaTimeline").innerHTML = orderedKeys.map((key) => {
    const items = grouped.get(key);
    return `
      <section class="agenda-day-group ${key === "overdue" ? "overdue" : ""}"
        data-agenda-group="${escapeHtml(key)}">
        <header class="agenda-day-heading">
          <div>
            <small>${key === "overdue" ? "NEEDS ATTENTION" : escapeHtml(formatTaskDate(key))}</small>
            <strong>${escapeHtml(getAgendaGroupLabel(key))}</strong>
          </div>
          <span>${items.length} item${items.length === 1 ? "" : "s"}</span>
        </header>

        <div class="agenda-day-list">
          ${items.map((item) => `
            <button class="agenda-item ${escapeHtml(item.kind)} ${item.complianceKey ? escapeHtml(item.complianceKey) : ""}"
              type="button"
              data-agenda-kind="${escapeHtml(item.kind)}"
              data-agenda-id="${escapeHtml(item.id)}">
              <span class="agenda-item-icon">${escapeHtml(item.icon)}</span>
              <span class="agenda-item-copy">
                <small>${escapeHtml(getAgendaKindLabel(item.kind))}</small>
                <strong>${escapeHtml(item.title)}</strong>
                <p>${escapeHtml(item.meta || "Open item")}</p>
              </span>
              <span class="agenda-item-date">${escapeHtml(getAgendaDateMeta(item))}</span>
            </button>
          `).join("")}
        </div>
      </section>
    `;
  }).join("");

  $("agendaTimeline").querySelectorAll("[data-agenda-kind]").forEach((button) => {
    button.addEventListener("click", () =>
      openAgendaItem(button.dataset.agendaKind, button.dataset.agendaId)
    );
  });
}

function isTimestampToday(value) {
  const timestamp = getActivityTimestamp(value);
  if (!timestamp) return false;
  const date = new Date(timestamp);
  return getWeeklyReviewDateKey(date) === getLocalDateKey();
}

function getTodayPriorityTasks() {
  const today = getLocalDateKey();
  const rank = { urgent: 0, important: 1, normal: 2 };

  return tasks
    .filter((task) => !task.completed)
    .sort((a, b) => {
      const aOverdue = a.dueDate && a.dueDate < today ? 0 : 1;
      const bOverdue = b.dueDate && b.dueDate < today ? 0 : 1;
      if (aOverdue !== bOverdue) return aOverdue - bOverdue;

      const aToday = a.dueDate === today ? 0 : 1;
      const bToday = b.dueDate === today ? 0 : 1;
      if (aToday !== bToday) return aToday - bToday;

      const priorityDiff = (rank[a.priority] ?? 3) - (rank[b.priority] ?? 3);
      if (priorityDiff) return priorityDiff;

      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;

      return String(b.updatedAt || b.createdAt || "")
        .localeCompare(String(a.updatedAt || a.createdAt || ""));
    })
    .slice(0, 5);
}

function getTodayScheduleItems() {
  const today = getLocalDateKey();

  const eventItems = events
    .filter((eventItem) => eventItem.date === today)
    .map((eventItem) => ({
      kind: "event",
      id: String(eventItem.id),
      title: eventItem.title || "Untitled event",
      meta: eventItem.workspace || "personal",
      icon: "◫"
    }));

  const taskItems = tasks
    .filter((task) => !task.completed && task.dueDate === today)
    .map((task) => ({
      kind: "task",
      id: String(task.id),
      title: task.text || "Untitled task",
      meta: [
        task.workspace || "personal",
        task.project ? `◆ ${task.project}` : "",
        task.priority || "normal"
      ].filter(Boolean).join(" · "),
      icon: "✓"
    }));

  const planItems = ourSpacePlans
    .filter((plan) => plan.status !== "done" && plan.target_date === today)
    .map((plan) => ({
      kind: "ourspace",
      id: String(plan.id),
      title: plan.title || "Untitled plan",
      meta: [
        plan.category || "Other",
        plan.place || ""
      ].filter(Boolean).join(" · "),
      icon: getOurSpaceCategoryIcon(plan.category)
    }));

  return [...eventItems, ...taskItems, ...planItems];
}

function getTodayNextItems() {
  const today = new Date(`${getLocalDateKey()}T00:00:00`);
  const end = new Date(today);
  end.setDate(end.getDate() + 4);
  const todayKey = getLocalDateKey();

  const taskItems = tasks
    .filter((task) => {
      if (task.completed || !task.dueDate || task.dueDate <= todayKey) return false;
      const date = new Date(`${task.dueDate}T00:00:00`);
      return date <= end;
    })
    .map((task) => ({
      kind: "task",
      id: String(task.id),
      date: task.dueDate,
      title: task.text || "Untitled task",
      meta: task.workspace || "personal"
    }));

  const eventItems = events
    .filter((eventItem) => {
      if (!eventItem.date || eventItem.date <= todayKey) return false;
      const date = new Date(`${eventItem.date}T00:00:00`);
      return date <= end;
    })
    .map((eventItem) => ({
      kind: "event",
      id: String(eventItem.id),
      date: eventItem.date,
      title: eventItem.title || "Untitled event",
      meta: eventItem.workspace || "personal"
    }));

  return [...taskItems, ...eventItems]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 7);
}

function openTodayItem(kind, id) {
  if (kind === "task") {
    const task = tasks.find((item) => String(item.id) === String(id));
    if (!task) return;
    openApp("tasks");
    openTaskModal(task, "tasks", task.id);
    return;
  }

  if (kind === "event") {
    const eventItem = events.find((item) => String(item.id) === String(id));
    if (!eventItem) return;
    const date = new Date(`${eventItem.date}T00:00:00`);
    shownMonth = date.getMonth();
    shownYear = date.getFullYear();
    openApp("calendar");
    renderCalendar();
    renderEvents();
    return;
  }

  if (kind === "ourspace") {
    openApp("ourspace");
    selectOurSpacePlan(id);
  }
}

function renderTodayPlanner() {
  if (!$("todayPriorityList")) return;

  const now = new Date();
  const today = getLocalDateKey();

  $("todayPlannerGreeting").textContent = getDashboardGreeting();
  $("todayPlannerDate").textContent = now.toLocaleDateString("en-PH", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  });

  const openTasks = tasks.filter((task) => !task.completed);
  const overdue = openTasks.filter((task) => task.dueDate && task.dueDate < today);
  const dueToday = openTasks.filter((task) => task.dueDate === today);
  const urgent = openTasks.filter((task) => task.priority === "urgent");
  const todayEvents = events.filter((eventItem) => eventItem.date === today);

  const todayFinance = financeEntries.filter((entry) => isTimestampToday(entry.createdAt));
  const todayIncome = todayFinance
    .filter((entry) => entry.type === "income")
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const todayExpenses = todayFinance
    .filter((entry) => entry.type === "expense")
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

  $("todayOverdueCount").textContent = String(overdue.length);
  $("todayDueCount").textContent = String(dueToday.length);
  $("todayEventCount").textContent = String(todayEvents.length);
  $("todayUrgentCount").textContent = String(urgent.length);
  $("todayFinanceNet").textContent = formatMoney(todayIncome - todayExpenses);

  const priorities = getTodayPriorityTasks();
  $("todayPriorityEmpty").hidden = priorities.length > 0;
  $("todayPriorityList").innerHTML = priorities.map((task) => `
    <button class="today-list-item task ${escapeHtml(task.priority || "normal")}" type="button"
      data-today-kind="task" data-today-id="${escapeHtml(String(task.id))}">
      <span class="today-item-icon">${task.priority === "urgent" ? "!" : "✓"}</span>
      <span class="today-item-copy">
        <strong>${escapeHtml(task.text || "Untitled task")}</strong>
        <small>
          ${escapeHtml(task.workspace || "personal")}
          ${task.project ? ` · ◆ ${escapeHtml(task.project)}` : ""}
        </small>
      </span>
      <span class="today-item-meta">${escapeHtml(getDashboardTaskDueLabel(task) || getTaskStatusLabel(task.status))}</span>
    </button>
  `).join("");

  const schedule = getTodayScheduleItems();
  $("todayScheduleEmpty").hidden = schedule.length > 0;
  $("todayScheduleList").innerHTML = schedule.map((item) => `
    <button class="today-list-item schedule ${escapeHtml(item.kind)}" type="button"
      data-today-kind="${escapeHtml(item.kind)}" data-today-id="${escapeHtml(item.id)}">
      <span class="today-item-icon">${escapeHtml(item.icon)}</span>
      <span class="today-item-copy">
        <strong>${escapeHtml(item.title)}</strong>
        <small>${escapeHtml(item.meta || "")}</small>
      </span>
      <span class="today-item-meta">Today</span>
    </button>
  `).join("");

  const overdueVisible = [...overdue]
    .sort((a, b) => {
      if (a.dueDate !== b.dueDate) return String(a.dueDate).localeCompare(String(b.dueDate));
      return a.priority === "urgent" ? -1 : 1;
    })
    .slice(0, 6);

  $("todayOverdueEmpty").hidden = overdueVisible.length > 0;
  $("todayOverdueList").innerHTML = overdueVisible.map((task) => `
    <button class="today-list-item overdue" type="button"
      data-today-kind="task" data-today-id="${escapeHtml(String(task.id))}">
      <span class="today-item-icon">!</span>
      <span class="today-item-copy">
        <strong>${escapeHtml(task.text || "Untitled task")}</strong>
        <small>${escapeHtml(task.workspace || "personal")}${task.project ? ` · ◆ ${escapeHtml(task.project)}` : ""}</small>
      </span>
      <span class="today-item-meta">${escapeHtml(getDueDateInfo(task)?.label || "Overdue")}</span>
    </button>
  `).join("");

  document.querySelectorAll("#todayPriorityList [data-today-kind], #todayScheduleList [data-today-kind], #todayOverdueList [data-today-kind]")
    .forEach((button) => {
      button.addEventListener("click", () =>
        openTodayItem(button.dataset.todayKind, button.dataset.todayId)
      );
    });

  const weeklyRoutinePulse = routines
    .filter((routine) => routine.state === "active")
    .map((routine) => ({
      routine,
      stats: getWeeklyRoutineStats(routine)
    }))
    .sort((a, b) => {
      const aRate = a.stats.scheduled ? a.stats.completed / a.stats.scheduled : 1;
      const bRate = b.stats.scheduled ? b.stats.completed / b.stats.scheduled : 1;
      if (aRate !== bRate) return aRate - bRate;
      return a.routine.title.localeCompare(b.routine.title);
    })
    .slice(0, 6);

  $("weeklyReviewRoutinesEmpty").hidden = weeklyRoutinePulse.length > 0;
  $("weeklyReviewRoutineList").innerHTML = weeklyRoutinePulse.map(({ routine, stats }) => {
    const rate = stats.scheduled
      ? Math.round((stats.completed / stats.scheduled) * 100)
      : 100;
    return `
      <button class="weekly-review-item routine" type="button"
        data-weekly-review-routine="${escapeHtml(routine.id)}">
        <span class="weekly-review-item-icon">↻</span>
        <span class="weekly-review-item-copy">
          <strong>${escapeHtml(routine.title)}</strong>
          <small>${escapeHtml(routine.workspace)} · ${stats.completed}/${stats.scheduled} scheduled days</small>
        </span>
        <span class="weekly-review-item-meta">${rate}%</span>
      </button>
    `;
  }).join("");

  $("weeklyReviewRoutineList").querySelectorAll("[data-weekly-review-routine]").forEach((button) => {
    button.addEventListener("click", () => {
      openApp("routines");
      selectRoutine(button.dataset.weeklyReviewRoutine);
    });
  });

  const workspaceRows = WORKSPACE_HUB_DEFINITIONS.map((definition) => ({
    definition,
    data: getWorkspaceHubData(definition.key)
  }));

  $("todayWorkspaceList").innerHTML = workspaceRows.map(({ definition, data }) => `
    <button class="today-workspace-row" type="button"
      data-today-workspace="${escapeHtml(definition.key)}">
      <span class="today-workspace-icon">${escapeHtml(definition.icon)}</span>
      <span class="today-workspace-copy">
        <strong>${escapeHtml(definition.label)}</strong>
        <small>${data.openTasks.length} open · ${data.urgentTasks.length} urgent · ${data.upcomingEvents.length} upcoming</small>
      </span>
      <span class="today-workspace-count">${data.openTasks.length}</span>
    </button>
  `).join("");

  $("todayWorkspaceList").querySelectorAll("[data-today-workspace]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedWorkspaceHub = button.dataset.todayWorkspace;
      openApp("workspaces");
      renderWorkspacesHub();
    });
  });

  const todayJournal = journalEntries.find((entry) => entry.entry_date === today);
  $("todayJournalStatus").textContent = todayJournal
    ? (todayJournal.title || "Journal entry saved")
    : "No entry yet";
  $("todayJournalPreview").textContent = todayJournal
    ? String(todayJournal.content || "Entry saved.").replace(/\s+/g, " ").trim().slice(0, 130)
    : "Write something about today.";

  const todayPlans = ourSpacePlans.filter(
    (plan) => plan.status !== "done" && plan.target_date === today
  );
  const firstPlan = todayPlans[0];
  $("todayOurSpaceStatus").textContent = firstPlan
    ? (firstPlan.title || "Plan scheduled today")
    : "Nothing scheduled today";
  $("todayOurSpacePreview").textContent = firstPlan
    ? [
        firstPlan.category || "Other",
        firstPlan.place || "",
        todayPlans.length > 1 ? `+${todayPlans.length - 1} more` : ""
      ].filter(Boolean).join(" · ")
    : "Plans with today's target date will appear here.";
  $("todayOurSpaceCard").dataset.planId = firstPlan?.id || "";

  const todayRoutines = routines
    .filter((routine) => isRoutineScheduledOnDate(routine, today))
    .sort((a, b) => (a.preferredTime || "99:99").localeCompare(b.preferredTime || "99:99"));

  $("todayRoutineEmpty").hidden = todayRoutines.length > 0;
  $("todayRoutineList").innerHTML = todayRoutines.map((routine) => {
    const task = getRoutineTaskForDate(routine, today);
    return `
      <div class="today-routine-row ${task?.completed ? "done" : "open"}">
        <button type="button" data-today-routine="${escapeHtml(routine.id)}">
          <span class="today-routine-icon">↻</span>
          <span class="today-routine-copy">
            <strong>${escapeHtml(routine.title)}</strong>
            <small>${escapeHtml(routine.workspace)}${routine.preferredTime ? ` · ${escapeHtml(routine.preferredTime)}` : ""} · ${getRoutineCurrentStreak(routine)}d streak</small>
          </span>
        </button>
        <button class="today-routine-complete" type="button"
          data-today-routine-complete="${escapeHtml(routine.id)}"
          ${task?.completed ? "disabled" : ""}>
          ${task?.completed ? "Done" : "Complete"}
        </button>
      </div>
    `;
  }).join("");

  $("todayRoutineList").querySelectorAll("[data-today-routine]").forEach((button) => {
    button.addEventListener("click", () => {
      openApp("routines");
      selectRoutine(button.dataset.todayRoutine);
    });
  });

  $("todayRoutineList").querySelectorAll("[data-today-routine-complete]").forEach((button) => {
    button.addEventListener("click", () => {
      const routine = routines.find((item) => item.id === button.dataset.todayRoutineComplete);
      if (!routine) return;
      let task = getRoutineTaskForDate(routine, today);
      if (!task) task = createRoutineTaskForDate(routine, today);
      if (task && !task.completed) setTaskStatus(task, "done");
    });
  });

  const goalFocus = getGoalFocusCandidate();
  if (goalFocus) {
    const status = getGoalDerivedStatus(goalFocus);
    const progress = getGoalProgress(goalFocus);
    $("todayGoalCard").dataset.goalId = goalFocus.id;
    $("todayGoalStatus").textContent = getGoalStatusLabel(status).toUpperCase();
    $("todayGoalTitle").textContent = goalFocus.title;
    $("todayGoalMeta").textContent = [
      `${progress}% complete`,
      goalFocus.targetDate ? formatGoalTargetDate(goalFocus.targetDate) : "",
      goalFocus.workspace
    ].filter(Boolean).join(" · ");
    $("todayGoalProgress").textContent = `${progress}%`;
    $("todayGoalCard").className = `today-goal-card ${status}`;
  } else {
    $("todayGoalCard").dataset.goalId = "";
    $("todayGoalStatus").textContent = "NO ACTIVE GOAL";
    $("todayGoalTitle").textContent = "Set a goal to connect today’s work to a bigger outcome.";
    $("todayGoalMeta").textContent = "Open Goals to get started.";
    $("todayGoalProgress").textContent = "0%";
    $("todayGoalCard").className = "today-goal-card";
  }

  const completedToday = tasks.filter(
    (task) => task.completed && isTimestampToday(task.updatedAt || task.createdAt)
  );
  const activityToday = getActivityItems().filter((item) =>
    isTimestampToday(item.timestamp)
  );

  $("todayCompletedCount").textContent = String(completedToday.length);
  $("todayActivityCount").textContent = String(activityToday.length);
  $("todayFocusMinutes").textContent = String(
    Number(localStorage.getItem(STORAGE.focusTotal) || 0)
  );

  const nextItems = getTodayNextItems();
  $("todayNextEmpty").hidden = nextItems.length > 0;
  $("todayNextList").innerHTML = nextItems.map((item) => `
    <button class="today-list-item next ${escapeHtml(item.kind)}" type="button"
      data-today-next-kind="${escapeHtml(item.kind)}"
      data-today-next-id="${escapeHtml(item.id)}">
      <span class="today-item-icon">${item.kind === "task" ? "✓" : "◫"}</span>
      <span class="today-item-copy">
        <strong>${escapeHtml(item.title)}</strong>
        <small>${escapeHtml(item.meta || "")}</small>
      </span>
      <span class="today-item-meta">${escapeHtml(formatTaskDate(item.date))}</span>
    </button>
  `).join("");

  $("todayNextList").querySelectorAll("[data-today-next-kind]").forEach((button) => {
    button.addEventListener("click", () =>
      openTodayItem(button.dataset.todayNextKind, button.dataset.todayNextId)
    );
  });
}

function getWeeklyReviewBounds() {
  const now = new Date();
  const start = new Date(now);
  const day = start.getDay();
  const daysFromMonday = day === 0 ? 6 : day - 1;
  start.setDate(start.getDate() - daysFromMonday);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

function getWeeklyReviewDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function isTimestampInCurrentReviewWeek(value) {
  const timestamp = getActivityTimestamp(value);
  if (!timestamp) return false;
  const { start, end } = getWeeklyReviewBounds();
  return timestamp >= start.getTime() && timestamp <= end.getTime();
}

function isDateKeyInCurrentReviewWeek(dateKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ""))) return false;
  const date = new Date(`${dateKey}T00:00:00`);
  const { start, end } = getWeeklyReviewBounds();
  return date >= start && date <= end;
}

function getWeeklyReviewUpcomingItems() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(today);
  end.setDate(end.getDate() + 7);
  end.setHours(23, 59, 59, 999);

  const taskItems = tasks
    .filter((task) => {
      if (task.completed || !task.dueDate) return false;
      const due = new Date(`${task.dueDate}T00:00:00`);
      return due >= today && due <= end;
    })
    .map((task) => ({
      kind: "task",
      id: String(task.id),
      date: task.dueDate,
      title: task.text || "Untitled task",
      meta: [
        task.workspace || "personal",
        task.project ? `◆ ${task.project}` : "",
        task.priority || "normal"
      ].filter(Boolean).join(" · ")
    }));

  const eventItems = events
    .filter((eventItem) => {
      if (!eventItem.date) return false;
      const date = new Date(`${eventItem.date}T00:00:00`);
      return date >= today && date <= end;
    })
    .map((eventItem) => ({
      kind: "event",
      id: String(eventItem.id),
      date: eventItem.date,
      title: eventItem.title || "Untitled event",
      meta: eventItem.workspace || "personal"
    }));

  return [...taskItems, ...eventItems]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 10);
}

function getWeeklyReviewAttentionTasks() {
  const today = getLocalDateKey();
  return tasks
    .filter((task) => !task.completed)
    .filter((task) =>
      (task.dueDate && task.dueDate < today) ||
      task.priority === "urgent"
    )
    .sort((a, b) => {
      const aOverdue = a.dueDate && a.dueDate < today ? 0 : 1;
      const bOverdue = b.dueDate && b.dueDate < today ? 0 : 1;
      if (aOverdue !== bOverdue) return aOverdue - bOverdue;
      if (a.priority !== b.priority) return a.priority === "urgent" ? -1 : 1;
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
    })
    .slice(0, 8);
}

function getWeeklyReviewComplianceItems() {
  return documents
    .filter((documentItem) => !documentItem.deleted_at)
    .map((documentItem) => ({
      documentItem,
      compliance: getDocumentCompliance(documentItem)
    }))
    .filter(({ compliance }) =>
      ["expired", "expiring"].includes(compliance.key)
    )
    .sort((a, b) => {
      const aDays = a.compliance.days ?? 999999;
      const bDays = b.compliance.days ?? 999999;
      return aDays - bDays;
    })
    .slice(0, 6);
}

function openWeeklyReviewTask(taskId) {
  const task = tasks.find((item) => String(item.id) === String(taskId));
  if (!task) return;
  openApp("tasks");
  openTaskModal(task, "tasks", task.id);
}

function openWeeklyReviewUpcomingItem(kind, id) {
  if (kind === "task") {
    openWeeklyReviewTask(id);
    return;
  }

  const eventItem = events.find((item) => String(item.id) === String(id));
  if (!eventItem) return;
  const date = new Date(`${eventItem.date}T00:00:00`);
  shownMonth = date.getMonth();
  shownYear = date.getFullYear();
  openApp("calendar");
  renderCalendar();
  renderEvents();
}

function renderWeeklyReview() {
  if (!$("weeklyReviewWinsList")) return;

  const { start, end } = getWeeklyReviewBounds();
  const rangeFormatter = new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric"
  });

  $("weeklyReviewRange").textContent =
    `${rangeFormatter.format(start)} – ${rangeFormatter.format(end)}`;

  const doneThisWeek = tasks
    .filter((task) =>
      task.completed && isTimestampInCurrentReviewWeek(task.updatedAt || task.createdAt)
    )
    .sort((a, b) =>
      String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))
    )
    .slice(0, 8);

  const attention = getWeeklyReviewAttentionTasks();
  const weekEvents = events.filter((eventItem) =>
    isDateKeyInCurrentReviewWeek(eventItem.date)
  );
  const activeProjects = getProjectRecords().filter((project) => project.open > 0);
  const activeGoals = getSortedGoals(goals.filter((goal) => !["completed", "paused"].includes(getGoalDerivedStatus(goal))));
  const upcoming = getWeeklyReviewUpcomingItems();

  const weekFinance = financeEntries.filter((entry) =>
    isTimestampInCurrentReviewWeek(entry.createdAt)
  );
  const weekIncome = weekFinance
    .filter((entry) => entry.type === "income")
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const weekExpenses = weekFinance
    .filter((entry) => entry.type === "expense")
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const weekNet = weekIncome - weekExpenses;

  $("weeklyReviewDoneCount").textContent = String(doneThisWeek.length);
  $("weeklyReviewOverdueCount").textContent = String(
    tasks.filter((task) =>
      !task.completed && task.dueDate && task.dueDate < getLocalDateKey()
    ).length
  );
  $("weeklyReviewEventCount").textContent = String(weekEvents.length);
  $("weeklyReviewFinanceNet").textContent = formatMoney(weekNet);
  $("weeklyReviewProjectCount").textContent = String(activeProjects.length);
  $("weeklyReviewGoalCount").textContent = String(activeGoals.length);

  $("weeklyReviewIncome").textContent = formatMoney(weekIncome);
  $("weeklyReviewExpenses").textContent = formatMoney(weekExpenses);
  $("weeklyReviewNet").textContent = formatMoney(weekNet);

  $("weeklyReviewWinsEmpty").hidden = doneThisWeek.length > 0;
  $("weeklyReviewWinsList").innerHTML = doneThisWeek.map((task) => `
    <button class="weekly-review-item win" type="button"
      data-weekly-review-task="${escapeHtml(String(task.id))}">
      <span class="weekly-review-item-icon">✓</span>
      <span class="weekly-review-item-copy">
        <strong>${escapeHtml(task.text || "Untitled task")}</strong>
        <small>
          ${escapeHtml(task.workspace || "personal")}
          ${task.project ? ` · ◆ ${escapeHtml(task.project)}` : ""}
        </small>
      </span>
      <span class="weekly-review-item-meta">${escapeHtml(formatTaskTimestamp(task.updatedAt || task.createdAt))}</span>
    </button>
  `).join("");

  $("weeklyReviewWinsList").querySelectorAll("[data-weekly-review-task]").forEach((button) => {
    button.addEventListener("click", () => openWeeklyReviewTask(button.dataset.weeklyReviewTask));
  });

  $("weeklyReviewAttentionEmpty").hidden = attention.length > 0;
  $("weeklyReviewAttentionList").innerHTML = attention.map((task) => {
    const due = getDueDateInfo(task);
    return `
      <button class="weekly-review-item attention" type="button"
        data-weekly-review-attention="${escapeHtml(String(task.id))}">
        <span class="weekly-review-item-icon">${task.priority === "urgent" ? "!" : "○"}</span>
        <span class="weekly-review-item-copy">
          <strong>${escapeHtml(task.text || "Untitled task")}</strong>
          <small>
            ${escapeHtml(task.workspace || "personal")}
            ${task.project ? ` · ◆ ${escapeHtml(task.project)}` : ""}
          </small>
        </span>
        <span class="weekly-review-item-meta">${escapeHtml(due?.label || "Urgent")}</span>
      </button>
    `;
  }).join("");

  $("weeklyReviewAttentionList").querySelectorAll("[data-weekly-review-attention]").forEach((button) => {
    button.addEventListener("click", () => openWeeklyReviewTask(button.dataset.weeklyReviewAttention));
  });

  $("weeklyReviewUpcomingEmpty").hidden = upcoming.length > 0;
  $("weeklyReviewUpcomingList").innerHTML = upcoming.map((item) => `
    <button class="weekly-review-item upcoming ${escapeHtml(item.kind)}" type="button"
      data-weekly-review-kind="${escapeHtml(item.kind)}"
      data-weekly-review-upcoming="${escapeHtml(item.id)}">
      <span class="weekly-review-item-icon">${item.kind === "task" ? "✓" : "◫"}</span>
      <span class="weekly-review-item-copy">
        <strong>${escapeHtml(item.title)}</strong>
        <small>${escapeHtml(item.meta || "")}</small>
      </span>
      <span class="weekly-review-item-meta">${escapeHtml(formatTaskDate(item.date))}</span>
    </button>
  `).join("");

  $("weeklyReviewUpcomingList").querySelectorAll("[data-weekly-review-upcoming]").forEach((button) => {
    button.addEventListener("click", () =>
      openWeeklyReviewUpcomingItem(
        button.dataset.weeklyReviewKind,
        button.dataset.weeklyReviewUpcoming
      )
    );
  });

  const projectPulse = [...activeProjects]
    .sort((a, b) => {
      if (a.urgent !== b.urgent) return b.urgent - a.urgent;
      if (a.open !== b.open) return b.open - a.open;
      return a.name.localeCompare(b.name);
    })
    .slice(0, 6);

  $("weeklyReviewProjectsEmpty").hidden = projectPulse.length > 0;
  $("weeklyReviewProjectList").innerHTML = projectPulse.map((project) => `
    <button class="weekly-review-item project" type="button"
      data-weekly-review-project="${escapeHtml(project.name)}">
      <span class="weekly-review-item-icon">◆</span>
      <span class="weekly-review-item-copy">
        <strong>${escapeHtml(project.name)}</strong>
        <small>${project.open} open · ${project.done} done${project.urgent ? ` · ${project.urgent} urgent` : ""}</small>
      </span>
      <span class="weekly-review-item-meta">${project.progress}%</span>
    </button>
  `).join("");

  $("weeklyReviewProjectList").querySelectorAll("[data-weekly-review-project]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedProjectName = button.dataset.weeklyReviewProject;
      openApp("projects");
      renderProjectsHub();
    });
  });

  const weeklyGoalPulse = activeGoals.slice(0, 6);
  $("weeklyReviewGoalsEmpty").hidden = weeklyGoalPulse.length > 0;
  $("weeklyReviewGoalList").innerHTML = weeklyGoalPulse.map((goal) => {
    const status = getGoalDerivedStatus(goal);
    const progress = getGoalProgress(goal);
    return `
      <button class="weekly-review-item goal ${escapeHtml(status)}" type="button"
        data-weekly-review-goal="${escapeHtml(goal.id)}">
        <span class="weekly-review-item-icon">◎</span>
        <span class="weekly-review-item-copy">
          <strong>${escapeHtml(goal.title)}</strong>
          <small>${escapeHtml(goal.workspace)} · ${escapeHtml(getGoalStatusLabel(status))}${goal.targetDate ? ` · ${escapeHtml(formatGoalTargetDate(goal.targetDate))}` : ""}</small>
        </span>
        <span class="weekly-review-item-meta">${progress}%</span>
      </button>
    `;
  }).join("");

  $("weeklyReviewGoalList").querySelectorAll("[data-weekly-review-goal]").forEach((button) => {
    button.addEventListener("click", () => {
      openApp("goals");
      selectGoal(button.dataset.weeklyReviewGoal);
    });
  });

  const workspaceRows = WORKSPACE_HUB_DEFINITIONS.map((definition) => ({
    definition,
    data: getWorkspaceHubData(definition.key)
  }));

  $("weeklyReviewWorkspaceList").innerHTML = workspaceRows.map(({ definition, data }) => `
    <button class="weekly-review-item workspace" type="button"
      data-weekly-review-workspace="${escapeHtml(definition.key)}">
      <span class="weekly-review-item-icon">${escapeHtml(definition.icon)}</span>
      <span class="weekly-review-item-copy">
        <strong>${escapeHtml(definition.label)}</strong>
        <small>${data.openTasks.length} open · ${data.urgentTasks.length} urgent · ${data.upcomingEvents.length} upcoming</small>
      </span>
      <span class="weekly-review-item-meta">${escapeHtml(formatMoney(data.balance))}</span>
    </button>
  `).join("");

  $("weeklyReviewWorkspaceList").querySelectorAll("[data-weekly-review-workspace]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedWorkspaceHub = button.dataset.weeklyReviewWorkspace;
      openApp("workspaces");
      renderWorkspacesHub();
    });
  });

  const complianceItems = getWeeklyReviewComplianceItems();
  $("weeklyReviewComplianceEmpty").hidden = complianceItems.length > 0;
  $("weeklyReviewComplianceList").innerHTML = complianceItems.map(({ documentItem, compliance }) => `
    <button class="weekly-review-item compliance ${escapeHtml(compliance.key)}" type="button"
      data-weekly-review-document="${escapeHtml(String(documentItem.id))}">
      <span class="weekly-review-item-icon">${compliance.key === "expired" ? "!" : "⌛"}</span>
      <span class="weekly-review-item-copy">
        <strong>${escapeHtml(documentItem.name || "Untitled file")}</strong>
        <small>${escapeHtml(documentItem.folder || "Documents")}</small>
      </span>
      <span class="weekly-review-item-meta">${escapeHtml(compliance.label)}</span>
    </button>
  `).join("");

  $("weeklyReviewComplianceList").querySelectorAll("[data-weekly-review-document]").forEach((button) => {
    button.addEventListener("click", () => {
      const documentItem = documents.find(
        (item) => String(item.id) === button.dataset.weeklyReviewDocument
      );
      if (!documentItem) return;
      openApp("documents");
      openDocumentPreview(documentItem);
    });
  });
}

const WORKSPACE_HUB_DEFINITIONS = [
  {
    key: "personal",
    label: "Personal",
    icon: "◇",
    description: "Personal plans, errands, goals, and everyday work."
  },
  {
    key: "pharmacy",
    label: "Pharmacy",
    icon: "Rx",
    description: "Pharmacy operations, compliance, inventory, and regulatory work."
  },
  {
    key: "clinic",
    label: "Clinic",
    icon: "+",
    description: "Clinic operations, patient-service tasks, and internal coordination."
  },
  {
    key: "sk",
    label: "SK",
    icon: "SK",
    description: "Barangay youth programs, reports, sessions, and activities."
  }
];

function getWorkspaceHubDefinition(workspaceKey) {
  return WORKSPACE_HUB_DEFINITIONS.find((item) => item.key === workspaceKey)
    || WORKSPACE_HUB_DEFINITIONS[0];
}

function getWorkspaceHubData(workspaceKey) {
  const workspaceTasks = tasks.filter((task) => task.workspace === workspaceKey);
  const openTasks = workspaceTasks.filter((task) => !task.completed);
  const urgentTasks = openTasks.filter((task) => task.priority === "urgent");

  const upcomingEvents = getUpcomingEvents()
    .filter((eventItem) => eventItem.workspace === workspaceKey);

  const projects = getProjectRecords()
    .filter((project) => project.workspaces.includes(workspaceKey));

  const activeProjects = projects.filter((project) => project.tasks.some(
    (task) => task.workspace === workspaceKey && !task.completed
  ));

  const workspaceGoals = goals.filter((goal) => goal.workspace === workspaceKey);
  const activeGoals = workspaceGoals.filter((goal) =>
    !["completed", "paused"].includes(getGoalDerivedStatus(goal))
  );

  const workspaceRoutines = routines.filter((routine) => routine.workspace === workspaceKey);
  const activeRoutines = workspaceRoutines.filter((routine) => routine.state === "active");

  const finance = financeEntries
    .filter((entry) => entry.workspace === workspaceKey)
    .sort((a, b) =>
      String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
    );

  const income = finance
    .filter((entry) => entry.type === "income")
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

  const expenses = finance
    .filter((entry) => entry.type === "expense")
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

  return {
    workspaceKey,
    tasks: workspaceTasks,
    openTasks,
    urgentTasks,
    upcomingEvents,
    projects,
    activeProjects,
    goals: workspaceGoals,
    activeGoals,
    routines: workspaceRoutines,
    activeRoutines,
    finance,
    balance: income - expenses
  };
}

function getWorkspaceTaskQueue(workspaceKey) {
  const data = getWorkspaceHubData(workspaceKey);
  const today = getLocalDateKey();
  const priorityRank = { urgent: 0, important: 1, normal: 2 };

  return [...data.openTasks]
    .sort((a, b) => {
      const aOverdue = a.dueDate && a.dueDate < today ? 0 : 1;
      const bOverdue = b.dueDate && b.dueDate < today ? 0 : 1;
      if (aOverdue !== bOverdue) return aOverdue - bOverdue;

      const aToday = a.dueDate === today ? 0 : 1;
      const bToday = b.dueDate === today ? 0 : 1;
      if (aToday !== bToday) return aToday - bToday;

      const priorityDiff =
        (priorityRank[a.priority] ?? 3) - (priorityRank[b.priority] ?? 3);
      if (priorityDiff) return priorityDiff;

      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;

      return String(b.updatedAt || b.createdAt || "")
        .localeCompare(String(a.updatedAt || a.createdAt || ""));
    })
    .slice(0, 6);
}

function getWorkspaceProjectRecords(workspaceKey) {
  return getProjectRecords()
    .filter((project) => project.workspaces.includes(workspaceKey))
    .map((project) => {
      const workspaceTasks = project.tasks.filter(
        (task) => task.workspace === workspaceKey
      );
      const total = workspaceTasks.length;
      const done = workspaceTasks.filter((task) => task.completed).length;
      const open = total - done;
      return {
        ...project,
        workspaceTotal: total,
        workspaceDone: done,
        workspaceOpen: open,
        workspaceProgress: total ? Math.round((done / total) * 100) : 0
      };
    })
    .filter((project) => project.workspaceTotal > 0)
    .sort((a, b) => {
      if (a.workspaceOpen !== b.workspaceOpen) return b.workspaceOpen - a.workspaceOpen;
      return a.name.localeCompare(b.name);
    });
}

function selectWorkspaceHub(workspaceKey) {
  const valid = WORKSPACE_HUB_DEFINITIONS.some((item) => item.key === workspaceKey);
  selectedWorkspaceHub = valid ? workspaceKey : "personal";
  renderWorkspacesHub();
}

function openWorkspaceTasks(workspaceKey = selectedWorkspaceHub) {
  activeFilter = "all";
  activeWorkspaceFilter = workspaceKey;
  activeTaskProjectFilter = "all";
  document.querySelectorAll(".filter").forEach((button) => {
    button.classList.toggle("active", button.dataset.filter === "all");
  });
  $("workspaceFilter").value = workspaceKey;
  openApp("tasks");
  renderTasks();
}

function createWorkspaceTask(workspaceKey = selectedWorkspaceHub) {
  openApp("tasks");
  openTaskModal({
    text: "",
    workspace: workspaceKey,
    priority: "normal",
    status: "todo"
  }, "workspace");
}

function createWorkspaceEvent(workspaceKey = selectedWorkspaceHub) {
  openApp("calendar");
  $("eventWorkspace").value = workspaceKey;
  $("eventTitle").value = "";
  $("eventDate").value = "";
  $("eventTitle").focus();
  showToast(`New ${getWorkspaceHubDefinition(workspaceKey).label} event`);
}

function openWorkspaceFinance(workspaceKey = selectedWorkspaceHub) {
  openApp("finance");
  $("financeWorkspace").value = workspaceKey;
}

function renderWorkspacesHub() {
  if (!$("workspaceHubCards")) return;

  const allData = WORKSPACE_HUB_DEFINITIONS.map((definition) => ({
    definition,
    data: getWorkspaceHubData(definition.key)
  }));

  const totalOpen = allData.reduce((sum, item) => sum + item.data.openTasks.length, 0);
  const totalUrgent = allData.reduce((sum, item) => sum + item.data.urgentTasks.length, 0);
  const totalUpcoming = allData.reduce((sum, item) => sum + item.data.upcomingEvents.length, 0);
  const totalProjects = getProjectRecords().filter((project) => project.open > 0).length;

  $("workspacesOpenTaskCount").textContent = String(totalOpen);
  $("workspacesUrgentCount").textContent = String(totalUrgent);
  $("workspacesUpcomingCount").textContent = String(totalUpcoming);
  $("workspacesProjectCount").textContent = String(totalProjects);

  if (!WORKSPACE_HUB_DEFINITIONS.some((item) => item.key === selectedWorkspaceHub)) {
    selectedWorkspaceHub = "personal";
  }

  $("workspaceHubCards").innerHTML = allData.map(({ definition, data }) => `
    <button class="workspace-hub-card ${definition.key === selectedWorkspaceHub ? "active" : ""}"
      type="button" data-workspace-hub="${escapeHtml(definition.key)}">
      <span class="workspace-hub-icon">${escapeHtml(definition.icon)}</span>
      <span class="workspace-hub-copy">
        <strong>${escapeHtml(definition.label)}</strong>
        <small>${data.openTasks.length} open · ${data.upcomingEvents.length} upcoming · ${data.activeRoutines.length} routines</small>
      </span>
      <span class="workspace-hub-badges">
        ${data.urgentTasks.length ? `<b>${data.urgentTasks.length} urgent</b>` : ""}
        <em>${formatMoney(data.balance)}</em>
      </span>
    </button>
  `).join("");

  $("workspaceHubCards").querySelectorAll("[data-workspace-hub]").forEach((button) => {
    button.addEventListener("click", () => selectWorkspaceHub(button.dataset.workspaceHub));
  });

  const definition = getWorkspaceHubDefinition(selectedWorkspaceHub);
  const data = getWorkspaceHubData(selectedWorkspaceHub);
  const taskQueue = getWorkspaceTaskQueue(selectedWorkspaceHub);
  const projects = getWorkspaceProjectRecords(selectedWorkspaceHub).slice(0, 5);
  const eventsForWorkspace = data.upcomingEvents.slice(0, 5);
  const financeForWorkspace = data.finance.slice(0, 5);

  $("workspaceDetailIcon").textContent = definition.icon;
  $("workspaceDetailEyebrow").textContent = `${definition.label.toUpperCase()} WORKSPACE`;
  $("workspaceDetailTitle").textContent = definition.label;
  $("workspaceDetailSubtitle").textContent = definition.description;
  $("workspaceDetailOpenTasks").textContent = String(data.openTasks.length);
  $("workspaceDetailUrgentTasks").textContent = String(data.urgentTasks.length);
  $("workspaceDetailUpcomingEvents").textContent = String(data.upcomingEvents.length);
  $("workspaceDetailActiveProjects").textContent = String(data.activeProjects.length);
  $("workspaceDetailActiveGoals").textContent = String(data.activeGoals.length);
  $("workspaceDetailBalance").textContent = formatMoney(data.balance);

  $("workspaceTaskEmpty").hidden = taskQueue.length > 0;
  $("workspaceTaskList").innerHTML = taskQueue.map((task) => `
    <button class="workspace-list-item task ${escapeHtml(task.priority || "normal")}"
      type="button" data-workspace-task-id="${escapeHtml(String(task.id))}">
      <span class="workspace-item-mark">${task.priority === "urgent" ? "!" : "✓"}</span>
      <span class="workspace-item-copy">
        <strong>${escapeHtml(task.text || "Untitled task")}</strong>
        <small>
          ${escapeHtml(getTaskStatusLabel(task.status))}
          ${task.project ? ` · ◆ ${escapeHtml(task.project)}` : ""}
          ${task.dueDate ? ` · ${escapeHtml(getDashboardTaskDueLabel(task))}` : ""}
        </small>
      </span>
      <span aria-hidden="true">→</span>
    </button>
  `).join("");

  $("workspaceTaskList").querySelectorAll("[data-workspace-task-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const task = tasks.find((item) => String(item.id) === button.dataset.workspaceTaskId);
      if (!task) return;
      openApp("tasks");
      openTaskModal(task, "tasks", task.id);
    });
  });

  $("workspaceEventEmpty").hidden = eventsForWorkspace.length > 0;
  $("workspaceEventList").innerHTML = eventsForWorkspace.map((eventItem) => `
    <button class="workspace-list-item event" type="button"
      data-workspace-event-id="${escapeHtml(String(eventItem.id))}">
      <span class="workspace-item-mark">◫</span>
      <span class="workspace-item-copy">
        <strong>${escapeHtml(eventItem.title || "Untitled event")}</strong>
        <small>${escapeHtml(formatTaskDate(eventItem.date))}</small>
      </span>
      <span aria-hidden="true">→</span>
    </button>
  `).join("");

  $("workspaceEventList").querySelectorAll("[data-workspace-event-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const eventItem = events.find(
        (item) => String(item.id) === button.dataset.workspaceEventId
      );
      if (!eventItem) return;
      const date = new Date(`${eventItem.date}T00:00:00`);
      shownMonth = date.getMonth();
      shownYear = date.getFullYear();
      openApp("calendar");
      renderCalendar();
      renderEvents();
    });
  });

  $("workspaceProjectEmpty").hidden = projects.length > 0;
  $("workspaceProjectList").innerHTML = projects.map((project) => `
    <button class="workspace-list-item project" type="button"
      data-workspace-project="${escapeHtml(project.name)}">
      <span class="workspace-item-mark">◆</span>
      <span class="workspace-item-copy">
        <strong>${escapeHtml(project.name)}</strong>
        <small>${project.workspaceOpen} open · ${project.workspaceProgress}% complete</small>
      </span>
      <span class="workspace-item-progress">${project.workspaceProgress}%</span>
    </button>
  `).join("");

  $("workspaceProjectList").querySelectorAll("[data-workspace-project]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedProjectName = button.dataset.workspaceProject;
      openApp("projects");
      renderProjectsHub();
    });
  });

  const goalsForWorkspace = getSortedGoals(data.activeGoals).slice(0, 5);
  $("workspaceGoalEmpty").hidden = goalsForWorkspace.length > 0;
  $("workspaceGoalList").innerHTML = goalsForWorkspace.map((goal) => {
    const status = getGoalDerivedStatus(goal);
    return `
      <button class="workspace-list-item goal ${escapeHtml(status)}" type="button"
        data-workspace-goal="${escapeHtml(goal.id)}">
        <span class="workspace-item-mark">◎</span>
        <span class="workspace-item-copy">
          <strong>${escapeHtml(goal.title)}</strong>
          <small>${escapeHtml(getGoalStatusLabel(status))} · ${getGoalProgress(goal)}%${goal.targetDate ? ` · ${escapeHtml(formatGoalTargetDate(goal.targetDate))}` : ""}</small>
        </span>
        <span class="workspace-item-progress">${getGoalProgress(goal)}%</span>
      </button>
    `;
  }).join("");

  $("workspaceGoalList").querySelectorAll("[data-workspace-goal]").forEach((button) => {
    button.addEventListener("click", () => {
      openApp("goals");
      selectGoal(button.dataset.workspaceGoal);
    });
  });

  const routinesForWorkspace = data.activeRoutines
    .sort((a, b) => a.title.localeCompare(b.title))
    .slice(0, 5);
  $("workspaceRoutineEmpty").hidden = routinesForWorkspace.length > 0;
  $("workspaceRoutineList").innerHTML = routinesForWorkspace.map((routine) => {
    const dueToday = isRoutineScheduledOnDate(routine, getLocalDateKey());
    const todayTask = dueToday ? getRoutineTaskForDate(routine, getLocalDateKey()) : null;
    return `
      <button class="workspace-list-item routine ${todayTask?.completed ? "done" : dueToday ? "due" : ""}" type="button"
        data-workspace-routine="${escapeHtml(routine.id)}">
        <span class="workspace-item-mark">↻</span>
        <span class="workspace-item-copy">
          <strong>${escapeHtml(routine.title)}</strong>
          <small>${escapeHtml(getRoutineScheduleLabel(routine))}${dueToday ? todayTask?.completed ? " · Done today" : " · Due today" : ""}</small>
        </span>
        <span class="workspace-item-progress">${getRoutineCurrentStreak(routine)}d</span>
      </button>
    `;
  }).join("");

  $("workspaceRoutineList").querySelectorAll("[data-workspace-routine]").forEach((button) => {
    button.addEventListener("click", () => {
      openApp("routines");
      selectRoutine(button.dataset.workspaceRoutine);
    });
  });

  $("workspaceFinanceEmpty").hidden = financeForWorkspace.length > 0;
  $("workspaceFinanceList").innerHTML = financeForWorkspace.map((entry) => `
    <button class="workspace-list-item finance ${escapeHtml(entry.type || "expense")}"
      type="button" data-workspace-finance-id="${escapeHtml(String(entry.id))}">
      <span class="workspace-item-mark">${entry.type === "income" ? "＋" : "−"}</span>
      <span class="workspace-item-copy">
        <strong>${escapeHtml(entry.description || "Finance entry")}</strong>
        <small>${escapeHtml(formatActivityTime(entry.createdAt))}</small>
      </span>
      <span class="workspace-item-amount">${escapeHtml(formatMoney(entry.amount))}</span>
    </button>
  `).join("");

  $("workspaceFinanceList").querySelectorAll("[data-workspace-finance-id]").forEach((button) => {
    button.addEventListener("click", () => openWorkspaceFinance(selectedWorkspaceHub));
  });
}

function getActivityTimestamp(value) {
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function getActivityItems() {
  const items = [];

  tasks.forEach((task) => {
    items.push({
      type: "tasks",
      id: String(task.id),
      icon: task.completed ? "✓" : "○",
      title: task.text || "Untitled task",
      action: task.updatedAt !== task.createdAt ? "Task updated" : "Task created",
      meta: [
        task.project ? `◆ ${task.project}` : "",
        task.workspace || "personal",
        task.priority || "normal"
      ].filter(Boolean).join(" · "),
      timestamp: task.updatedAt || task.createdAt || "",
      searchText: `${task.text || ""} ${task.details || ""} ${task.project || ""} ${(task.tags || []).join(" ")}`
    });
  });

  routines.forEach((routine) => {
    items.push({
      type: "routines",
      id: String(routine.id),
      icon: "↻",
      title: routine.title || "Untitled routine",
      action: routine.updatedAt !== routine.createdAt ? "Routine updated" : "Routine created",
      meta: [
        routine.workspace || "personal",
        getRoutineScheduleLabel(routine),
        routine.state
      ].filter(Boolean).join(" · "),
      timestamp: routine.updatedAt || routine.createdAt || "",
      searchText: `${routine.title || ""} ${routine.details || ""} ${routine.project || ""} ${getRoutineScheduleLabel(routine)}`
    });
  });

  goals.forEach((goal) => {
    const status = getGoalDerivedStatus(goal);
    items.push({
      type: "goals",
      id: String(goal.id),
      icon: "◎",
      title: goal.title || "Untitled goal",
      action: goal.updatedAt !== goal.createdAt ? "Goal updated" : "Goal created",
      meta: [
        goal.workspace || "personal",
        getGoalStatusLabel(status),
        `${getGoalProgress(goal)}%`
      ].filter(Boolean).join(" · "),
      timestamp: goal.updatedAt || goal.createdAt || "",
      searchText: `${goal.title || ""} ${goal.description || ""} ${(goal.linkedProjects || []).join(" ")} ${(goal.milestones || []).map((item) => item.text).join(" ")}`
    });
  });

  noteItems.forEach((note) => {
    items.push({
      type: "notes",
      id: String(note.id),
      icon: note.sticky ? "★" : "✎",
      title: note.title || "Untitled note",
      action: note.updatedAt !== note.createdAt ? "Note updated" : "Note created",
      meta: note.sticky ? "Sticky Note" : "Note",
      timestamp: note.updatedAt || note.createdAt || "",
      searchText: `${note.title || ""} ${note.content || ""}`
    });
  });

  journalEntries.forEach((entry) => {
    items.push({
      type: "journal",
      id: String(entry.id),
      icon: entry.favorite ? "★" : "☷",
      title: entry.title || "Untitled journal entry",
      action: entry.updated_at !== entry.created_at ? "Journal updated" : "Journal created",
      meta: [formatJournalDate(entry.entry_date), entry.favorite ? "Favorite" : ""]
        .filter(Boolean).join(" · "),
      timestamp: entry.updated_at || entry.created_at || "",
      searchText: `${entry.title || ""} ${entry.content || ""} ${(entry.tags || []).join(" ")}`
    });
  });

  ourSpacePlans.forEach((plan) => {
    items.push({
      type: "ourspace",
      id: String(plan.id),
      icon: getOurSpaceCategoryIcon(plan.category),
      title: plan.title || "Untitled plan",
      action: plan.status === "done"
        ? "Memory updated"
        : (plan.updated_at !== plan.created_at ? "Plan updated" : "Plan created"),
      meta: [plan.category || "Other", getOurSpaceStatusLabel(plan.status), plan.place || ""]
        .filter(Boolean).join(" · "),
      timestamp: plan.updated_at || plan.created_at || "",
      searchText: `${plan.title || ""} ${plan.notes || ""} ${plan.favorite_memory || ""} ${plan.place || ""}`
    });
  });

  documents
    .filter((documentItem) => !documentItem.deleted_at)
    .forEach((documentItem) => {
      items.push({
        type: "files",
        id: String(documentItem.id),
        icon: getDocumentTypeLabel(documentItem),
        title: documentItem.name || "Untitled file",
        action: documentItem.updated_at && documentItem.created_at &&
          documentItem.updated_at !== documentItem.created_at
          ? "File details updated"
          : "File added",
        meta: [
          documentItem.folder || "Documents",
          formatBytes(Number(documentItem.size_bytes || 0))
        ].filter(Boolean).join(" · "),
        timestamp: documentItem.updated_at || documentItem.created_at || "",
        searchText: `${documentItem.name || ""} ${documentItem.folder || ""} ${documentItem.details || ""} ${(getDocumentTags(documentItem) || []).join(" ")}`
      });
    });

  financeEntries.forEach((entry) => {
    items.push({
      type: "finance",
      id: String(entry.id),
      icon: entry.type === "income" ? "＋" : "−",
      title: entry.description || "Finance entry",
      action: entry.type === "income" ? "Income recorded" : "Expense recorded",
      meta: `${entry.workspace || "personal"} · ${formatMoney(entry.amount)}`,
      timestamp: entry.createdAt || "",
      searchText: `${entry.description || ""} ${entry.workspace || ""} ${entry.type || ""}`
    });
  });

  return items
    .filter((item) => getActivityTimestamp(item.timestamp) > 0)
    .sort((a, b) => getActivityTimestamp(b.timestamp) - getActivityTimestamp(a.timestamp));
}

function getFilteredActivityItems() {
  const now = Date.now();
  const query = activitySearchTerm.toLocaleLowerCase();

  return getActivityItems().filter((item) => {
    if (activityTypeFilter !== "all" && item.type !== activityTypeFilter) return false;

    if (activityRangeFilter !== "all") {
      const days = Number(activityRangeFilter) || 30;
      if (now - getActivityTimestamp(item.timestamp) > days * 86400000) return false;
    }

    if (query) {
      const haystack = `${item.title} ${item.action} ${item.meta} ${item.searchText}`
        .toLocaleLowerCase();
      if (!haystack.includes(query)) return false;
    }

    return true;
  });
}

function getActivityDayKey(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "unknown";
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function getActivityDayLabel(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Unknown date";

  const today = getLocalDateKey();
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = [
    yesterdayDate.getFullYear(),
    String(yesterdayDate.getMonth() + 1).padStart(2, "0"),
    String(yesterdayDate.getDate()).padStart(2, "0")
  ].join("-");

  const key = getActivityDayKey(timestamp);
  if (key === today) return "Today";
  if (key === yesterday) return "Yesterday";

  return date.toLocaleDateString("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric"
  });
}

function formatActivityTime(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  });
}

function getActivityTypeLabel(type) {
  return {
    tasks: "Task",
    goals: "Goal",
    routines: "Routine",
    notes: "Note",
    journal: "Journal",
    ourspace: "Our Space",
    files: "File",
    finance: "Finance"
  }[type] || "Activity";
}

function openActivityItem(type, id) {
  if (type === "tasks") {
    const task = tasks.find((item) => String(item.id) === String(id));
    openApp("tasks");
    if (task) openTaskModal(task, "tasks", task.id);
    return;
  }

  if (type === "routines") {
    openApp("routines");
    selectRoutine(id);
    return;
  }

  if (type === "goals") {
    openApp("goals");
    selectGoal(id);
    return;
  }

  if (type === "notes") {
    openApp("notes");
    selectNoteItem(id);
    return;
  }

  if (type === "journal") {
    openApp("journal");
    selectJournalEntry(id, { bypassDirtyCheck: true });
    return;
  }

  if (type === "ourspace") {
    openApp("ourspace");
    selectOurSpacePlan(id);
    return;
  }

  if (type === "files") {
    const documentItem = documents.find((item) => String(item.id) === String(id));
    openApp("documents");
    if (documentItem) openDocumentPreview(documentItem);
    return;
  }

  if (type === "finance") {
    openApp("finance");
  }
}

function renderActivityTimeline() {
  if (!$("activityTimeline")) return;

  const all = getActivityItems();
  const visible = getFilteredActivityItems();
  const now = Date.now();
  const todayKey = getLocalDateKey();

  $("activityTotalCount").textContent = String(all.length);
  $("activityTodayCount").textContent = String(
    all.filter((item) => getActivityDayKey(item.timestamp) === todayKey).length
  );
  $("activityWeekCount").textContent = String(
    all.filter((item) => now - getActivityTimestamp(item.timestamp) <= 7 * 86400000).length
  );
  $("activityMonthCount").textContent = String(
    all.filter((item) => now - getActivityTimestamp(item.timestamp) <= 30 * 86400000).length
  );

  $("activitySearchInput").value = activitySearchTerm;
  $("activityTypeFilter").value = activityTypeFilter;
  $("activityRangeFilter").value = activityRangeFilter;
  $("activityResultCount").textContent =
    `${visible.length} item${visible.length === 1 ? "" : "s"}`;

  $("activityHeading").textContent =
    activityRangeFilter === "all" ? "All activity" : `Last ${activityRangeFilter} days`;
  $("activityEyebrow").textContent =
    activityTypeFilter === "all"
      ? "RECENT ACTIVITY"
      : `${getActivityTypeLabel(activityTypeFilter).toUpperCase()} ACTIVITY`;

  $("activityEmptyState").hidden = visible.length > 0;

  const grouped = new Map();
  visible.forEach((item) => {
    const key = getActivityDayKey(item.timestamp);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item);
  });

  $("activityTimeline").innerHTML = Array.from(grouped.values()).map((items) => {
    const first = items[0];
    return `
      <section class="activity-day-group">
        <header class="activity-day-heading">
          <strong>${escapeHtml(getActivityDayLabel(first.timestamp))}</strong>
          <span>${items.length} item${items.length === 1 ? "" : "s"}</span>
        </header>

        <div class="activity-day-list">
          ${items.map((item) => `
            <button class="activity-item ${escapeHtml(item.type)}" type="button"
              data-activity-type="${escapeHtml(item.type)}"
              data-activity-id="${escapeHtml(item.id)}">
              <span class="activity-item-icon">${escapeHtml(item.icon)}</span>
              <span class="activity-item-copy">
                <small>${escapeHtml(item.action)} · ${escapeHtml(getActivityTypeLabel(item.type))}</small>
                <strong>${escapeHtml(item.title)}</strong>
                <p>${escapeHtml(item.meta || "Open item")}</p>
              </span>
              <span class="activity-item-time">${escapeHtml(formatActivityTime(item.timestamp))}</span>
            </button>
          `).join("")}
        </div>
      </section>
    `;
  }).join("");

  $("activityTimeline").querySelectorAll("[data-activity-type]").forEach((button) => {
    button.addEventListener("click", () => {
      openActivityItem(button.dataset.activityType, button.dataset.activityId);
    });
  });
}

function getProjectRecords() {
  const grouped = new Map();

  tasks.forEach((task) => {
    const name = String(task.project || "").trim();
    if (!name) return;

    const key = name.toLocaleLowerCase();
    if (!grouped.has(key)) grouped.set(key, { key, name, tasks: [] });
    grouped.get(key).tasks.push(task);
  });

  return Array.from(grouped.values()).map((project) => {
    const total = project.tasks.length;
    const done = project.tasks.filter((task) => task.completed).length;
    const open = total - done;
    const urgent = project.tasks.filter(
      (task) => !task.completed && task.priority === "urgent"
    ).length;
    const workspaces = Array.from(new Set(
      project.tasks.map((task) => task.workspace || "personal")
    ));
    const dueTasks = project.tasks
      .filter((task) => !task.completed && task.dueDate)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const updatedValues = project.tasks
      .map((task) => task.updatedAt || task.createdAt || "")
      .sort();

    return {
      ...project,
      total,
      done,
      open,
      urgent,
      progress: total ? Math.round((done / total) * 100) : 0,
      workspaces,
      nextDue: dueTasks[0]?.dueDate || "",
      updatedAt: updatedValues.length ? updatedValues[updatedValues.length - 1] : ""
    };
  }).sort((a, b) => {
    if (a.open !== b.open) return b.open - a.open;
    return String(b.updatedAt).localeCompare(String(a.updatedAt));
  });
}

function getFilteredProjectRecords() {
  const query = projectsSearchTerm.toLocaleLowerCase();
  return getProjectRecords().filter((project) => {
    const matchesWorkspace =
      projectsWorkspaceFilter === "all" ||
      project.workspaces.includes(projectsWorkspaceFilter);
    const matchesSearch =
      !query ||
      project.name.toLocaleLowerCase().includes(query) ||
      project.tasks.some((task) =>
        `${task.text} ${task.details || ""}`.toLocaleLowerCase().includes(query)
      );
    return matchesWorkspace && matchesSearch;
  });
}

function getProjectRecordByName(name) {
  return getProjectRecords().find((project) => project.name === name) || null;
}

function ensureSelectedProject(projects) {
  if (selectedProjectName && projects.some((project) => project.name === selectedProjectName)) return;
  selectedProjectName = projects[0]?.name || "";
}

function renderProjectDetail() {
  const empty = $("projectDetailEmpty");
  const content = $("projectDetailContent");
  if (!empty || !content) return;

  const project = getProjectRecordByName(selectedProjectName);
  empty.classList.toggle("hidden", Boolean(project));
  content.classList.toggle("hidden", !project);
  if (!project) return;

  $("projectDetailTitle").textContent = project.name;
  $("projectDetailMeta").textContent =
    `${project.total} task${project.total === 1 ? "" : "s"} · ` +
    project.workspaces.map((item) => item.charAt(0).toUpperCase() + item.slice(1)).join(", ");

  $("projectProgressLabel").textContent = `${project.progress}% complete`;
  $("projectProgressTaskLabel").textContent = `${project.done} of ${project.total} tasks complete`;
  $("projectProgressBar").style.width = `${project.progress}%`;

  $("projectDetailOpen").textContent = String(project.open);
  $("projectDetailUrgent").textContent = String(project.urgent);
  $("projectDetailDue").textContent = project.nextDue ? formatTaskDate(project.nextDue) : "—";
  $("projectDetailWorkspace").textContent =
    project.workspaces.length === 1
      ? project.workspaces[0].charAt(0).toUpperCase() + project.workspaces[0].slice(1)
      : "Mixed";

  const ordered = [...project.tasks].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    const rank = { urgent: 0, important: 1, normal: 2 };
    const priorityDifference = (rank[a.priority] ?? 3) - (rank[b.priority] ?? 3);
    if (priorityDifference) return priorityDifference;
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
  });

  $("projectTasksEmpty").hidden = ordered.length > 0;
  $("projectTaskList").innerHTML = ordered.map((task) => {
    const due = getDueDateInfo(task);
    return `
      <button class="project-task-row ${task.completed ? "done" : ""} ${escapeHtml(task.priority || "normal")}"
        type="button" data-project-task-id="${escapeHtml(String(task.id))}">
        <span class="project-task-check">${task.completed ? "✓" : "○"}</span>
        <span class="project-task-copy">
          <strong>${escapeHtml(task.text || "Untitled task")}</strong>
          <span>
            ${escapeHtml(getTaskStatusLabel(task.status))}
            <em>·</em>${escapeHtml(task.workspace || "personal")}
            ${due ? `<em>·</em><b>${escapeHtml(due.label)}</b>` : ""}
          </span>
        </span>
        <span aria-hidden="true">→</span>
      </button>
    `;
  }).join("");

  $("projectTaskList").querySelectorAll("[data-project-task-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const task = tasks.find((item) => String(item.id) === button.dataset.projectTaskId);
      if (!task) return;
      openApp("tasks");
      openTaskModal(task, "tasks", task.id);
    });
  });
}

function renderProjectsHub() {
  if (!$("projectsList")) return;

  const all = getProjectRecords();
  const visible = getFilteredProjectRecords();
  ensureSelectedProject(visible);

  const openTasks = all.reduce((sum, project) => sum + project.open, 0);
  const totalTasks = all.reduce((sum, project) => sum + project.total, 0);
  const doneTasks = all.reduce((sum, project) => sum + project.done, 0);

  $("projectsTotalCount").textContent = String(all.length);
  $("projectsActiveCount").textContent = String(all.filter((project) => project.open > 0).length);
  $("projectsOpenTaskCount").textContent = String(openTasks);
  $("projectsProgressCount").textContent =
    `${totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0}%`;
  $("projectsVisibleCount").textContent = String(visible.length);
  $("projectsSearchInput").value = projectsSearchTerm;
  $("projectsWorkspaceFilter").value = projectsWorkspaceFilter;
  $("projectsEmptyState").hidden = visible.length > 0;

  $("projectsList").innerHTML = visible.map((project) => `
    <button class="project-card ${project.name === selectedProjectName ? "active" : ""}"
      type="button" data-project-name="${escapeHtml(project.name)}">
      <span class="project-card-icon">◆</span>
      <span class="project-card-copy">
        <strong>${escapeHtml(project.name)}</strong>
        <small>${project.open} open · ${project.total} total</small>
        <span class="project-card-progress"><i style="width:${project.progress}%"></i></span>
      </span>
      <span class="project-card-percent">${project.progress}%</span>
    </button>
  `).join("");

  $("projectsList").querySelectorAll("[data-project-name]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedProjectName = button.dataset.projectName;
      renderProjectsHub();
    });
  });

  renderProjectDetail();
}

function startProjectWithFirstTask(name, workspace = "personal") {
  const cleanName = String(name || "").trim().replace(/\s+/g, " ").slice(0, 80);
  if (!cleanName) {
    showToast("Enter a project name");
    $("projectCreateName")?.focus();
    return;
  }

  openTaskModal({
    text: "",
    workspace,
    priority: "normal",
    project: cleanName,
    status: "todo"
  }, "project");

  showToast(`Add the first task for ${cleanName}`);
}

function renameSelectedProject() {
  const project = getProjectRecordByName(selectedProjectName);
  if (!project) return;

  const nextName = window.prompt("Rename project", project.name);
  if (nextName === null) return;

  const cleanName = String(nextName).trim().replace(/\s+/g, " ").slice(0, 80);
  if (!cleanName || cleanName === project.name) return;

  tasks.forEach((task) => {
    if (task.project === project.name) {
      task.project = cleanName;
      task.updatedAt = new Date().toISOString();
    }
  });

  goals.forEach((goal) => {
    if (!goal.linkedProjects.includes(project.name)) return;
    goal.linkedProjects = goal.linkedProjects.map((name) =>
      name === project.name ? cleanName : name
    );
    goal.updatedAt = new Date().toISOString();
  });

  selectedProjectName = cleanName;
  persistGoals();
  renderAll();
  showToast("Project renamed");
}

function clearSelectedProject() {
  const project = getProjectRecordByName(selectedProjectName);
  if (!project) return;

  if (!window.confirm(
    `Remove the project “${project.name}” from its ${project.total} task${project.total === 1 ? "" : "s"}? The tasks will not be deleted.`
  )) return;

  tasks.forEach((task) => {
    if (task.project === project.name) {
      task.project = "";
      task.updatedAt = new Date().toISOString();
    }
  });

  goals.forEach((goal) => {
    if (!goal.linkedProjects.includes(project.name)) return;
    goal.linkedProjects = goal.linkedProjects.filter((name) => name !== project.name);
    goal.updatedAt = new Date().toISOString();
  });

  selectedProjectName = "";
  persistGoals();
  renderAll();
  showToast("Project cleared; tasks were kept");
}

function getFavoriteHubItems() {
  const items = [];

  tasks
    .filter((task) =>
      !task.completed &&
      (task.priority === "urgent" || task.priority === "important")
    )
    .forEach((task) => {
      items.push({
        type: "tasks",
        id: String(task.id),
        icon: task.priority === "urgent" ? "!" : "✓",
        title: task.text || "Untitled task",
        preview: [
          task.priority === "urgent" ? "Urgent" : "Important",
          task.workspace || "Personal",
          task.dueDate ? getDashboardTaskDueLabel(task) : ""
        ].filter(Boolean).join(" · "),
        updatedAt: task.updatedAt || task.createdAt || "",
        accent: task.priority === "urgent" ? "danger" : "warning"
      });
    });

  noteItems
    .filter((note) => note.sticky)
    .forEach((note) => {
      items.push({
        type: "notes",
        id: String(note.id),
        icon: "✎",
        title: note.title || "Untitled note",
        preview: getNotePreview(note, 180),
        updatedAt: note.updatedAt || note.createdAt || "",
        accent: "warning"
      });
    });

  journalEntries
    .filter((entry) => entry.favorite)
    .forEach((entry) => {
      items.push({
        type: "journal",
        id: String(entry.id),
        icon: "☷",
        title: entry.title || "Untitled entry",
        preview: [
          formatJournalDate(entry.entry_date),
          String(entry.content || "").replace(/\s+/g, " ").trim().slice(0, 150)
        ].filter(Boolean).join(" · "),
        updatedAt: entry.updated_at || entry.created_at || "",
        accent: "accent"
      });
    });

  ourSpacePlans
    .filter((plan) => plan.favorite)
    .forEach((plan) => {
      const meta = [
        plan.category,
        plan.status === "done" ? "Archived memory" : getOurSpaceStatusLabel(plan.status),
        plan.target_date ? formatOurSpaceDate(plan.target_date) : ""
      ].filter(Boolean).join(" · ");

      items.push({
        type: "ourspace",
        id: String(plan.id),
        icon: getOurSpaceCategoryIcon(plan.category),
        title: plan.title || "Untitled plan",
        preview: meta,
        updatedAt: plan.updated_at || plan.created_at || "",
        accent: "love"
      });
    });

  documents
    .filter((documentItem) => !documentItem.deleted_at && documentItem.is_favorite)
    .forEach((documentItem) => {
      items.push({
        type: "files",
        id: String(documentItem.id),
        icon: getDocumentTypeLabel(documentItem),
        title: documentItem.name || "Untitled file",
        preview: [
          documentItem.folder || "Documents",
          formatBytes(Number(documentItem.size_bytes || 0)),
          getDocumentCompliance(documentItem).label
        ].filter(Boolean).join(" · "),
        updatedAt: documentItem.updated_at || documentItem.created_at || "",
        accent: "accent"
      });
    });

  return items.sort((a, b) =>
    String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))
  );
}

function getFilteredFavoriteHubItems() {
  const query = favoritesSearchTerm.toLocaleLowerCase();
  return getFavoriteHubItems().filter((item) => {
    if (favoritesFilter !== "all" && item.type !== favoritesFilter) return false;
    if (!query) return true;
    return `${item.title} ${item.preview}`.toLocaleLowerCase().includes(query);
  });
}

function getFavoritesFilterLabel(filter) {
  return {
    all: "ALL FAVORITES",
    tasks: "IMPORTANT TASKS",
    notes: "STICKY NOTES",
    journal: "FAVORITE JOURNAL",
    ourspace: "OUR SPACE FAVORITES",
    files: "FAVORITE FILES"
  }[filter] || "FAVORITES";
}

function getFavoritesHeading(filter) {
  return {
    all: "Pinned across The Box",
    tasks: "Important work",
    notes: "Sticky notes",
    journal: "Journal favorites",
    ourspace: "Plans worth keeping close",
    files: "Favorite Vault files"
  }[filter] || "Favorites";
}

function openFavoriteHubItem(type, id) {
  if (type === "tasks") {
    const task = tasks.find((item) => String(item.id) === String(id));
    openApp("tasks");
    if (task) openTaskModal(task, "tasks", task.id);
    return;
  }

  if (type === "notes") {
    openApp("notes");
    selectNoteItem(id);
    return;
  }

  if (type === "journal") {
    openApp("journal");
    selectJournalEntry(id, { bypassDirtyCheck: true });
    return;
  }

  if (type === "ourspace") {
    openApp("ourspace");
    selectOurSpacePlan(id);
    return;
  }

  if (type === "files") {
    const documentItem = documents.find((item) => String(item.id) === String(id));
    openApp("documents");
    if (documentItem) openDocumentPreview(documentItem);
  }
}

function renderFavoritesHub() {
  const list = $("favoritesList");
  if (!list) return;

  const all = getFavoriteHubItems();
  const visible = getFilteredFavoriteHubItems();

  const notesCount = all.filter((item) => item.type === "notes").length;
  const journalCount = all.filter((item) => item.type === "journal").length;
  const ourSpaceCount = all.filter((item) => item.type === "ourspace").length;
  const filesCount = all.filter((item) => item.type === "files").length;

  $("favoritesTotalCount").textContent = String(all.length);
  $("favoritesNotesCount").textContent = String(notesCount);
  $("favoritesJournalCount").textContent = String(journalCount);
  $("favoritesOurSpaceCount").textContent = String(ourSpaceCount);
  $("favoritesFilesCount").textContent = String(filesCount);

  $("favoritesSearchInput").value = favoritesSearchTerm;
  $("favoritesEyebrow").textContent = getFavoritesFilterLabel(favoritesFilter);
  $("favoritesHeading").textContent = getFavoritesHeading(favoritesFilter);
  $("favoritesResultCount").textContent =
    `${visible.length} item${visible.length === 1 ? "" : "s"}`;
  $("favoritesEmptyState").hidden = visible.length > 0;

  document.querySelectorAll("[data-favorites-filter]").forEach((button) => {
    const active = button.dataset.favoritesFilter === favoritesFilter;
    button.classList.toggle("active", active);
  });

  list.innerHTML = visible.map((item) => `
    <button class="favorite-hub-card ${escapeHtml(item.type)} ${escapeHtml(item.accent)}"
      type="button"
      data-favorite-type="${escapeHtml(item.type)}"
      data-favorite-id="${escapeHtml(item.id)}">
      <span class="favorite-hub-icon">${escapeHtml(item.icon)}</span>
      <span class="favorite-hub-copy">
        <small>${escapeHtml(getFavoritesFilterLabel(item.type).replace(/S$/, ""))}</small>
        <strong>${escapeHtml(item.title)}</strong>
        <p>${escapeHtml(item.preview || "Open item")}</p>
      </span>
      <span class="favorite-hub-arrow" aria-hidden="true">→</span>
    </button>
  `).join("");

  list.querySelectorAll("[data-favorite-type]").forEach((button) => {
    button.addEventListener("click", () => {
      openFavoriteHubItem(
        button.dataset.favoriteType,
        button.dataset.favoriteId
      );
    });
  });
}

function renderAll() {
  renderTasks();
  renderDashboard();
  renderCalendar();
  renderEvents();
  renderFinance();
  renderDocuments();
  renderBackupCenter();
  renderTemplateCenter();
  renderReminderCenter();
  renderNotesCenter();
  renderFavoritesHub();
  renderProjectsHub();
  renderGoalsHub();
  renderRoutinesHub();
  renderActivityTimeline();
  renderWorkspacesHub();
  renderWeeklyReview();
  renderTodayPlanner();
  renderAgenda();
  if (isCommandPaletteOpen()) renderCommandPalette();
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
    const lines = getSelectedNoteLinesForTasks();

    if (!lines.length) {
      response.textContent = "Open a note and write one possible task per line, then try again.";
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

document.querySelectorAll("[data-favorites-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    favoritesFilter = button.dataset.favoritesFilter || "all";
    renderFavoritesHub();
  });
});

$("favoritesSearchInput").addEventListener("input", (event) => {
  favoritesSearchTerm = event.target.value.trim();
  renderFavoritesHub();
});

$("projectsSearchInput").addEventListener("input", (event) => {
  projectsSearchTerm = event.target.value.trim();
  renderProjectsHub();
});

$("projectsWorkspaceFilter").addEventListener("change", (event) => {
  projectsWorkspaceFilter = event.target.value;
  renderProjectsHub();
});

$("activitySearchInput").addEventListener("input", (event) => {
  activitySearchTerm = event.target.value.trim();
  renderActivityTimeline();
});

$("activityTypeFilter").addEventListener("change", (event) => {
  activityTypeFilter = event.target.value;
  renderActivityTimeline();
});

$("activityRangeFilter").addEventListener("change", (event) => {
  activityRangeFilter = event.target.value;
  renderActivityTimeline();
});

$("workspaceNewTaskButton").addEventListener("click", () => {
  createWorkspaceTask(selectedWorkspaceHub);
});

$("workspaceNewEventButton").addEventListener("click", () => {
  createWorkspaceEvent(selectedWorkspaceHub);
});

$("workspaceOpenTasksButton").addEventListener("click", () => {
  openWorkspaceTasks(selectedWorkspaceHub);
});

$("workspaceViewAllTasksButton").addEventListener("click", () => {
  openWorkspaceTasks(selectedWorkspaceHub);
});

$("workspaceOpenFinanceButton").addEventListener("click", () => {
  openWorkspaceFinance(selectedWorkspaceHub);
});

$("workspaceViewFinanceButton").addEventListener("click", () => {
  openWorkspaceFinance(selectedWorkspaceHub);
});

$("workspaceViewCalendarButton").addEventListener("click", () => {
  openApp("calendar");
});

$("workspaceViewProjectsButton").addEventListener("click", () => {
  projectsWorkspaceFilter = selectedWorkspaceHub;
  openApp("projects");
  renderProjectsHub();
});

$("weeklyReviewOpenTasksButton").addEventListener("click", () => openApp("tasks"));
$("weeklyReviewOpenCalendarButton").addEventListener("click", () => openApp("calendar"));
$("weeklyReviewQuickCaptureButton").addEventListener("click", () => openQuickCapture());
$("weeklyReviewOpenActivityButton").addEventListener("click", () => openApp("activity"));

$("weeklyReviewViewDoneTasksButton").addEventListener("click", () => {
  activeFilter = "done";
  document.querySelectorAll(".filter").forEach((button) => {
    button.classList.toggle("active", button.dataset.filter === "done");
  });
  openApp("tasks");
  renderTasks();
});

$("weeklyReviewViewAttentionButton").addEventListener("click", () => {
  activeFilter = "open";
  document.querySelectorAll(".filter").forEach((button) => {
    button.classList.toggle("active", button.dataset.filter === "open");
  });
  openApp("tasks");
  renderTasks();
});

$("weeklyReviewViewCalendarButton").addEventListener("click", () => openApp("calendar"));
$("weeklyReviewViewProjectsButton").addEventListener("click", () => openApp("projects"));
$("weeklyReviewViewWorkspacesButton").addEventListener("click", () => openApp("workspaces"));
$("weeklyReviewViewFinanceButton").addEventListener("click", () => openApp("finance"));
$("weeklyReviewViewVaultButton").addEventListener("click", () => openApp("documents"));

$("todayQuickCaptureButton").addEventListener("click", () => openQuickCapture());

$("todayNewTaskButton").addEventListener("click", () => {
  openApp("tasks");
  openTaskModal({
    text: "",
    workspace: "personal",
    priority: "normal",
    dueDate: getLocalDateKey(),
    status: "todo"
  }, "today");
});

$("todayNewEventButton").addEventListener("click", () => {
  openApp("calendar");
  selectCalendarDate(getLocalDateKey());
});

$("todayFocusButton").addEventListener("click", () => openApp("focus"));
$("todayOpenTasksButton").addEventListener("click", () => openApp("tasks"));
$("todayOpenCalendarButton").addEventListener("click", () => openApp("calendar"));

$("todayOpenOverdueButton").addEventListener("click", () => {
  activeFilter = "open";
  document.querySelectorAll(".filter").forEach((button) => {
    button.classList.toggle("active", button.dataset.filter === "open");
  });
  openApp("tasks");
  renderTasks();
});

$("todayOpenWorkspacesButton").addEventListener("click", () => openApp("workspaces"));
$("todayOpenActivityButton").addEventListener("click", () => openApp("activity"));
$("todayOpenWeeklyReviewButton").addEventListener("click", () => openApp("weeklyreview"));

$("todayJournalButton").addEventListener("click", () => {
  openApp("journal");
  showJournalToday();
});

$("todayJournalCard").addEventListener("click", () => {
  openApp("journal");
  showJournalToday();
});

$("todayOurSpaceButton").addEventListener("click", () => openApp("ourspace"));

$("todayOurSpaceCard").addEventListener("click", () => {
  const planId = $("todayOurSpaceCard").dataset.planId;
  openApp("ourspace");
  if (planId) selectOurSpacePlan(planId);
});

$("agendaSearchInput").addEventListener("input", (event) => {
  agendaSearchTerm = event.target.value.trim();
  renderAgenda();
});

$("agendaTypeFilter").addEventListener("change", (event) => {
  agendaTypeFilter = event.target.value;
  renderAgenda();
});

$("agendaWorkspaceFilter").addEventListener("change", (event) => {
  agendaWorkspaceFilter = event.target.value;
  renderAgenda();
});

$("agendaRangeFilter").addEventListener("change", (event) => {
  agendaRangeDays = Number(event.target.value) || 14;
  renderAgenda();
});

$("agendaTodayButton").addEventListener("click", () => {
  agendaTypeFilter = "all";
  agendaWorkspaceFilter = "all";
  agendaSearchTerm = "";
  renderAgenda();
  const todayGroup = document.querySelector(`[data-agenda-group="${getLocalDateKey()}"]`);
  if (todayGroup) {
    todayGroup.scrollIntoView({ behavior: "smooth", block: "start" });
  } else {
    showToast("No dated items today");
  }
});

$("agendaQuickCaptureButton").addEventListener("click", () => openQuickCapture());
$("agendaCalendarButton").addEventListener("click", () => openApp("calendar"));

$("routinesSearchInput").addEventListener("input", (event) => {
  routineSearchTerm = event.target.value.trim();
  renderRoutinesList();
});

$("routinesWorkspaceFilter").addEventListener("change", (event) => {
  routineWorkspaceFilter = event.target.value;
  renderRoutinesList();
});

$("routinesStateFilter").addEventListener("change", (event) => {
  routineStateFilter = event.target.value;
  renderRoutinesList();
});

$("newRoutineButton").addEventListener("click", resetRoutineEditor);
$("resetRoutineButton").addEventListener("click", resetRoutineEditor);
$("deleteRoutineButton").addEventListener("click", deleteSelectedRoutine);

$("routineScheduleType").addEventListener("change", (event) => {
  const currentDays = getRoutineDayControlValues();
  setRoutineDayControls(event.target.value, currentDays);
});

document.querySelectorAll("[data-routine-day]").forEach((input) => {
  input.addEventListener("change", () => {
    if ($("routineScheduleType").value === "weekly" && input.checked) {
      document.querySelectorAll("[data-routine-day]").forEach((other) => {
        if (other !== input) other.checked = false;
      });
    }
  });
});

$("routineForm").addEventListener("submit", (event) => {
  event.preventDefault();
  saveRoutineFromEditor();
});

$("refreshRoutinesTodayButton").addEventListener("click", () => {
  ensureScheduledRoutineTasks({ silent: false });
  renderAll();
});

$("routineOpenTodayTaskButton").addEventListener("click", openSelectedRoutineTodayTask);
$("routineCompleteTodayButton").addEventListener("click", completeSelectedRoutineToday);

$("todayOpenRoutinesButton").addEventListener("click", () => openApp("routines"));
$("weeklyReviewViewRoutinesButton").addEventListener("click", () => openApp("routines"));

$("workspaceViewRoutinesButton").addEventListener("click", () => {
  routineWorkspaceFilter = selectedWorkspaceHub;
  openApp("routines");
  renderRoutinesHub();
});

$("goalsSearchInput").addEventListener("input", (event) => {
  goalSearchTerm = event.target.value.trim();
  renderGoalsList();
});

$("goalsWorkspaceFilter").addEventListener("change", (event) => {
  goalWorkspaceFilter = event.target.value;
  renderGoalsList();
});

$("goalsStatusFilter").addEventListener("change", (event) => {
  goalStatusFilter = event.target.value;
  renderGoalsList();
});

$("newGoalButton").addEventListener("click", resetGoalEditor);
$("resetGoalButton").addEventListener("click", resetGoalEditor);
$("deleteGoalButton").addEventListener("click", deleteSelectedGoal);

$("goalTaskSearchInput").addEventListener("input", (event) => {
  goalTaskPickerSearch = event.target.value.trim();
  renderGoalTaskPicker();
});

["goalWorkspace", "goalTargetDate", "goalBaseStatus", "goalPriority"].forEach((id) => {
  $(id).addEventListener("change", renderGoalEditorProgress);
});
["goalTitle", "goalDescription"].forEach((id) => {
  $(id).addEventListener("input", renderGoalEditorProgress);
});

$("addGoalMilestoneButton").addEventListener("click", addGoalMilestoneFromControls);
$("goalMilestoneText").addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  addGoalMilestoneFromControls();
});

$("goalForm").addEventListener("submit", (event) => {
  event.preventDefault();
  saveGoalFromEditor();
});

$("todayOpenGoalsButton").addEventListener("click", () => openApp("goals"));
$("todayGoalCard").addEventListener("click", () => {
  const goalId = $("todayGoalCard").dataset.goalId;
  openApp("goals");
  if (goalId) selectGoal(goalId);
});

$("weeklyReviewViewGoalsButton").addEventListener("click", () => openApp("goals"));

$("workspaceViewGoalsButton").addEventListener("click", () => {
  goalWorkspaceFilter = selectedWorkspaceHub;
  openApp("goals");
  renderGoalsHub();
});

$("projectCreateForm").addEventListener("submit", (event) => {
  event.preventDefault();
  startProjectWithFirstTask(
    $("projectCreateName").value,
    $("projectCreateWorkspace").value
  );
});

$("projectAddTaskButton").addEventListener("click", () => {
  const project = getProjectRecordByName(selectedProjectName);
  if (!project) return;
  startProjectWithFirstTask(project.name, project.workspaces[0] || "personal");
});

$("projectRenameButton").addEventListener("click", renameSelectedProject);
$("projectRemoveButton").addEventListener("click", clearSelectedProject);

$("projectOpenTasksButton").addEventListener("click", () => {
  if (!selectedProjectName) return;
  activeTaskProjectFilter = selectedProjectName;
  openApp("tasks");
  renderTasks();
});

$("launcherButton").addEventListener("click", toggleMobileMoreMenu);
$("mobileMoreButton").addEventListener("click", toggleMobileMoreMenu);
updateMobileNavigation(mobileActiveApp);

$("closeLauncherButton").addEventListener("click", closeLauncher);

document.querySelectorAll("[data-view-mode-option]").forEach((button) => {
  button.addEventListener("click", () => {
    setViewModePreference(button.dataset.viewModeOption);
  });
});

$("fullscreenButton").addEventListener("click", toggleBoxFullscreen);
$("launcherFullscreenButton").addEventListener("click", toggleBoxFullscreen);
$("fullscreenFallbackExitButton").addEventListener("click", exitBoxFullscreen);

document.addEventListener("fullscreenchange", handleFullscreenChange);
document.addEventListener("webkitfullscreenchange", handleFullscreenChange);

$("themeButton").addEventListener("click", () => {
  document.body.classList.toggle("light-theme");
  localStorage.setItem(
    STORAGE.theme,
    document.body.classList.contains("light-theme") ? "light" : "dark"
  );
  restoreTheme();
});

$("mobileCommandButton").addEventListener("click", () => openCommandPalette());
$("closeCommandPaletteButton").addEventListener("click", closeCommandPalette);

$("commandPaletteInput").addEventListener("input", () => {
  commandPaletteActiveIndex = 0;
  renderCommandPalette();
});

$("commandPaletteOverlay").addEventListener("pointerdown", (event) => {
  if (event.target === $("commandPaletteOverlay")) closeCommandPalette();
});

$("quickCaptureButton").addEventListener("click", () => openQuickCapture());
$("mobileQuickCaptureButton").addEventListener("click", () => openQuickCapture());
$("closeQuickCaptureButton").addEventListener("click", closeQuickCapture);
$("cancelQuickCaptureButton").addEventListener("click", closeQuickCapture);

document.querySelectorAll("[data-capture-destination]").forEach((button) => {
  button.addEventListener("click", () => {
    setQuickCaptureDestination(button.dataset.captureDestination);
  });
});

$("quickCaptureForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("saveQuickCaptureButton").disabled = true;
  try {
    const saved = await saveQuickCapture();
    if (saved) closeQuickCapture();
  } finally {
    $("saveQuickCaptureButton").disabled = false;
  }
});

$("quickCaptureOverlay").addEventListener("pointerdown", (event) => {
  if (event.target === $("quickCaptureOverlay")) closeQuickCapture();
});

document.addEventListener("keydown", (event) => {
  const commandShortcut =
    (event.ctrlKey || event.metaKey) &&
    !event.shiftKey &&
    event.key.toLocaleLowerCase() === "k";

  if (commandShortcut) {
    event.preventDefault();
    if (isCommandPaletteOpen()) closeCommandPalette();
    else openCommandPalette();
    return;
  }

  if (isCommandPaletteOpen()) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveCommandPaletteSelection(1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveCommandPaletteSelection(-1);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      runCommandPaletteItem();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeCommandPalette();
      return;
    }
  }

  const shortcut =
    (event.ctrlKey || event.metaKey) &&
    event.shiftKey &&
    event.code === "Space";

  if (shortcut) {
    event.preventDefault();
    if ($("quickCaptureOverlay").classList.contains("open")) {
      closeQuickCapture();
    } else {
      openQuickCapture();
    }
    return;
  }

  if (
    event.key === "Escape" &&
    $("quickCaptureOverlay").classList.contains("open")
  ) {
    event.preventDefault();
    closeQuickCapture();
  }
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

$("addTaskChecklistItemButton").addEventListener("click", addTaskModalChecklistItem);
$("closeTaskChecklistFileModalButton").addEventListener("click", closeTaskChecklistFileModal);
$("cancelTaskChecklistFileButton").addEventListener("click", closeTaskChecklistFileModal);
$("refreshTaskChecklistFilesButton").addEventListener("click", async () => {
  await loadDocuments({ silent: true });
  populateTaskChecklistUploadFolders();
  renderTaskChecklistFilePicker();
});
$("taskChecklistFileSearch").addEventListener("input", (event) => {
  taskChecklistFileSearchTerm = event.target.value.trim();
  renderTaskChecklistFilePicker();
});
$("uploadTaskChecklistFileButton").addEventListener("click", uploadTaskChecklistFile);
$("taskChecklistFileModal").addEventListener("pointerdown", (event) => {
  if (event.target === $("taskChecklistFileModal")) closeTaskChecklistFileModal();
});

$("taskModalForm").addEventListener("submit", (event) => {
  event.preventDefault();

  const recurrenceType = $("taskModalRecurrence").value;
  const recurrenceDays = getTaskModalCustomDays();
  if (recurrenceType !== "none" && !$("taskModalDueDate").value) {
    showToast("Add a due date for recurring tasks");
    $("taskModalDueDate").focus();
    return;
  }
  if (recurrenceType === "custom" && !recurrenceDays.length) {
    showToast("Select at least one repeat day");
    return;
  }

  const existingTask = editingTaskId === null
    ? null
    : tasks.find((task) => String(task.id) === String(editingTaskId));

  const values = {
    text: $("taskModalTitle").value,
    details: $("taskModalDetails").value,
    dueDate: $("taskModalDueDate").value,
    workspace: $("taskModalWorkspace").value,
    priority: $("taskModalPriority").value,
    project: $("taskModalProject").value,
    status: $("taskModalStatus").value,
    tags: normalizeTaskTags($("taskModalTags").value),
    subtasks: normalizeTaskSubtasks(taskDraftSubtasks),
    recurrence: { type: recurrenceType, days: recurrenceDays }
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

  if (!wasEditing && pendingTaskSource === "project") {
    selectedProjectName = String(values.project || "").trim();
    if ($("projectCreateName")) $("projectCreateName").value = "";
  }

  closeTaskModal();
  if (!wasEditing && selectedProjectName) renderProjectsHub();
  showToast(wasEditing ? "Task updated" : "Task added");
});

$("closeTaskModalButton").addEventListener("click", closeTaskModal);
$("cancelTaskModalButton").addEventListener("click", closeTaskModal);

$("taskModal").addEventListener("pointerdown", (event) => {
  if (event.target === $("taskModal")) closeTaskModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;

  if ($("taskChecklistFileModal").classList.contains("open")) {
    closeTaskChecklistFileModal();
    return;
  }

  if ($("taskModal").classList.contains("open")) {
    closeTaskModal();
    return;
  }

  if (boxFullscreenFallbackActive) {
    exitBoxFullscreen();
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

$("taskTagFilter").addEventListener("change", (event) => {
  activeTaskTagFilter = event.target.value;
  renderTasks();
});

$("taskProjectFilter").addEventListener("change", (event) => {
  activeTaskProjectFilter = event.target.value;
  renderTasks();
});

$("taskListViewButton").addEventListener("click", () => setTaskViewMode("list"));
$("taskKanbanViewButton").addEventListener("click", () => setTaskViewMode("kanban"));
$("taskModalRecurrence").addEventListener("change", updateTaskRecurrenceControls);

$("globalSearch").addEventListener("focus", (event) => {
  const initialQuery = event.target.value.trim();
  openCommandPalette(initialQuery);
  event.target.blur();
});

$("globalSearch").addEventListener("click", (event) => {
  openCommandPalette(event.target.value.trim());
});

$("calendarTodayButton").addEventListener("click", () => {
  const today = new Date();
  shownMonth = today.getMonth();
  shownYear = today.getFullYear();
  renderCalendar();
  selectCalendarDate(getLocalDateKey());
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

initializeNoteItems();

$("dashboardStickyNote").addEventListener("click", () => {
  const noteId = $("dashboardStickyNote").dataset.noteId;
  openApp("notes");
  if (noteId) selectNoteItem(noteId);
});

$("dashboardOurSpacePlan").addEventListener("click", () => {
  const planId = $("dashboardOurSpacePlan").dataset.planId;
  openApp("ourspace");
  if (planId) selectOurSpacePlan(planId);
});

$("newNoteButton").addEventListener("click", createNewNoteItem);
$("notesSearchInput").addEventListener("input", (event) => {
  notesSearchTerm = event.target.value.trim();
  renderNotesList();
});
["noteTitle", "noteContent"].forEach((id) => {
  $(id).addEventListener("input", updateSelectedNoteFromEditor);
});
$("noteSticky").addEventListener("change", updateSelectedNoteFromEditor);
$("deleteNoteButton").addEventListener("click", deleteSelectedNoteItem);

renderNotesCenter();

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
  renderActivityTimeline();
  renderWorkspacesHub();
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
$("openDocumentSmartToolsButton").addEventListener("click", () => {
  if (previewDocumentItem) openDocumentSmartTools(previewDocumentItem);
});
$("closeDocumentSmartToolsButton").addEventListener("click", closeDocumentSmartTools);
$("documentSmartToolsModal").addEventListener("pointerdown", (event) => {
  if (event.target === $("documentSmartToolsModal")) closeDocumentSmartTools();
});
$("extractDocumentTextButton").addEventListener("click", () => extractCurrentSmartDocument());
$("refreshDocumentTextButton").addEventListener("click", () => extractCurrentSmartDocument({ force: true }));
$("clearDocumentTextCacheButton").addEventListener("click", clearCurrentSmartDocumentCache);
$("documentSmartSearch").addEventListener("input", () => updateSmartDocumentSearch());
$("documentSmartPreviousMatch").addEventListener("click", () => showSmartDocumentSearchMatch(-1));
$("documentSmartNextMatch").addEventListener("click", () => showSmartDocumentSearchMatch(1));
$("documentSmartText").addEventListener("select", updateSmartSelectionStats);
$("documentSmartText").addEventListener("pointerup", updateSmartSelectionStats);
$("documentSmartText").addEventListener("keyup", updateSmartSelectionStats);
$("copySelectedDocumentTextButton").addEventListener("click", copySelectedSmartText);
$("copyAllDocumentTextButton").addEventListener("click", copyAllSmartText);
$("createTaskFromDocumentTextButton").addEventListener("click", createTaskFromSmartText);
$("createEventFromDocumentTextButton").addEventListener("click", prepareEventFromSmartText);
$("copyDocumentForChatGPTButton").addEventListener("click", copySmartPromptForChatGPT);
$("exportDocumentTextReportButton").addEventListener("click", exportSmartDocumentReport);
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

  if ($("documentSmartToolsModal").classList.contains("open")) {
    closeDocumentSmartTools();
  } else if ($("documentVersionModal").classList.contains("open")) {
    closeDocumentVersionModal();
  } else if ($("documentPreviewModal").classList.contains("open")) {
    closeDocumentPreview();
  } else if ($("documentDetailsModal").classList.contains("open")) {
    closeDocumentDetailsModal();
  } else if ($("documentFolderModal").classList.contains("open")) {
    closeDocumentFolderModal();
  }
});





$("ourSpaceHeroNext").addEventListener("click", () => {
  const planId = $("ourSpaceHeroNext").dataset.planId;
  if (planId) selectOurSpacePlan(planId);
});

$("newOurSpacePlanButton").addEventListener("click", () => {
  resetOurSpaceEditor();
  $("ourSpaceTitle").focus();
});
$("saveOurSpacePlanButton").addEventListener("click", saveOurSpacePlanFromEditor);
$("deleteOurSpacePlanButton").addEventListener("click", deleteSelectedOurSpacePlan);
$("addOurSpaceChecklistButton").addEventListener("click", () => addOurSpaceChecklistItem());
$("addOurSpaceLinkButton").addEventListener("click", addOurSpaceLink);
$("attachOurSpaceDocumentButton").addEventListener("click", attachSelectedOurSpaceDocument);
$("ourSpaceChooseDeviceFilesButton").addEventListener("click", () => {
  if (!window.BoxCloud?.isReady()) {
    setOurSpaceDirectUploadStatus("Sign in before attaching private files.", "error");
    openAuthOverlay();
    return;
  }
  $("ourSpaceDeviceFileInput").click();
});
$("ourSpaceDeviceFileInput").addEventListener("change", uploadOurSpaceFilesFromDevice);
$("ourSpaceStatus").addEventListener("change", updateOurSpaceMemoryVisibility);
$("ourSpaceCreateTaskButton").addEventListener("click", createTaskFromOurSpacePlan);
$("ourSpaceAddCalendarButton").addEventListener("click", addOurSpacePlanToCalendar);
$("ourSpaceArchiveButton").addEventListener("click", markSelectedOurSpacePlanDone);
$("ourSpaceSearchInput").addEventListener("input", (event) => {
  ourSpaceSearchTerm = event.target.value.trim();
  renderOurSpacePlanList();
});
$("ourSpaceCategoryFilter").addEventListener("change", (event) => {
  ourSpaceCategoryFilter = event.target.value;
  renderOurSpacePlanList();
});
$("ourSpaceStatusFilter").addEventListener("change", (event) => {
  ourSpaceStatusFilter = event.target.value;
  updateOurSpaceSidebarHeading();
  renderOurSpacePlanList();
});
$("ourSpaceFavoritesOnly").addEventListener("change", (event) => {
  ourSpaceFavoritesOnly = event.target.checked;
  renderOurSpacePlanList();
});
$("clearOurSpaceFiltersButton").addEventListener("click", clearOurSpaceFilters);
document.querySelectorAll("[data-our-space-quick-filter]").forEach((button) => {
  button.addEventListener("click", () => applyOurSpaceQuickFilter(button.dataset.ourSpaceQuickFilter));
});

$('newJournalEntryButton').addEventListener('click', newJournalEntry);
$('journalTodayButton').addEventListener('click', showJournalToday);
$('clearJournalFiltersButton').addEventListener('click', clearJournalFilters);
$('exportJournalRangeButton').addEventListener('click', exportFilteredJournalEntries);
$('saveJournalEntryButton').addEventListener('click', saveJournalEntryFromEditor);
$('deleteJournalEntryButton').addEventListener('click', deleteSelectedJournalEntry);
$('exportJournalEntryButton').addEventListener('click', exportSelectedJournalEntry);
$('previousJournalEntryButton').addEventListener('click', () => navigateJournalEntry('previous'));
$('nextJournalEntryButton').addEventListener('click', () => navigateJournalEntry('next'));
$('journalFocusModeButton').addEventListener('click', toggleJournalFocusMode);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && journalFocusMode) {
    event.preventDefault();
    exitJournalFocusMode();
  }
});
$('journalSearchInput').addEventListener('input', (event) => {
  journalSearchTerm = event.target.value.trim();
  renderJournalEntryList();
  updateJournalNavigation();
});
$('journalFavoritesOnly').addEventListener('change', (event) => {
  journalFavoritesOnly = event.target.checked;
  renderJournalEntryList();
  updateJournalNavigation();
});
$('journalDateFrom').addEventListener('change', (event) => {
  journalDateFrom = event.target.value;
  renderJournalEntryList();
  updateJournalNavigation();
});
$('journalDateTo').addEventListener('change', (event) => {
  journalDateTo = event.target.value;
  renderJournalEntryList();
  updateJournalNavigation();
});
['journalEntryDate', 'journalEntryTitle', 'journalEntryContent', 'journalEntryTags']
  .forEach((id) => $(id).addEventListener('input', markJournalEditorDirty));
$('journalEntryFavorite').addEventListener('change', markJournalEditorDirty);
document.querySelector('[data-app-window="journal"] .close-button')
  ?.addEventListener('click', exitJournalFocusMode);


$("newTemplateButton").addEventListener("click", createNewCustomTemplate);
$("templateSearch").addEventListener("input", (event) => {
  templateSearchTerm = event.target.value.trim();
  renderTemplateLibrary();
});
$("templateCategoryFilter").addEventListener("change", (event) => {
  templateCategoryFilter = event.target.value;
  renderTemplateLibrary();
});
$("saveTemplateButton").addEventListener("click", saveTemplateEditor);
$("duplicateTemplateButton").addEventListener("click", duplicateSelectedTemplate);
$("deleteTemplateButton").addEventListener("click", deleteSelectedTemplate);
$("resetTemplateButton").addEventListener("click", resetBuiltInTemplateEditor);
$("copyTemplateButton").addEventListener("click", copySelectedTemplate);
$("downloadTemplateButton").addEventListener("click", downloadSelectedTemplate);
document.querySelectorAll("[data-template-placeholder]").forEach((button) => {
  button.addEventListener("click", () => {
    insertTemplatePlaceholder(button.dataset.templatePlaceholder);
  });
});
$("generateComplianceReportButton").addEventListener("click", generateComplianceReport);
$("downloadComplianceCsvButton").addEventListener("click", downloadComplianceCsv);
$("downloadComplianceTextButton").addEventListener("click", downloadComplianceText);
$("printComplianceReportButton").addEventListener("click", printComplianceReport);
["complianceReportType", "complianceReportFolder", "complianceReportStatus", "complianceReportMonth"]
  .forEach((id) => {
    $(id).addEventListener("change", () => {
      generatedComplianceReport = null;
      $("downloadComplianceCsvButton").disabled = true;
      $("downloadComplianceTextButton").disabled = true;
      $("printComplianceReportButton").disabled = true;
      $("complianceReportPreview").textContent = "Filters changed. Generate the report again.";
    });
  });


$("notificationButton").addEventListener("click", () => openApp("reminders"));
$("checkRemindersButton").addEventListener("click", () => checkReminders({ manual: true }));
$("dismissAllRemindersButton").addEventListener("click", dismissAllRemindersForToday);
$("dailySummaryToggle").addEventListener("change", updateReminderSettingFromControls);
$("taskReminderLeadDays").addEventListener("change", updateReminderSettingFromControls);
$("eventReminderLeadDays").addEventListener("change", updateReminderSettingFromControls);
$("browserReminderToggle").addEventListener("change", async (event) => {
  if (event.target.checked) {
    const allowed = await requestBrowserNotificationAccess();
    if (!allowed) event.target.checked = false;
  } else {
    reminderSettings.browserNotifications = false;
    saveReminderSettings();
    updateBrowserNotificationStatus();
    showToast("Browser reminders disabled");
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
  if (Array.isArray(data.tasks)) {
    const cloudGoalRecords = data.tasks.filter(isGoalCloudRecord);
    const cloudRoutineRecords = data.tasks.filter(isRoutineCloudRecord);
    const cloudTaskRecords = data.tasks.filter(
      (item) => !isGoalCloudRecord(item) && !isRoutineCloudRecord(item)
    );
    tasks = cloudTaskRecords.map(normalizeTask);
    goals = normalizeGoals(cloudGoalRecords.map(extractGoalFromCloudRecord));
    routines = normalizeRoutines(cloudRoutineRecords.map(extractRoutineFromCloudRecord));
    selectedGoalId = null;
    selectedRoutineId = null;
  }
  if (Array.isArray(data.events)) events = data.events;
  if (Array.isArray(data.finance_entries)) financeEntries = data.finance_entries;

  if (typeof data.notes === "string") {
    localStorage.setItem(STORAGE.notes, data.notes);
    initializeNoteItems(data.notes);
    renderNotesCenter();
  }

  if (Array.isArray(data.custom_templates)) {
    customTemplates = normalizeCustomTemplates(data.custom_templates);
    persistCustomTemplates();
    if (!getSelectedTemplate()) {
      selectedTemplateId = BUILT_IN_TEMPLATES[0]?.id || customTemplates[0]?.id || "";
    }
  }

  if (Array.isArray(data.journal_entries)) {
    const cloudJournal = normalizeJournalEntries(data.journal_entries);
    const hasPendingLocalJournal = localStorage.getItem(STORAGE.journalPendingSync) === "1";
    if (hasPendingLocalJournal && journalEntries.length && window.BoxCloud?.replaceJournalEntries) {
      const merged = new Map(cloudJournal.map((entry) => [entry.id, entry]));
      journalEntries.forEach((entry) => {
        const remote = merged.get(entry.id);
        if (!remote || String(entry.updated_at) > String(remote.updated_at)) merged.set(entry.id, entry);
      });
      journalEntries = normalizeJournalEntries(Array.from(merged.values()));
      persistJournalEntries({ pendingCloudSync: true });
      window.BoxCloud.replaceJournalEntries(journalEntries).then((result) => {
        if (!result.error) localStorage.removeItem(STORAGE.journalPendingSync);
      });
    } else {
      journalEntries = cloudJournal;
      persistJournalEntries();
    }
    selectedJournalEntryId = null;
    journalEditorInitialized = false;
  }

  if (Array.isArray(data.our_space_plans)) {
    const cloudPlans = normalizeOurSpacePlans(data.our_space_plans);
    const hasPendingLocalPlans = localStorage.getItem(STORAGE.ourSpacePendingSync) === "1";

    if (hasPendingLocalPlans && ourSpacePlans.length && window.BoxCloud?.replaceOurSpacePlans) {
      const merged = new Map(cloudPlans.map((plan) => [plan.id, plan]));
      ourSpacePlans.forEach((plan) => {
        const remote = merged.get(plan.id);
        if (!remote || String(plan.updated_at) > String(remote.updated_at)) merged.set(plan.id, plan);
      });
      ourSpacePlans = normalizeOurSpacePlans(Array.from(merged.values()));
      persistOurSpacePlans({ pendingCloudSync: true });
      window.BoxCloud.replaceOurSpacePlans(ourSpacePlans).then((result) => {
        if (!result.error) localStorage.removeItem(STORAGE.ourSpacePendingSync);
      });
    } else {
      ourSpacePlans = cloudPlans;
      persistOurSpacePlans();
    }
    selectedOurSpacePlanId = null;
    if ($("ourSpaceTitle")) resetOurSpaceEditor();
  }

  ensureScheduledRoutineTasks({ silent: true });
  writeTaskGoalLocalRecords();
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
  renderReminderCenter();
  renderJournalCenter();
  if (nextUserId) syncPendingJournalIfNeeded();
});


if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./service-worker.js")
      .catch((error) => console.error("Service worker registration failed:", error));
  });
}

normalizeData();
ensureScheduledRoutineTasks({ silent: true });
initializeWindowControls();
restoreTheme();
updateFullscreenUi();
updateClock();
setInterval(updateClock, 1000);
renderAll();
loadWeather();
updateTimerDisplay();
openApp("dashboard");
scheduleReminderChecks();
setTimeout(showDailyReminderSummary, 2200);


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