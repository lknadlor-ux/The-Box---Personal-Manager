"use strict";

const STORAGE = {
  tasks: "theBoxOS4Tasks",
  events: "theBoxOS4Events",
  notes: "theBoxOS4Notes",
  finance: "theBoxOS4Finance",
  theme: "theBoxOS4Theme",
  timerMinutes: "theBoxOS4TimerMinutes",
  focusTotal: "theBoxOS4FocusTotal"
};

const DAVAO = {
  latitude: 7.0731,
  longitude: 125.6128
};

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

function normalizeData() {
  tasks = tasks.map((task) => ({
    id: task.id || Date.now() + Math.random(),
    text: task.text || "Untitled task",
    workspace: task.workspace || "personal",
    priority: task.priority || "normal",
    completed: Boolean(task.completed),
    createdAt: task.createdAt || new Date().toISOString()
  }));

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

  const message =
    hour < 12 ? "Your day is ready." :
    hour < 18 ? "Keep your priorities moving." :
    "Finish strong, then protect your rest.";

  $("greeting").textContent = greeting;
  $("welcomeMessage").textContent = message;
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
  focusWindow(windowElement);

  $("activeAppLabel").textContent =
    appName.charAt(0).toUpperCase() + appName.slice(1);

  document.querySelectorAll(".dock-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.openApp === appName);
  });

  closeLauncher();
}

function closeApp(windowElement) {
  windowElement.classList.remove("open", "maximized", "minimized");
}

function focusWindow(windowElement) {
  topWindowZ += 1;
  windowElement.style.zIndex = topWindowZ;

  document.querySelectorAll(".app-window").forEach((item) => {
    item.classList.toggle("active-window", item === windowElement);
  });
}

function toggleMaximize(windowElement) {
  windowElement.classList.toggle("maximized");
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

    enableDragging(windowElement);
  });
}

function enableDragging(windowElement) {
  const titlebar = windowElement.querySelector(".window-titlebar");
  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  titlebar.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button") || windowElement.classList.contains("maximized")) return;

    dragging = true;
    const rect = windowElement.getBoundingClientRect();
    offsetX = event.clientX - rect.left;
    offsetY = event.clientY - rect.top;
    titlebar.setPointerCapture(event.pointerId);
    focusWindow(windowElement);
  });

  titlebar.addEventListener("pointermove", (event) => {
    if (!dragging) return;

    const desktopRect = $("desktop").getBoundingClientRect();
    const windowRect = windowElement.getBoundingClientRect();

    let nextLeft = event.clientX - desktopRect.left - offsetX;
    let nextTop = event.clientY - desktopRect.top - offsetY;

    nextLeft = Math.max(0, Math.min(nextLeft, desktopRect.width - windowRect.width));
    nextTop = Math.max(0, Math.min(nextTop, desktopRect.height - windowRect.height));

    windowElement.style.left = `${nextLeft}px`;
    windowElement.style.top = `${nextTop}px`;
  });

  titlebar.addEventListener("pointerup", () => {
    dragging = false;
  });
}

function createTask(text, workspace, priority) {
  const cleanText = text.trim();
  if (!cleanText) return false;

  tasks.unshift({
    id: Date.now() + Math.random(),
    text: cleanText,
    workspace,
    priority,
    completed: false,
    createdAt: new Date().toISOString()
  });

  saveJSON(STORAGE.tasks, tasks);
  renderAll();
  return true;
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

    const matchesSearch =
      task.text.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesStatus && matchesWorkspace && matchesSearch;
  });
}

function buildTaskRow(task) {
  const row = document.createElement("div");
  row.className = `task-item${task.completed ? " done" : ""}`;

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = task.completed;

  checkbox.addEventListener("change", () => {
    task.completed = checkbox.checked;
    saveJSON(STORAGE.tasks, tasks);
    renderAll();
  });

  const content = document.createElement("div");

  const title = document.createElement("span");
  title.className = "task-title";
  title.textContent = task.text;

  const meta = document.createElement("span");
  meta.className = "task-meta";
  meta.textContent = `${task.workspace} · ${task.priority}`;

  content.append(title, meta);

  const deleteButton = document.createElement("button");
  deleteButton.className = "delete-button";
  deleteButton.textContent = "✕";

  deleteButton.addEventListener("click", () => {
    tasks = tasks.filter((item) => item.id !== task.id);
    saveJSON(STORAGE.tasks, tasks);
    renderAll();
    showToast("Task deleted");
  });

  row.append(checkbox, content, deleteButton);
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
  $("desktopNextEvent").textContent = upcoming[0] ? upcoming[0].title : "None";
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

    calendarDays.appendChild(element);
  }
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

    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-button";
    deleteButton.textContent = "✕";

    deleteButton.addEventListener("click", () => {
      events = events.filter((item) => item.id !== event.id);
      saveJSON(STORAGE.events, events);
      renderAll();
      showToast("Event deleted");
    });

    row.append(dateBox, content, deleteButton);
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

function renderAll() {
  renderTasks();
  renderDashboard();
  renderCalendar();
  renderEvents();
  renderFinance();
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
        tasks.unshift({
          id: Date.now() + Math.random(),
          text: line,
          workspace: "personal",
          priority: "normal",
          completed: false,
          createdAt: new Date().toISOString()
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

  if (createTask(
    $("quickTaskInput").value,
    $("quickTaskWorkspace").value,
    $("quickTaskPriority").value
  )) {
    $("quickTaskInput").value = "";
    showToast("Task added");
  }
});

$("taskForm").addEventListener("submit", (event) => {
  event.preventDefault();

  if (createTask(
    $("taskInput").value,
    $("taskWorkspace").value,
    $("taskPriority").value
  )) {
    $("taskInput").value = "";
    showToast("Task added");
  }
});

document.querySelectorAll("[data-template-task]").forEach((button) => {
  button.addEventListener("click", () => {
    createTask(
      button.dataset.templateTask,
      button.dataset.templateWorkspace,
      "important"
    );
    showToast("Workspace task added");
  });
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
  if (Array.isArray(data.tasks)) tasks = data.tasks;
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
  setCloudStatus(detail.state || "offline", detail.label || "Local");
  updateAuthUI(detail.session || null);
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