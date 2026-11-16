const STORAGE_KEY = "shiling-meeting-action-v1";
const ACCESS_STORAGE_KEY = "shiling-public-access";
const CURRENT_YEAR = new Date().getFullYear();

capturePublicAccess();

const STATUS_META = {
  backlog: { label: "待确认", dot: "backlog" },
  todo: { label: "待开始", dot: "todo" },
  doing: { label: "进行中", dot: "doing" },
  done: { label: "已完成", dot: "done" },
};

const PRIORITY_META = {
  high: { label: "高优先级" },
  medium: { label: "中优先级" },
  low: { label: "低优先级" },
};

const AVATAR_COLORS = ["blue", "ink", "orange", "green", "red"];

const SAMPLE_TRANSCRIPT = `产品周会 · 企业知识库上线前评审
日期：2026年11月14日
参会：陈晨、林晓、周远、许安

陈晨：本周必须把客户知识库的权限模型定下来，现有部门权限和项目权限冲突。请林晓在11月17日前整理权限清单，并标出需要人工审批的场景。
林晓：可以。知识库导入脚本还缺异常回滚，周远负责11月18日前补齐。
周远：没问题。前端检索页现在空状态不清楚，许安在11月17日完成空状态和加载状态设计。
许安：设计稿会在明天下午给到。
陈晨：决定第一期只开放文档问答和流程查询，会议Agent放到下一版。
林晓：客户访谈里销售最担心回答没有引用来源。
陈晨：所有回答必须显示原文引用，这是上线门槛。
周远：本地模型响应速度还不稳定，存在超过3秒的阻塞风险。
陈晨：11月19日下午做一次上线评审，陈晨负责拉通客户和研发。若引用准确率低于90%，不上线。`;

const DEMO_TASKS = [
  {
    id: "t1",
    title: "整理知识库权限清单并标记人工审批场景",
    owner: "林晓",
    due: "2026-11-17",
    priority: "high",
    status: "doing",
    source: "请林晓在11月17日前整理权限清单，并标出需要人工审批的场景。",
    notes: "覆盖部门权限、项目权限和跨部门访问。",
    tags: ["权限", "知识库"],
  },
  {
    id: "t2",
    title: "补齐知识库导入异常回滚",
    owner: "周远",
    due: "2026-11-18",
    priority: "high",
    status: "todo",
    source: "知识库导入脚本还缺异常回滚，周远负责11月18日前补齐。",
    notes: "模拟导入中断、重复文件和格式错误。",
    tags: ["导入", "稳定性"],
  },
  {
    id: "t3",
    title: "完成检索页空状态与加载状态设计",
    owner: "许安",
    due: "2026-11-17",
    priority: "medium",
    status: "doing",
    source: "许安在11月17日完成空状态和加载状态设计。",
    notes: "明日下午交付第一版设计稿。",
    tags: ["设计", "检索"],
  },
  {
    id: "t4",
    title: "拉通客户和研发进行上线评审",
    owner: "陈晨",
    due: "2026-11-19",
    priority: "high",
    status: "todo",
    source: "11月19日下午做一次上线评审，陈晨负责拉通客户和研发。",
    notes: "评审前完成引用准确率和响应时间验证。",
    tags: ["评审", "上线"],
  },
  {
    id: "t5",
    title: "验证回答引用的展示与准确率",
    owner: "周远",
    due: "2026-11-18",
    priority: "high",
    status: "backlog",
    source: "所有回答必须显示原文引用，引用准确率低于90%不上线。",
    notes: "需要业务方确认准确率的抽样口径。",
    tags: ["引用", "验收"],
  },
];

const DEMO_DECISIONS = [
  {
    id: "d1",
    text: "第一期只开放文档问答和流程查询，会议 Agent 放入下一版本。",
    source: "决定第一期只开放文档问答和流程查询，会议Agent放到下一版。",
  },
  {
    id: "d2",
    text: "所有回答必须展示原文引用。",
    source: "所有回答必须显示原文引用，这是上线门槛。",
  },
  {
    id: "d3",
    text: "引用准确率低于 90% 不上线。",
    source: "若引用准确率低于90%，不上线。",
  },
];

const DEMO_RISKS = [
  {
    id: "r1",
    title: "部门权限与项目权限存在冲突",
    severity: "high",
    source: "现有部门权限和项目权限冲突。",
  },
  {
    id: "r2",
    title: "知识库导入脚本缺少异常回滚",
    severity: "high",
    source: "知识库导入脚本还缺异常回滚。",
  },
  {
    id: "r3",
    title: "本地模型响应可能超过 3 秒",
    severity: "medium",
    source: "本地模型响应速度还不稳定，存在超过3秒的阻塞风险。",
  },
  {
    id: "r4",
    title: "回答引用准确率可能低于上线门槛",
    severity: "high",
    source: "引用准确率低于90%，不上线。",
  },
];

let state = loadState();
let modalClosing = false;
let draggingTaskId = null;
let backendAvailable = false;
let autoMode = createAutoModeState();
let activeViewTransition = null;

const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".m4a", ".webm", ".ogg", ".aac", ".flac"]);
const DOCUMENT_EXTENSIONS = new Set([".txt", ".md", ".csv", ".json", ".pdf", ".docx", ".pptx"]);

function createAutoModeState() {
  return {
    phase: "input",
    files: [],
    documents: [],
    audioTranscripts: [],
    errors: [],
    completeness: null,
    finalDocument: "",
    progressText: "",
    title: "",
    date: "",
    participantsText: "",
    manualText: "",
    resolutions: {},
    sourceStats: null,
  };
}

function createDemoState() {
  return {
    meeting: {
      title: "产品周会 · 企业知识库上线前评审",
      date: "2026-11-14",
      participants: ["陈晨", "林晓", "周远", "许安"],
      transcript: SAMPLE_TRANSCRIPT,
      updatedAt: "11月14日 18:40",
    },
    tasks: clone(DEMO_TASKS),
    decisions: clone(DEMO_DECISIONS),
    risks: clone(DEMO_RISKS),
    view: "auto",
    query: "",
    ownerFilter: "all",
    compact: false,
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadState() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return createDemoState();
    const parsed = JSON.parse(stored);
    if (!parsed.meeting || !Array.isArray(parsed.tasks)) return createDemoState();
    return {
      ...createDemoState(),
      ...parsed,
      meeting: { ...createDemoState().meeting, ...parsed.meeting },
      view: ["board", "meeting", "risks", "auto"].includes(parsed.view)
        ? parsed.view
        : "auto",
      query: "",
      ownerFilter: "all",
      compact: false,
    };
  } catch {
    return createDemoState();
  }
}

function saveState() {
  try {
    const serializable = {
      meeting: state.meeting,
      tasks: state.tasks,
      decisions: state.decisions,
      risks: state.risks,
      view: state.view,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
  } catch {
    // Local storage is optional for the demo.
  }
}

async function apiRequest(path, options = {}) {
  if (!["http:", "https:"].includes(window.location.protocol)) {
    throw new Error("Backend unavailable in file mode.");
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), options.timeout || 6000);
  const request = {
    method: options.method || "GET",
    headers: {
      Accept: "application/json",
      ...(getPublicAccess() ? { "X-Shiling-Access": getPublicAccess() } : {}),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
    signal: controller.signal,
  };
  if (options.body) {
    request.body = JSON.stringify(options.body);
  }

  try {
    const response = await fetch(`/api${path}`, request);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || `API request failed: ${response.status}`);
      error.status = response.status;
      throw error;
    }
    backendAvailable = true;
    return payload;
  } catch (error) {
    if (!error.status) backendAvailable = false;
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function capturePublicAccess() {
  try {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("access");
    if (!code) return;
    sessionStorage.setItem(ACCESS_STORAGE_KEY, code);
    url.searchParams.delete("access");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // URL and session storage are optional in restricted browser modes.
  }
}

function getPublicAccess() {
  try {
    return sessionStorage.getItem(ACCESS_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

async function apiUpload(path, formData, timeoutMs = 200000) {
  if (!["http:", "https:"].includes(window.location.protocol)) {
    throw new Error("Backend unavailable in file mode.");
  }
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`/api${path}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        ...(getPublicAccess() ? { "X-Shiling-Access": getPublicAccess() } : {}),
      },
      body: formData,
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || `Upload failed: ${response.status}`);
      error.code = payload.code;
      error.payload = payload;
      throw error;
    }
    backendAvailable = true;
    return payload;
  } catch (error) {
    if (error.name === "AbortError") {
      backendAvailable = false;
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function applyServerState(serverState) {
  if (!serverState?.meeting || !Array.isArray(serverState.tasks)) return;
  const preferences = {
    view: state.view,
    query: state.query,
    ownerFilter: state.ownerFilter,
    compact: state.compact,
  };
  state = {
    meeting: serverState.meeting,
    tasks: serverState.tasks,
    decisions: Array.isArray(serverState.decisions) ? serverState.decisions : [],
    risks: Array.isArray(serverState.risks) ? serverState.risks : [],
    ...preferences,
  };
  if (state.meeting.id) localStorage.setItem("shiling_meeting_id", state.meeting.id);
  saveState();
}

async function initializeApp() {
  if (["http:", "https:"].includes(window.location.protocol)) {
    if (localStorage.getItem("shiling_unsynced") === "1") {
      backendAvailable = false;
      renderApp();
      showToast("存在未同步的本机修改，请先导出 JSON 备份。", "alert-circle");
      return;
    }
    try {
      const meetingId = localStorage.getItem("shiling_meeting_id");
      let serverState;
      try {
        serverState = await apiRequest(meetingId ? `/state?meetingId=${encodeURIComponent(meetingId)}` : "/state");
      } catch (error) {
        if (!meetingId) throw error;
        serverState = await apiRequest("/state");
      }
      applyServerState(serverState);
      backendAvailable = true;
    } catch {
      backendAvailable = false;
    }
  }
  renderApp();
}

let pendingWrites = 0;
let writeFailed = false;
function trackWrite(request) {
  if (!["http:", "https:"].includes(window.location.protocol)) return;
  localStorage.setItem("shiling_unsynced", "1");
  if (!request) {
    writeFailed = true;
    showToast("修改仅保存在本机，请导出 JSON 备份。", "cloud-off");
    return;
  }
  pendingWrites += 1;
  request.then((payload) => {
    if (payload?.task?.version) {
      const current = state.tasks.find((item) => item.id === payload.task.id);
      if (current) current.version = payload.task.version;
      saveState();
    }
    pendingWrites -= 1;
    if (!pendingWrites && !writeFailed) localStorage.removeItem("shiling_unsynced");
  }).catch((error) => {
    pendingWrites -= 1;
    writeFailed = true;
    showToast(error.status === 409 ? "任务已被其他人修改，本机修改已保留，请导出 JSON 备份。" : "保存失败，修改仅保存在本机，请导出 JSON 备份。", "cloud-off");
    updateChrome();
  });
}

function syncTask(task, isNew) {
  if (!backendAvailable) return trackWrite(null);
  const request = isNew
    ? apiRequest("/tasks", { method: "POST", body: { ...task, meetingId: state.meeting.id } })
    : apiRequest(`/tasks/${encodeURIComponent(task.id)}`, { method: "PUT", body: task });
  trackWrite(request);
}

function syncDelete(task) {
  if (!backendAvailable) return trackWrite(null);
  trackWrite(apiRequest(`/tasks/${encodeURIComponent(task.id)}`, { method: "DELETE", headers: task.version ? { "If-Match": String(task.version) } : {} }));
}

function syncTaskStatus(task) {
  if (!backendAvailable) return trackWrite(null);
  trackWrite(apiRequest(`/tasks/${encodeURIComponent(task.id)}`, {
    method: "PUT",
    body: { status: task.status, version: task.version },
  }));
}

function icon(name) {
  return `<i data-lucide="${name}" aria-hidden="true"></i>`;
}

function refreshIcons() {
  if (window.lucide?.createIcons) {
    window.lucide.createIcons({
      attrs: {
        "stroke-width": 1.8,
      },
    });
  }
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeDate(value) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatShortDate(value) {
  if (!value) return "未定日期";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function formatLongDate(value) {
  if (!value) return "日期未定";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function dateInputValue(value) {
  return normalizeDate(value);
}

function initials(name) {
  const clean = String(name || "待定").trim();
  if (!clean) return "?";
  return clean.length <= 2 ? clean : clean.slice(-2);
}

function avatarClass(name) {
  const text = String(name || "待定");
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function avatar(name, extra = "") {
  return `<span class="avatar ${avatarClass(name)} ${extra}" title="${escapeHTML(name || "负责人待定")}">${escapeHTML(initials(name))}</span>`;
}

function dueIsOverdue(due) {
  if (!due) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${due}T00:00:00`);
  return !Number.isNaN(target.getTime()) && target < today;
}

function getFilteredTasks() {
  const query = state.query.trim().toLowerCase();
  return state.tasks.filter((task) => {
    const matchesOwner = state.ownerFilter === "all" || task.owner === state.ownerFilter;
    const haystack = `${task.title} ${task.owner} ${task.notes} ${(task.tags || []).join(" ")}`.toLowerCase();
    const matchesQuery = !query || haystack.includes(query);
    return matchesOwner && matchesQuery;
  });
}

function getOwners() {
  return [...new Set(state.tasks.map((task) => task.owner).filter(Boolean))];
}

function renderApp() {
  const root = document.getElementById("content-root");
  if (!root) return;

  updateChrome();
  if (state.view === "meeting") {
    root.innerHTML = renderMeetingView();
  } else if (state.view === "risks") {
    root.innerHTML = renderRisksView();
  } else if (state.view === "auto") {
    root.innerHTML = renderAutoView();
  } else {
    root.innerHTML = renderBoardView();
  }
  refreshIcons();
}

function renderWithTransition() {
  if (document.startViewTransition) {
    if (activeViewTransition) {
      renderApp();
      return;
    }
    activeViewTransition = document.startViewTransition(() => renderApp());
    activeViewTransition.finished.finally(() => {
      activeViewTransition = null;
    });
  } else {
    renderApp();
  }
}

function updateChrome() {
  const activeTasks = state.tasks.filter((task) => task.status !== "done").length;
  const highRisks = state.risks.filter((risk) => risk.severity === "high").length;

  setText("nav-task-count", String(activeTasks));
  setText("nav-risk-count", String(highRisks));
  setText("sidebar-meeting-title", state.meeting.title);
  setText("sidebar-meeting-date", formatLongDate(state.meeting.date).replaceAll("年", ".").replaceAll("月", ".").replace("日", ""));
  setText("topbar-meeting-title", state.meeting.title);
  setText("topbar-meeting-date", formatLongDate(state.meeting.date));
  setText("topbar-participant-count", `${state.meeting.participants.length}人参会`);
  setText("topbar-task-count", `${state.tasks.length}项行动`);
  setText("engine-name", backendAvailable ? "后端已连接" : "本地语义引擎");
  setText(
    "engine-subtitle",
    backendAvailable ? "SQLite 持久化 · API 可用" : "离线可用 · 数据不出设备",
  );
  const engineStatus = document.querySelector(".engine-status");
  if (engineStatus) {
    engineStatus.title = backendAvailable
      ? "Python API 与 SQLite 已连接"
      : "本地语义引擎，无需联网";
  }
  document.body.classList.toggle("is-auto-mode", state.view === "auto");

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === state.view);
  });

  const search = document.getElementById("task-search");
  if (search && search.value !== state.query) search.value = state.query;
  const mobileSearch = document.getElementById("mobile-task-search");
  if (mobileSearch && mobileSearch.value !== state.query) mobileSearch.value = state.query;
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function renderBoardView() {
  const filtered = getFilteredTasks();
  const active = state.tasks.filter((task) => task.status !== "done").length;
  const highPriority = state.tasks.filter((task) => task.priority === "high" && task.status !== "done").length;
  const owners = getOwners();
  const highRisks = state.risks.filter((risk) => risk.severity === "high").length;
  const filterHtml = renderOwnerFilters();

  return `
    <section class="view board-view">
      <div class="page-heading">
        <div class="page-title-group">
          <h1>行动任务看板</h1>
          <p>${escapeHTML(state.meeting.title)} · ${escapeHTML(state.meeting.updatedAt || "刚刚更新")}</p>
        </div>
        <div class="page-actions">
          <button class="secondary-button" type="button" data-action="import-meeting">
            ${icon("wand-sparkles")}
            <span>重新提取</span>
          </button>
          <button class="primary-button" type="button" data-action="add-task">
            ${icon("plus")}
            <span>新增任务</span>
          </button>
        </div>
      </div>

      <div class="metrics-strip">
        ${metric("list-checks", "blue", active, "待处理行动")}
        ${metric("users", "", owners.length, "协作负责人")}
        ${metric("triangle-alert", "orange", highRisks, "高风险事项")}
        ${metric("badge-check", "green", state.decisions.length, "已确认决策")}
      </div>

      <div class="board-toolbar">
        <div class="filter-row" aria-label="负责人筛选">
          <button class="filter-chip ${state.ownerFilter === "all" ? "is-active" : ""}" type="button" data-owner-filter="all">
            <span class="avatar-stack">${owners.slice(0, 4).map((owner) => avatar(owner)).join("")}</span>
            全部
            <span>${state.tasks.length}</span>
          </button>
          ${filterHtml}
        </div>

        <div class="toolbar-actions">
          <label class="mobile-task-search" for="mobile-task-search">
            ${icon("search")}
            <input id="mobile-task-search" type="search" placeholder="搜索任务" value="${escapeHTML(state.query)}" autocomplete="off">
          </label>
          <div class="view-toggle" aria-label="看板视图">
            <button class="${state.compact ? "" : "is-active"}" type="button" data-action="view-columns" title="分栏视图" aria-label="分栏视图">
              ${icon("columns-3")}
            </button>
            <button class="${state.compact ? "is-active" : ""}" type="button" data-action="view-list" title="整理视图" aria-label="整理视图">
              ${icon("rows-3")}
            </button>
          </div>
        </div>
      </div>

      <div class="board ${state.compact ? "is-compact" : ""}">
        ${Object.keys(STATUS_META).map((status) => renderBoardColumn(status, filtered.filter((task) => task.status === status))).join("")}
      </div>
    </section>
  `;
}

function metric(iconName, tone, value, label) {
  return `
    <div class="metric">
      <span class="metric-icon ${tone}">${icon(iconName)}</span>
      <span>
        <strong class="metric-value">${escapeHTML(value)}</strong>
        <small class="metric-label">${escapeHTML(label)}</small>
      </span>
    </div>
  `;
}

function renderOwnerFilters() {
  const owners = getOwners();
  const totalByOwner = {};
  state.tasks.forEach((task) => {
    if (task.owner) totalByOwner[task.owner] = (totalByOwner[task.owner] || 0) + 1;
  });
  return owners
    .map(
      (owner) => `
        <button class="filter-chip ${state.ownerFilter === owner ? "is-active" : ""}" type="button" data-owner-filter="${escapeHTML(owner)}">
          ${avatar(owner)}
          <span>${escapeHTML(owner)}</span>
          <span>${totalByOwner[owner] || 0}</span>
        </button>
      `,
    )
    .join("");
}

function renderBoardColumn(status, tasks) {
  const meta = STATUS_META[status];
  return `
    <section class="board-column" data-status="${status}" aria-label="${meta.label}">
      <div class="column-head">
        <span class="column-dot ${meta.dot}"></span>
        <strong>${meta.label}</strong>
        <span class="column-count">${tasks.length}</span>
        <button class="column-add" type="button" data-add-status="${status}" title="在${meta.label}中新建任务" aria-label="在${meta.label}中新建任务">
          ${icon("plus")}
        </button>
      </div>
      <div class="task-list">
        ${tasks.length ? tasks.map((task) => renderTaskCard(task)).join("") : `<div class="empty-column">暂无任务</div>`}
      </div>
    </section>
  `;
}

function renderTaskCard(task) {
  const dueClass = dueIsOverdue(task.due) ? "is-overdue" : "";
  const doneClass = task.status === "done" ? "is-done" : "";
  return `
    <article class="task-card ${doneClass}" draggable="true" tabindex="0" data-task-id="${escapeHTML(task.id)}" aria-label="${escapeHTML(task.title)}">
      <div class="task-topline">
        <span class="priority ${task.priority}">${PRIORITY_META[task.priority]?.label || "中优先级"}</span>
        <button class="task-menu" type="button" data-edit-task="${escapeHTML(task.id)}" title="编辑任务" aria-label="编辑任务">
          ${icon("ellipsis")}
        </button>
      </div>
      <h3 class="task-title">${escapeHTML(task.title)}</h3>
      ${task.source ? `<p class="task-source">${escapeHTML(task.source)}</p>` : ""}
      <footer class="task-footer">
        <span class="task-owner">${avatar(task.owner || "待定")}${escapeHTML(task.owner || "负责人待定")}</span>
        <span class="task-due ${dueClass}">${icon("calendar")}${escapeHTML(formatShortDate(task.due))}</span>
      </footer>
    </article>
  `;
}

function renderMeetingView() {
  const lines = parseTranscriptLines(state.meeting.transcript);
  return `
    <section class="view">
      <div class="page-heading">
        <div class="page-title-group">
          <h1>会议记录</h1>
          <p>${escapeHTML(formatLongDate(state.meeting.date))} · ${state.meeting.participants.length} 位参与人 · ${state.tasks.length} 项行动</p>
        </div>
        <div class="page-actions">
          <button class="secondary-button" type="button" data-action="copy-summary">
            ${icon("copy")}
            <span>复制摘要</span>
          </button>
          <button class="primary-button" type="button" data-action="import-meeting">
            ${icon("sparkles")}
            <span>重新提取</span>
          </button>
        </div>
      </div>

      <div class="meeting-layout">
        <section class="record-panel">
          <div class="panel-head">
            <div class="panel-title">${icon("file-text")}会议原文</div>
            <span class="panel-subtitle">${escapeHTML(state.meeting.title)}</span>
          </div>
          <div class="transcript">
            ${
              lines.length
                ? lines.map((line, index) => renderTranscriptLine(line, index)).join("")
                : `<div class="empty-column">暂无会议文本</div>`
            }
          </div>
        </section>

        <div class="extract-stack">
          <section class="extract-panel">
            <div class="panel-head">
              <div class="panel-title">${icon("list-checks")}行动项</div>
              <span class="panel-subtitle">${state.tasks.length} 项</span>
            </div>
            <div class="extract-list">
              ${state.tasks
                .slice(0, 6)
                .map(
                  (task) => `
                    <div class="extract-item">
                      <span class="extract-icon">${icon("check-square-2")}</span>
                      <div>
                        <strong>${escapeHTML(task.title)}</strong>
                        <p>${escapeHTML(task.owner || "负责人待定")} · ${escapeHTML(formatShortDate(task.due))}</p>
                      </div>
                    </div>
                  `,
                )
                .join("")}
            </div>
          </section>

          <section class="extract-panel">
            <div class="panel-head">
              <div class="panel-title">${icon("badge-check")}决策结论</div>
              <span class="panel-subtitle">${state.decisions.length} 项</span>
            </div>
            <div class="extract-list">
              ${state.decisions
                .map(
                  (decision) => `
                    <div class="extract-item">
                      <span class="extract-icon decision">${icon("gavel")}</span>
                      <div>
                        <strong>${escapeHTML(decision.text)}</strong>
                        <p>${escapeHTML(decision.source || "")}</p>
                      </div>
                    </div>
                  `,
                )
                .join("")}
            </div>
          </section>
        </div>
      </div>
    </section>
  `;
}

function parseTranscriptLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^([\p{L}\w]{2,12})[：:]\s*(.+)$/u);
      if (match) return { speaker: match[1], text: match[2] };
      return { speaker: "", text: line };
    });
}

function renderTranscriptLine(line, index) {
  return `
    <div class="transcript-line" style="animation-delay:${Math.min(index * 26, 220)}ms">
      <span class="speaker">${escapeHTML(line.speaker || "备注")}</span>
      <p class="transcript-text">${highlightTranscript(line.text)}</p>
    </div>
  `;
}

function highlightTranscript(text) {
  const safe = escapeHTML(text);
  return safe.replace(
    /(11月\d{1,2}日|明天|上线门槛|不上线|风险|冲突|回滚|引用准确率低于90%|必须显示原文引用)/g,
    "<mark>$1</mark>",
  );
}

function renderRisksView() {
  const highRiskCount = state.risks.filter((risk) => risk.severity === "high").length;
  return `
    <section class="view">
      <div class="page-heading">
        <div class="page-title-group">
          <h1>决策与风险</h1>
          <p>${state.decisions.length} 项决策 · ${state.risks.length} 项风险 · ${highRiskCount} 项高风险</p>
        </div>
        <div class="page-actions">
          <button class="secondary-button" type="button" data-action="export-md">
            ${icon("download")}
            <span>导出报告</span>
          </button>
        </div>
      </div>

      <div class="metrics-strip">
        ${metric("badge-check", "green", state.decisions.length, "决策结论")}
        ${metric("triangle-alert", "orange", state.risks.length, "风险事项")}
        ${metric("circle-alert", "blue", highRiskCount, "高风险")}
        ${metric("calendar-clock", "", activeTaskCount(), "待处理行动")}
      </div>

      <div class="risk-grid">
        <section class="risk-panel">
          <div class="panel-head">
            <div class="panel-title">${icon("badge-check")}决策结论</div>
            <span class="panel-subtitle">已确认</span>
          </div>
          <div class="decision-list">
            ${state.decisions
              .map(
                (decision) => `
                  <article class="decision-entry">
                    <div class="entry-top">
                      <strong>${escapeHTML(decision.text)}</strong>
                    </div>
                    <p class="entry-source">${escapeHTML(decision.source || "")}</p>
                    <div class="entry-actions">
                      <button class="ghost-button" type="button" data-convert-type="decision" data-convert-id="${escapeHTML(decision.id)}">
                        ${icon("list-plus")}
                        转为任务
                      </button>
                    </div>
                  </article>
                `,
              )
              .join("")}
          </div>
        </section>

        <section class="risk-panel">
          <div class="panel-head">
            <div class="panel-title">${icon("shield-alert")}风险清单</div>
            <span class="panel-subtitle">按影响排序</span>
          </div>
          <div class="risk-list">
            ${state.risks
              .map(
                (risk) => `
                  <article class="risk-entry ${risk.severity}">
                    <div class="entry-top">
                      <strong>${escapeHTML(risk.title)}</strong>
                      <span class="severity ${risk.severity}">${risk.severity === "high" ? "高风险" : "中风险"}</span>
                    </div>
                    <p class="entry-source">${escapeHTML(risk.source || "")}</p>
                    <div class="entry-actions">
                      <button class="ghost-button" type="button" data-convert-type="risk" data-convert-id="${escapeHTML(risk.id)}">
                        ${icon("list-plus")}
                        转为任务
                      </button>
                    </div>
                  </article>
                `,
              )
              .join("")}
          </div>
        </section>
      </div>
    </section>
  `;
}

function renderAutoView() {
  const completeness = autoMode.completeness;
  const missing = completeness?.missing || [];
  const requiredMissing = missing.filter((item) => item.severity === "required");
  const config = autoButtonConfig(requiredMissing.length);
  const activeStep = {
    input: 0,
    processing: 1,
    missing: 2,
    ready: 2,
    final: 3,
  }[autoMode.phase] ?? 0;

  return `
    <section class="view auto-view">
      <div class="auto-hero">
        <div>
          <span class="auto-kicker">AI GUIDED WORKSPACE</span>
          <h1>把会议材料交给 AI</h1>
          <p>一次投入演示文档、录音或人工记录，依次完成转写、提取、完整性检查和最终文档。</p>
        </div>
        <div class="auto-backend-badge ${backendAvailable ? "is-online" : ""}">
          <span class="status-light"></span>
          <span>${backendAvailable ? "后端在线" : "等待后端"}</span>
        </div>
      </div>

      <div class="auto-progress" aria-label="AI 处理进度">
        ${["投入材料", "AI 生成", "完整性检查", "最终文档"]
          .map(
            (label, index) => `
              <div class="auto-progress-step ${index < activeStep ? "is-complete" : ""} ${index === activeStep ? "is-active" : ""}">
                <span>${index < activeStep ? "✓" : index + 1}</span>
                <strong>${label}</strong>
              </div>
            `,
          )
          .join("")}
      </div>

      <div class="auto-workspace">
        <div class="auto-main">
          ${renderAutoMain(requiredMissing)}
        </div>
        <aside class="auto-side">
          ${renderAutoStatus()}
        </aside>
      </div>

      <div class="auto-action-band">
        <div>
          <strong>${escapeHTML(config.instruction)}</strong>
          <span>${escapeHTML(config.detail)}</span>
        </div>
        <button class="auto-primary" type="button" data-action="auto-primary" ${config.disabled ? "disabled" : ""}>
          ${icon(config.icon)}
          <span>${escapeHTML(config.label)}</span>
        </button>
      </div>
    </section>
  `;
}

function autoButtonConfig(requiredMissingCount) {
  if (autoMode.phase === "processing") {
    return {
      label: "AI 正在处理",
      instruction: autoMode.progressText || "AI 正在整理会议材料",
      detail: "请保持页面打开，文档解析和录音转写可能需要一些时间。",
      icon: "loader-circle",
      disabled: true,
    };
  }
  if (autoMode.phase === "missing") {
    return {
      label: "补齐并继续",
      instruction: `还有 ${requiredMissingCount} 个必需项需要确认`,
      detail: "填写下方缺失信息，AI 会重新检查完整性。",
      icon: "list-checks",
      disabled: false,
    };
  }
  if (autoMode.phase === "ready") {
    return {
      label: "生成最终文档",
      instruction: "会议信息已满足生成条件",
      detail: "AI 将整理执行摘要、行动项、决策和风险。",
      icon: "file-check-2",
      disabled: false,
    };
  }
  if (autoMode.phase === "final") {
    return {
      label: "下载最终文档",
      instruction: "最终会议文档已经生成",
      detail: "文档以 Markdown 格式导出，可直接归档或继续编辑。",
      icon: "download",
      disabled: false,
    };
  }
  return {
    label: "开始 AI 处理",
    instruction: "先投入会议材料",
    detail: "支持 TXT、MD、PDF、DOCX、PPTX 和常见音频文件。",
    icon: "wand-sparkles",
    disabled: false,
  };
}

function renderAutoMain(requiredMissing) {
  if (autoMode.phase === "processing") {
    return `
      <div class="auto-processing-panel">
        <span class="auto-processing-orbit">${icon("sparkles")}</span>
        <h2>${escapeHTML(autoMode.progressText || "AI 正在分析会议材料")}</h2>
        <p>正在解析文档、识别发言、提取行动项并检查完整性。</p>
        <div class="auto-processing-bar"><span></span></div>
        ${renderAutoFileList()}
      </div>
    `;
  }

  if (autoMode.phase === "missing") {
    return `
      <div class="auto-section-head">
        <div>
          <span class="auto-kicker">COMPLETENESS CHECK</span>
          <h2>补齐必要信息</h2>
        </div>
        <span class="auto-score">${autoMode.completeness?.score ?? 0}%</span>
      </div>
      <div class="auto-missing-list">
        ${(autoMode.completeness?.missing || [])
          .map((entry) => renderAutoMissingItem(entry))
          .join("")}
      </div>
    `;
  }

  if (autoMode.phase === "ready") {
    return `
      <div class="auto-ready-panel">
        <span class="auto-ready-mark">${icon("badge-check")}</span>
        <h2>完整性检查通过</h2>
        <p>会议标题、参会人、行动项负责人和截止时间已满足生成条件。</p>
        <div class="auto-ready-metrics">
          ${autoMetric("行动项", state.tasks.length)}
          ${autoMetric("决策", state.decisions.length)}
          ${autoMetric("风险", state.risks.length)}
          ${autoMetric("完成度", `${autoMode.completeness?.score ?? 0}%`)}
        </div>
      </div>
    `;
  }

  if (autoMode.phase === "final") {
    return `
      <div class="auto-section-head">
        <div>
          <span class="auto-kicker">FINAL DOCUMENT</span>
          <h2>最终会议文档</h2>
        </div>
        <span class="auto-score">已生成</span>
      </div>
      <pre class="auto-document-preview">${escapeHTML(autoMode.finalDocument)}</pre>
    `;
  }

  return `
    <div class="auto-section-head">
      <div>
        <span class="auto-kicker">INPUT MATERIALS</span>
        <h2>投入会议材料</h2>
      </div>
      <div class="auto-section-tools">
        <span class="auto-score">${autoMode.files.length} 个文件</span>
        <button class="ghost-button auto-demo-button" type="button" data-action="load-auto-demo">
          ${icon("file-plus-2")}
          载入演示文件
        </button>
      </div>
    </div>
    <label class="auto-dropzone" id="auto-dropzone">
      <input id="auto-files" type="file" multiple accept=".txt,.md,.csv,.json,.pdf,.docx,.pptx,audio/*,.mp3,.wav,.m4a,.webm,.ogg,.aac,.flac">
      <span>
        ${icon("files")}
        <strong>选择或拖入演示文档与录音</strong>
        <small>文档：TXT MD CSV JSON PDF DOCX PPTX · 录音：MP3 WAV M4A WEBM</small>
      </span>
    </label>
    ${renderAutoFileList()}
    <div class="auto-form-grid">
      <label class="field">
        <span class="field-label">会议标题</span>
        <input id="auto-title" type="text" value="${escapeHTML(autoMode.title)}" placeholder="例如：客户交付周会">
      </label>
      <label class="field">
        <span class="field-label">会议日期</span>
        <input id="auto-date" type="date" value="${escapeHTML(autoMode.date)}">
      </label>
      <label class="field full">
        <span class="field-label">参会人员</span>
        <input id="auto-participants" type="text" value="${escapeHTML(autoMode.participantsText)}" placeholder="用顿号或逗号分隔，例如：陈晨、林晓、周远">
      </label>
      <label class="field full">
        <span class="field-label">人工补充记录</span>
        <textarea id="auto-manual-text" placeholder="可粘贴会议文字、聊天记录或补充上下文">${escapeHTML(autoMode.manualText)}</textarea>
      </label>
    </div>
  `;
}

function renderAutoFileList() {
  if (!autoMode.files.length) {
    return `<div class="auto-empty">尚未投入文件</div>`;
  }
  return `
    <div class="auto-file-list">
      ${autoMode.files
        .map((file) => {
          const ext = `.${file.name.split(".").pop()?.toLowerCase()}`;
          const kind = AUDIO_EXTENSIONS.has(ext) ? "录音" : "文档";
          return `
            <div class="auto-file-item">
              <span class="auto-file-icon">${icon(AUDIO_EXTENSIONS.has(ext) ? "audio-lines" : "file-text")}</span>
              <div>
                <strong>${escapeHTML(file.name)}</strong>
                <small>${kind} · ${formatFileSize(file.size)}</small>
              </div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderAutoMissingItem(entry) {
  const input = renderAutoMissingInput(entry);
  return `
    <div class="auto-missing-item ${entry.severity}">
      <span class="auto-missing-icon">${icon(entry.severity === "required" ? "circle-alert" : "info")}</span>
      <div class="auto-missing-copy">
        <div class="entry-top">
          <strong>${escapeHTML(entry.message)}</strong>
          <span class="severity ${entry.severity === "required" ? "high" : "medium"}">${entry.severity === "required" ? "必需" : "建议"}</span>
        </div>
        <p>${escapeHTML(entry.suggestedAction)}</p>
        ${input}
      </div>
    </div>
  `;
}

function renderAutoMissingInput(entry) {
  const current = autoMode.resolutions[entry.id] ?? missingDefaultValue(entry);
  if (entry.field === "date" || entry.field === "due") {
    return `<input class="auto-resolution-input" data-auto-resolution="${escapeHTML(entry.id)}" type="date" value="${escapeHTML(normalizeDate(current))}">`;
  }
  if (["title", "participants", "owner", "source"].includes(entry.field)) {
    return `<input class="auto-resolution-input" data-auto-resolution="${escapeHTML(entry.id)}" type="text" value="${escapeHTML(current)}" placeholder="${escapeHTML(entry.suggestedAction)}">`;
  }
  return `<div class="auto-guidance">${escapeHTML(entry.suggestedAction)}</div>`;
}

function missingDefaultValue(entry) {
  if (entry.entityType === "meeting") {
    const mapping = {
      title: state.meeting.title,
      date: state.meeting.date,
      participants: (state.meeting.participants || []).join("、"),
      transcript: state.meeting.transcript,
    };
    return mapping[entry.field] || "";
  }
  const task = state.tasks.find((item) => item.id === entry.entityId);
  return task?.[entry.field] || "";
}

function renderAutoStatus() {
  const completeness = autoMode.completeness;
  return `
    <section class="auto-status-block">
      <div class="auto-status-title">${icon("server-cog")}后端处理状态</div>
      <div class="auto-capability-list">
        ${autoCapability("document-extraction", "文档解析", autoMode.documents.length)}
        ${autoCapability("audio-lines", "录音转写", autoMode.audioTranscripts.length)}
        ${autoCapability("list-checks", "完整性检查", completeness ? `${completeness.score}%` : "待处理")}
        ${autoCapability("file-check-2", "最终文档", autoMode.phase === "final" ? "已生成" : "待生成")}
      </div>
    </section>
    <section class="auto-status-block">
      <div class="auto-status-title">${icon("paperclip")}已投入材料</div>
      <div class="auto-source-count">
        <strong>${autoMode.files.length}</strong>
        <span>个文件</span>
      </div>
      <div class="auto-source-detail">
        <span>${autoMode.documents.length} 个文档已解析</span>
        <span>${autoMode.audioTranscripts.length} 段录音已转写</span>
        <span>${autoMode.manualText.trim() ? "包含人工补充" : "无人工补充"}</span>
      </div>
    </section>
    ${
      autoMode.errors.length
        ? `
          <section class="auto-status-block auto-error-block">
            <div class="auto-status-title">${icon("triangle-alert")}需要处理</div>
            ${autoMode.errors.map((error) => `<p>${escapeHTML(error)}</p>`).join("")}
          </section>
        `
        : ""
    }
  `;
}

function autoCapability(iconName, label, value) {
  return `
    <div class="auto-capability">
      <span>${icon(iconName)}${escapeHTML(label)}</span>
      <strong>${escapeHTML(value)}</strong>
    </div>
  `;
}

function autoMetric(label, value) {
  return `<div><strong>${escapeHTML(value)}</strong><span>${escapeHTML(label)}</span></div>`;
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function addAutoFiles(fileList) {
  const incoming = Array.from(fileList || []);
  for (const file of incoming) {
    const ext = `.${file.name.split(".").pop()?.toLowerCase()}`;
    if (!AUDIO_EXTENSIONS.has(ext) && !DOCUMENT_EXTENSIONS.has(ext)) {
      autoMode.errors.push(`不支持的文件类型：${file.name}`);
      continue;
    }
    if (
      !autoMode.files.some(
        (existing) => existing.name === file.name && existing.size === file.size,
      )
    ) {
      autoMode.files.push(file);
    }
  }
  renderWithTransition();
}

async function loadAutoDemoMaterial() {
  if (autoMode.phase !== "input") return;
  if (!backendAvailable) {
    showToast("演示文件需要后端服务。", "server-off");
    return;
  }

  try {
    const payload = await apiRequest("/demo/auto-material", { timeout: 8000 });
    const demo = payload.material;
    if (!demo?.filename || typeof demo.content !== "string" || !demo.content.trim()) {
      throw new Error("演示材料格式无效。");
    }

    const file = new File(
      [demo.content],
      demo.filename,
      {
        type: demo.mimeType || "text/plain;charset=utf-8",
        lastModified: Date.now(),
      },
    );
    if (!autoMode.title.trim() && demo.suggestedTitle) {
      autoMode.title = demo.suggestedTitle;
    }
    if (!autoMode.date && demo.suggestedDate) autoMode.date = demo.suggestedDate;
    if (!autoMode.participantsText.trim() && Array.isArray(demo.suggestedParticipants)) {
      autoMode.participantsText = demo.suggestedParticipants.join("、");
    }
    addAutoFiles([file]);
    showToast("演示文件已载入。", "file-check-2");
  } catch (error) {
    showToast(`演示文件载入失败：${error.message}`, "server-off");
  }
}

async function handleAutoPrimary() {
  if (autoMode.phase === "processing") return;
  if (autoMode.phase === "final") {
    downloadFile(
      `${safeFilename(state.meeting.title)}_最终会议文档.md`,
      autoMode.finalDocument,
      "text/markdown;charset=utf-8",
    );
    showToast("最终会议文档已下载。", "download");
    return;
  }
  if (autoMode.phase === "input") {
    if (!autoMode.files.length && !autoMode.manualText.trim()) {
      showToast("请先投入演示文档、录音或人工记录。", "alert-circle");
      return;
    }
    if (!backendAvailable) {
      showToast("AI 自动模式需要后端服务。", "server-off");
      return;
    }
    autoMode.errors = [];
    autoMode.phase = "processing";
    autoMode.progressText = "正在读取会议材料";
    renderWithTransition();
    await processAutoMaterials();
    return;
  }
  if (autoMode.phase === "missing") {
    await resolveAutoMissing();
    return;
  }
  if (autoMode.phase === "ready") {
    await loadFinalDocument();
  }
}

async function processAutoMaterials() {
  autoMode.documents = [];
  autoMode.audioTranscripts = [];
  try {
    for (let index = 0; index < autoMode.files.length; index += 1) {
      const file = autoMode.files[index];
      const ext = `.${file.name.split(".").pop()?.toLowerCase()}`;
      const isAudio = AUDIO_EXTENSIONS.has(ext);
      autoMode.progressText = isAudio
        ? `正在转写录音 ${index + 1}/${autoMode.files.length}：${file.name}`
        : `正在解析文档 ${index + 1}/${autoMode.files.length}：${file.name}`;
      renderWithTransition();
      const formData = new FormData();
      formData.append("file", file, file.name);
      if (isAudio) {
        formData.append("diarize", "true");
        formData.append("language", "zh");
        try {
          const result = await apiUpload("/audio/transcribe", formData);
          autoMode.audioTranscripts.push(result.audio);
        } catch (error) {
          if (error.code === "transcription_not_configured") {
            autoMode.errors.push(
              "录音转写未配置：请在本机设置 OPENAI_API_KEY 后重启后端。",
            );
          } else {
            autoMode.errors.push(`${file.name} 转写失败：${error.message}`);
          }
        }
      } else {
        try {
          const result = await apiUpload("/materials/extract", formData);
          autoMode.documents.push(result.material);
        } catch (error) {
          autoMode.errors.push(`${file.name} 解析失败：${error.message}`);
        }
      }
    }

    if (
      !autoMode.documents.length &&
      !autoMode.audioTranscripts.length &&
      !autoMode.manualText.trim()
    ) {
      autoMode.phase = "input";
      renderWithTransition();
      showToast("没有获得可用的会议文本，请查看右侧错误提示。", "alert-circle");
      return;
    }

    autoMode.progressText = "正在生成会议记录与行动项";
    renderWithTransition();
    const participants = parseParticipantNames(autoMode.participantsText);
    const payload = await apiRequest("/meetings/compose", {
      method: "POST",
      body: {
        title: autoMode.title,
        date: autoMode.date,
        participants,
        documents: autoMode.documents,
        audioTranscripts: autoMode.audioTranscripts,
        manualText: autoMode.manualText,
      },
    });
    applyServerState(payload.state);
    autoMode.completeness = payload.completeness;
    autoMode.sourceStats = payload.sourceStats;
    autoMode.title = state.meeting.title || autoMode.title;
    autoMode.date = state.meeting.date || autoMode.date;
    autoMode.participantsText =
      (state.meeting.participants || []).join("、") || autoMode.participantsText;
    autoMode.phase = payload.completeness?.ready ? "ready" : "missing";
    autoMode.resolutions = {};
    renderWithTransition();
    showToast(
      payload.completeness?.ready
        ? "会议内容已生成，完整性检查通过。"
        : "会议内容已生成，请补齐缺失项。",
      payload.completeness?.ready ? "badge-check" : "list-checks",
    );
  } catch (error) {
    autoMode.errors.push(error.message || "AI 处理失败。");
    autoMode.phase = "input";
    renderWithTransition();
    showToast("AI 处理中断，请检查后端或材料格式。", "alert-circle");
  }
}

async function resolveAutoMissing() {
  const meetingPayload = {};
  const taskPayloads = {};
  for (const [id, value] of Object.entries(autoMode.resolutions)) {
    const [entityType, entityId, field] = id.split(":");
    if (!value) continue;
    if (entityType === "meeting") {
      if (field === "participants") {
        meetingPayload.participants = parseParticipantNames(value);
      } else {
        meetingPayload[field] = value;
      }
    } else if (entityType === "task") {
      taskPayloads[entityId] = taskPayloads[entityId] || {};
      taskPayloads[entityId][field] = value;
    }
  }

  try {
    if (Object.keys(meetingPayload).length) {
      const result = await apiRequest("/meetings/current", {
        method: "PUT",
        body: meetingPayload,
      });
      applyServerState(result.state);
    }
    for (const [taskId, payload] of Object.entries(taskPayloads)) {
      await apiRequest(`/tasks/${encodeURIComponent(taskId)}`, {
        method: "PUT",
        body: payload,
      });
    }
    const result = await apiRequest("/meetings/completeness");
    applyServerState(result.state);
    autoMode.completeness = result.completeness;
    autoMode.resolutions = {};
    autoMode.phase = result.completeness.ready ? "ready" : "missing";
    renderWithTransition();
    showToast(
      result.completeness.ready ? "必需信息已补齐。" : "还有缺失项需要确认。",
      result.completeness.ready ? "badge-check" : "circle-alert",
    );
  } catch (error) {
    showToast(`缺失项保存失败：${error.message}`, "alert-circle");
  }
}

async function loadFinalDocument() {
  try {
    const result = await apiRequest("/meetings/final-document");
    autoMode.completeness = result.completeness;
    autoMode.finalDocument = result.document;
    autoMode.phase = "final";
    renderWithTransition();
    showToast("最终会议文档已生成。", "file-check-2");
  } catch (error) {
    showToast(`最终文档生成失败：${error.message}`, "alert-circle");
  }
}

function parseParticipantNames(value) {
  return String(value || "")
    .split(/[、,，/\s]+/)
    .map((name) => name.trim())
    .filter(Boolean);
}

function activeTaskCount() {
  return state.tasks.filter((task) => task.status !== "done").length;
}

function openMeetingSwitcher() {
  openModal(`
    <div class="modal small" role="dialog" aria-modal="true" aria-labelledby="meeting-switcher-title">
      <div class="modal-head">
        <div>
          <h2 id="meeting-switcher-title">切换会议</h2>
          <p>选择已保存的会议，任务、决策和风险会同步切换。</p>
        </div>
        <button class="modal-close" type="button" data-close-modal aria-label="关闭">${icon("x")}</button>
      </div>
      <div class="modal-body">
        <div class="modal-loading" id="meeting-list-loading">
          <div>${icon("loader-circle")}<span>正在读取会议</span></div>
        </div>
        <div class="meeting-list" id="meeting-list"></div>
      </div>
      <div class="modal-foot">
        <span class="panel-subtitle">${backendAvailable ? "会议保存在 SQLite" : "当前为本地模式"}</span>
        <div class="modal-foot-actions">
          <button class="primary-button" type="button" data-action="new-meeting">
            ${icon("plus")}
            <span>新建会议</span>
          </button>
        </div>
      </div>
    </div>
  `);
  loadMeetingList();
}

async function loadMeetingList() {
  let payload;
  if (backendAvailable) {
    try {
      payload = await apiRequest("/meetings");
    } catch {
      payload = null;
    }
  }
  if (!payload) {
    payload = {
      activeId: state.meeting.id || "local",
      meetings: [
        {
          id: state.meeting.id || "local",
          title: state.meeting.title,
          date: state.meeting.date,
          updatedAt: state.meeting.updatedAt || "当前",
          taskCount: state.tasks.length,
        },
      ],
    };
  }
  payload.activeId = state.meeting.id;
  renderMeetingList(payload);
}

function renderMeetingList(payload) {
  const loading = document.getElementById("meeting-list-loading");
  const list = document.getElementById("meeting-list");
  if (!list) return;
  loading?.remove();
  const meetings = Array.isArray(payload.meetings) ? payload.meetings : [];
  list.innerHTML = meetings.length
    ? meetings
        .map(
          (meeting) => `
            <button class="meeting-option ${meeting.id === payload.activeId ? "is-active" : ""}" type="button" data-meeting-id="${escapeHTML(meeting.id)}">
              <span class="meeting-option-icon">${icon("calendar-days")}</span>
              <span class="meeting-option-copy">
                <strong>${escapeHTML(meeting.title)}</strong>
                <small>${escapeHTML(formatLongDate(meeting.date))} · ${escapeHTML(meeting.updatedAt || "")}</small>
              </span>
              <span class="meeting-option-count">${meeting.taskCount ?? 0}项行动</span>
            </button>
          `,
        )
        .join("")
    : `<div class="empty-column">暂无会议</div>`;
  refreshIcons();
}

async function activateMeeting(meetingId) {
  if (localStorage.getItem("shiling_unsynced") === "1") {
    if (!window.confirm("有未同步的本机修改。请先导出 JSON 备份。确定放弃本机修改并重新读取服务器上的会议吗？")) return;
    try {
      const serverState = await apiRequest(`/state?meetingId=${encodeURIComponent(meetingId)}`);
      localStorage.removeItem("shiling_unsynced");
      writeFailed = false;
      applyServerState(serverState);
      closeModal(true);
      renderWithTransition();
      showToast("已重新读取服务器会议。", "calendar-check-2");
    } catch {
      showToast("无法读取服务器，本机修改仍然保留。", "alert-circle");
    }
    return;
  }
  if (!backendAvailable || meetingId === "local") {
    closeModal();
    return;
  }
  try {
    const payload = await apiRequest(
      `/meetings/${encodeURIComponent(meetingId)}/activate`,
      { method: "POST", body: {} },
    );
    applyServerState(payload.state);
    closeModal(true);
    renderWithTransition();
    showToast("已切换会议。", "calendar-check-2");
  } catch {
    showToast("会议切换失败，请检查后端连接。", "alert-circle");
  }
}

function openImportModal() {
  const currentText = state.meeting.transcript || "";
  openModal(`
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="import-title">
      <div class="modal-head">
        <div>
          <h2 id="import-title">导入会议记录</h2>
          <p>支持粘贴文本或导入 TXT、MD 文件；启用模型时内容会发送至配置的模型服务。</p>
        </div>
        <button class="modal-close" type="button" data-close-modal aria-label="关闭">${icon("x")}</button>
      </div>
      <div class="modal-body">
        <div class="field full">
          <label for="meeting-file">会议文件</label>
          <label class="import-dropzone" id="import-dropzone">
            <input id="meeting-file" type="file" accept=".txt,.md,text/plain,text/markdown">
            <span>
              ${icon("file-up")}
              <strong>选择或拖入会议文本</strong>
              <small>TXT、MD，最大 2MB</small>
            </span>
          </label>
        </div>
        <div class="field full" style="margin-top:14px">
          <div class="entry-top">
            <label for="meeting-input">会议原文</label>
            <button class="ghost-button" id="load-sample-btn" type="button">${icon("sparkles")}载入示例会议</button>
          </div>
          <textarea class="transcript-input" id="meeting-input" placeholder="粘贴包含负责人、截止时间和决策的会议记录">${escapeHTML(currentText)}</textarea>
        </div>
      </div>
      <div class="modal-foot">
        <span class="panel-subtitle">本地提取 · 不上传原文</span>
        <div class="modal-foot-actions">
          <button class="secondary-button" type="button" data-close-modal>取消</button>
          <button class="primary-button" id="extract-btn" type="button">
            ${icon("wand-sparkles")}
            <span>开始提取</span>
          </button>
        </div>
      </div>
    </div>
  `);
}

function openTaskEditor(taskId = "", defaultStatus = "todo") {
  const task = state.tasks.find((item) => item.id === taskId);
  const isEdit = Boolean(task);
  const editing = task || {
    id: "",
    title: "",
    owner: "",
    due: "",
    priority: "medium",
    status: defaultStatus,
    source: "",
    notes: "",
  };

  openModal(`
    <div class="modal small" role="dialog" aria-modal="true" aria-labelledby="task-editor-title">
      <form id="task-form">
        <div class="modal-head">
          <div>
            <h2 id="task-editor-title">${isEdit ? "编辑任务" : "新建任务"}</h2>
            <p>${isEdit ? "调整负责人、截止时间和任务状态。" : "创建一项可追踪的行动。"}</p>
          </div>
          <button class="modal-close" type="button" data-close-modal aria-label="关闭">${icon("x")}</button>
        </div>
        <div class="modal-body">
          <input type="hidden" name="id" value="${escapeHTML(editing.id)}">
          <div class="editor-grid">
            <div class="field full">
              <label for="task-title">任务标题</label>
              <input id="task-title" name="title" type="text" value="${escapeHTML(editing.title)}" placeholder="明确可交付的任务" required maxlength="80">
            </div>
            <div class="field">
              <label for="task-owner">负责人</label>
              <input id="task-owner" name="owner" type="text" value="${escapeHTML(editing.owner)}" placeholder="姓名" maxlength="20">
            </div>
            <div class="field">
              <label for="task-due">截止时间</label>
              <input id="task-due" name="due" type="date" value="${escapeHTML(dateInputValue(editing.due))}">
            </div>
            <div class="field">
              <label for="task-priority">优先级</label>
              <select id="task-priority" name="priority">
                ${Object.entries(PRIORITY_META).map(([value, meta]) => `<option value="${value}" ${editing.priority === value ? "selected" : ""}>${meta.label}</option>`).join("")}
              </select>
            </div>
            <div class="field">
              <label for="task-status">状态</label>
              <select id="task-status" name="status">
                ${Object.entries(STATUS_META).map(([value, meta]) => `<option value="${value}" ${editing.status === value ? "selected" : ""}>${meta.label}</option>`).join("")}
              </select>
            </div>
            <div class="field full">
              <label for="task-notes">备注</label>
              <textarea id="task-notes" name="notes" placeholder="验收标准、依赖或补充信息">${escapeHTML(editing.notes || "")}</textarea>
            </div>
            ${editing.source ? `<div class="field full"><span class="field-label">会议依据</span><p class="entry-source">${escapeHTML(editing.source)}</p></div>` : ""}
            ${isEdit ? `<div class="field full" id="task-comments" data-task-id="${escapeHTML(editing.id)}">
              <span class="field-label">任务评论</span>
              <div id="comment-list" aria-live="polite">${backendAvailable ? "正在加载评论…" : "连接后端后可查看评论。"}</div>
              ${backendAvailable ? `<input id="comment-author" type="text" maxlength="30" placeholder="你的名字（可选）" aria-label="评论作者">
              <textarea id="comment-body" maxlength="2000" placeholder="添加跟进进展或问题" aria-label="评论内容"></textarea>
              <button class="secondary-button" id="submit-comment" type="button">发表评论</button>` : ""}
            </div>` : ""}
          </div>
        </div>
        <div class="modal-foot">
          <div>
            ${isEdit ? `<button class="danger-button" type="button" data-delete-task="${escapeHTML(editing.id)}">${icon("trash-2")}删除任务</button>` : ""}
          </div>
          <div class="modal-foot-actions">
            <button class="secondary-button" type="button" data-close-modal>取消</button>
            <button class="primary-button" type="button" data-save-task>${icon("check")}保存任务</button>
          </div>
        </div>
      </form>
    </div>
  `);
  if (isEdit && backendAvailable) loadTaskComments(editing.id);
  setTimeout(() => document.getElementById("task-title")?.focus(), 50);
}

async function loadTaskComments(taskId) {
  const panel = document.getElementById("task-comments");
  try {
    const payload = await apiRequest(`/tasks/${encodeURIComponent(taskId)}/comments`);
    if (!panel?.isConnected) return;
    const list = panel.querySelector("#comment-list");
    list.innerHTML = payload.comments.length
      ? payload.comments.map((comment) => `<div class="task-comment"><strong>${escapeHTML(comment.author)}</strong> <small>${escapeHTML(comment.created_at)}</small><p>${escapeHTML(comment.body)}</p></div>`).join("")
      : '<p class="panel-subtitle">暂无评论。</p>';
  } catch {
    if (panel?.isConnected) panel.querySelector("#comment-list").textContent = "评论加载失败，请重新打开任务重试。";
  }
}

async function submitTaskComment(button) {
  const panel = button.closest("#task-comments");
  const body = panel.querySelector("#comment-body");
  const text = body.value.trim();
  if (!text) return showToast("请输入评论内容。", "alert-circle");
  button.disabled = true;
  try {
    await apiRequest(`/tasks/${encodeURIComponent(panel.dataset.taskId)}/comments`, {
      method: "POST", body: { author: panel.querySelector("#comment-author").value.trim(), body: text },
    });
    if (!panel.isConnected) return;
    body.value = "";
    await loadTaskComments(panel.dataset.taskId);
    showToast("评论已保存。", "check-circle-2");
  } catch {
    if (panel.isConnected) showToast("评论保存失败，请重试。", "alert-circle");
  } finally {
    button.disabled = false;
  }
}

function openModal(innerHtml) {
  const root = document.getElementById("modal-root");
  root.innerHTML = `<div class="modal-backdrop" data-modal-backdrop>${innerHtml}</div>`;
  document.body.style.overflow = "hidden";
  refreshIcons();
}

function closeModal(immediate = false) {
  const root = document.getElementById("modal-root");
  const backdrop = root?.querySelector(".modal-backdrop");
  if (!backdrop || modalClosing) return;

  if (immediate) {
    root.innerHTML = "";
    document.body.style.overflow = "";
    return;
  }

  modalClosing = true;
  backdrop.classList.add("is-closing");
  backdrop.querySelector(".modal")?.classList.add("is-closing");
  window.setTimeout(() => {
    root.innerHTML = "";
    document.body.style.overflow = "";
    modalClosing = false;
  }, 170);
}

async function runExtraction() {
  if (localStorage.getItem("shiling_unsynced") === "1") {
    showToast("有未同步的本机修改，请先导出 JSON 备份。", "alert-circle");
    return;
  }
  const input = document.getElementById("meeting-input");
  const text = input?.value.trim() || "";
  if (text.length < 30) {
    showToast("会议内容过短，请补充负责人、截止时间或行动项。", "alert-circle");
    input?.focus();
    return;
  }

  const body = document.querySelector(".modal-body");
  const footer = document.querySelector(".modal-foot");
  if (!body) return;

  const steps = [
    ["识别会议结构和参与人", "scan-text"],
    ["提取行动项与负责人", "users"],
    ["归一截止时间和优先级", "calendar-clock"],
    ["识别决策与风险", "shield-alert"],
    ["生成任务看板", "layout-dashboard"],
  ];

  body.innerHTML = `
    <div class="processing" id="processing-list">
      ${steps.map(([label, iconName], index) => `
        <div class="processing-step" data-step="${index}">
          <span class="processing-dot">${icon(iconName)}</span>
          <span>${label}</span>
        </div>
      `).join("")}
    </div>
  `;
  if (footer) {
    footer.innerHTML = `<span class="panel-subtitle">${backendAvailable ? "后端正在分析会议文本" : "正在本地分析会议文本"}</span><div class="modal-foot-actions"><button class="secondary-button" type="button" data-close-modal>取消</button></div>`;
  }
  refreshIcons();

  let serverRequest = null;
  if (backendAvailable) {
    serverRequest = apiRequest("/meetings/extract", {
      method: "POST",
      body: { transcript: text },
      timeout: 60000,
    }).then((payload) => ({ payload }), (error) => ({ error }));
  }

  for (let index = 0; index < steps.length; index += 1) {
    const step = document.querySelector(`[data-step="${index}"]`);
    step?.classList.add("is-active");
    await wait(260 + index * 40);
    step?.classList.remove("is-active");
    step?.classList.add("is-complete");
    step && (step.querySelector(".processing-dot").innerHTML = icon("check"));
  }

  let result;
  let usedBackend = false;
  if (serverRequest) {
    try {
      const { payload, error } = await serverRequest;
      if (error) throw error;
      applyServerState(payload.state);
      result = { tasks: state.tasks, risks: state.risks };
      usedBackend = true;
    } catch {
      closeModal(true);
      showToast("提取请求未完成，请检查会议列表后再重试。", "alert-circle");
      return;
    }
  } else {
    result = extractMeeting(text);
  }

  if (!usedBackend) {
    state.meeting = result.meeting;
    state.tasks = result.tasks;
    state.decisions = result.decisions;
    state.risks = result.risks;
    trackWrite(null);
  }
  state.ownerFilter = "all";
  state.query = "";
  state.view = "board";
  saveState();
  closeModal(true);
  renderWithTransition();
  showToast(
    `已生成 ${result.tasks.length} 项行动和 ${result.risks.length} 项风险${usedBackend ? "，并写入数据库" : ""}。`,
    "check-circle-2",
  );
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function extractMeeting(text) {
  const rawLines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const parsedLines = rawLines.map((line) => {
    const speakerMatch = line.match(/^([\p{L}\w]{2,12})[：:]\s*(.+)$/u);
    return {
      original: line,
      speaker: speakerMatch?.[1] || "",
      body: speakerMatch?.[2] || line,
    };
  });

  const participantLine = rawLines.find((line) => /^参会[：:]/.test(line));
  const participants = participantLine
    ? participantLine
        .replace(/^参会[：:]/, "")
        .split(/[、,，/]/)
        .map((name) => name.trim())
        .filter(Boolean)
    : [...new Set(parsedLines.map((line) => line.speaker).filter(Boolean))];

  const dateLine = rawLines.find((line) => /日期[：:]/.test(line));
  const dateText = dateLine ? dateLine.replace(/^日期[：:]/, "") : rawLines.join(" ");
  const meetingDate = parseMeetingDate(dateText) || normalizeDate(new Date().toISOString().slice(0, 10));
  const titleLine = rawLines.find(
    (line) => !/^日期[：:]/.test(line) && !/^参会[：:]/.test(line) && /周会|会议|评审|复盘|讨论/.test(line),
  );
  const title = titleLine || "新建会议";

  const sentences = [];
  parsedLines.forEach((line) => {
    const body = line.body.trim();
    if (body === title.trim() || /^(日期|参会)[：:]/.test(body)) return;
    if (body.startsWith("#") || /^\[(演示文档|录音转写|人工补充)/.test(body)) {
      return;
    }
    line.body
      .split(/[。！？!?；;]+/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 4)
      .forEach((part) => {
        sentences.push({ speaker: line.speaker, text: part, original: line.original });
      });
  });

  const tasks = [];
  const decisions = [];
  const risks = [];
  const taskTitles = new Set();
  const decisionTexts = new Set();
  const riskTitles = new Set();

  sentences.forEach((sentence, index) => {
    const textValue = cleanSentence(sentence.text);
    const decision = detectDecision(textValue);
    const risk = detectRisk(textValue);
    const taskCandidate = detectTask(textValue);

    if (decision && !decisionTexts.has(decision)) {
      decisionTexts.add(decision);
      decisions.push({
        id: `d-${index + 1}`,
        text: decision,
        source: sentence.text,
      });
    }

    if (risk && !riskTitles.has(risk)) {
      riskTitles.add(risk);
      risks.push({
        id: `r-${index + 1}`,
        title: risk,
        severity: /阻塞|高风险|冲突|不上线|无法|故障|低于|门槛|缺少|缺|回滚/.test(textValue) ? "high" : "medium",
        source: sentence.text,
      });
    }

    if (taskCandidate) {
      const owner = extractOwner(textValue, sentence.speaker, participants);
      const due = extractDueDate(textValue, meetingDate);
      const priority = /必须|紧急|尽快|上线门槛|阻塞|硬截止|风险|冲突|不上线/.test(textValue) ? "high" : "medium";
      const titleValue = extractTaskTitle(textValue, owner);
      const key = normalizeKey(titleValue);
      if (titleValue.length >= 4 && !taskTitles.has(key)) {
        taskTitles.add(key);
        tasks.push({
          id: `t-${index + 1}`,
          title: titleValue,
          owner,
          due,
          priority,
          status: due && owner ? "todo" : "backlog",
          source: sentence.text,
          notes: "",
          tags: inferTags(textValue),
        });
      }
    }
  });

  if (!tasks.length) {
    const fallbackSentence = sentences.find((sentence) => /请|完成|整理|确认|提交|负责/.test(sentence.text));
    if (fallbackSentence) {
      tasks.push({
        id: "t-1",
        title: extractTaskTitle(cleanSentence(fallbackSentence.text), extractOwner(fallbackSentence.text, fallbackSentence.speaker, participants)),
        owner: extractOwner(fallbackSentence.text, fallbackSentence.speaker, participants),
        due: extractDueDate(fallbackSentence.text, meetingDate),
        priority: "medium",
        status: "backlog",
        source: fallbackSentence.text,
        notes: "",
        tags: [],
      });
    }
  }

  return {
    meeting: {
      title,
      date: meetingDate,
      participants: participants.length ? participants : ["参会人"],
      transcript: text,
      updatedAt: new Date().toLocaleString("zh-CN", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    },
    tasks,
    decisions,
    risks,
  };
}

function cleanSentence(text) {
  return String(text || "")
    .replace(/^[\s\-—·]+/, "")
    .replace(/^(好的|可以|没问题|收到|明白)[，,。\s]*/, "")
    .trim();
}

function detectTask(text) {
  if (!text) return false;
  if (text.startsWith("#") || /^\[(演示文档|录音转写|人工补充)/.test(text)) return false;
  if (/^(会议|日期|时间|地点|参会|主题)[：:]/.test(text)) return false;
  if (/上线门槛|不上线/.test(text) && !/负责|完成|整理|提交|准备|安排|拉通|补齐/.test(text)) return false;
  if (/设计稿会在.*给到/.test(text)) return false;
  const actionPattern =
    /负责|请[\p{L}\w]{2,4}|需要|完成|整理|输出|准备|对接|确认|提交|更新|安排|推进|测试|录制|发布|做一次|搭建|修复|核对|撰写|设计|开发|报名|邀请|跟进|补齐|拉通|同步|梳理|标记|验收|交付|导入|回滚|检查|落实|关闭/;
  if (!actionPattern.test(text)) return false;
  if (
    /风险|阻塞|担心|问题|冲突|不稳定|缺少|缺|依赖|来不及|延迟|未定|不确定|难点|故障|无法|低于|门槛|不上线/.test(
      text,
    ) &&
    !/负责|请[\p{L}\w]{2,4}|完成|整理|补齐|提交|准备|安排|拉通|截止/.test(text)
  ) {
    return false;
  }
  if (/^(决定|确定|统一|拍板|结论)/.test(text) && !/负责|完成|整理|提交|更新|安排/.test(text)) return false;
  return text.length >= 4;
}

function detectDecision(text) {
  if (/必须把|本周必须|必须完成/.test(text) && !/决定|确定|只开放|统一|结论/.test(text)) return null;
  if (!/决定|确定|统一|拍板|结论|采用|只开放|不上线|门槛|为准|必须(?:显示|展示|满足|保留|使用)/.test(text)) {
    return null;
  }
  let value = text
    .replace(/^(决定|确定|统一|结论[：:]?)\s*/, "")
    .replace(/，?这是上线门槛[。]?$/, "")
    .trim();
  if (value.length > 60) value = `${value.slice(0, 58)}…`;
  return value.length >= 4 ? value : null;
}

function detectRisk(text) {
  if (!/风险|阻塞|担心|问题|冲突|不稳定|缺少|缺|依赖|来不及|延迟|未定|不确定|难点|故障|无法|低于|门槛|不上线/.test(text)) {
    return null;
  }
  if (/权限.*冲突/.test(text)) return "部门权限与项目权限存在冲突";
  if (/缺.*回滚/.test(text)) return "知识库导入脚本缺少异常回滚";
  if (/担心.*引用来源/.test(text)) return "销售担心回答缺少引用来源";
  if (/上线门槛/.test(text)) return "回答缺少原文引用展示";
  if (/响应.*不稳定|3秒/.test(text)) return "本地模型响应可能超过3秒";
  if (/准确率低于90/.test(text)) return "回答引用准确率可能低于90%";
  let value = text
    .replace(/^(而且|但是|不过|目前|现在)\s*/, "")
    .replace(/，?存在.*风险[。]?$/, "")
    .trim();
  if (value.length > 46) value = `${value.slice(0, 44)}…`;
  return value.length >= 4 ? value : null;
}

function extractOwner(text, speaker, participants) {
  const explicitPatterns = [
    /请([\p{L}\w]{2,4})(?=在|于|负责|完成|整理|输出|准备|对接|确认|提交|更新|安排|推进|测试|录制|发布|评审|搭建|修复|核对|撰写|设计|开发|上线|报名|邀请|跟进|补齐|拉通|同步)/u,
    /(?:由|让)?([\p{L}\w]{2,4})(?=负责|跟进|牵头|完成|整理|输出|准备|对接|确认|提交|更新|安排|推进|测试|录制|发布|评审|搭建|修复|核对|撰写|设计|开发|上线|报名|邀请|补齐|拉通|同步)/u,
  ];
  for (const pattern of explicitPatterns) {
    const match = text.match(pattern);
    if (match && !["今天", "明天", "我们", "大家", "团队"].includes(match[1])) return match[1];
  }
  if (/我(?:来|负责|会|完成|整理|跟进|处理)/.test(text) && speaker) return speaker;
  if (speaker && participants.includes(speaker)) return speaker;
  const known = participants.find((name) => text.includes(name) && name !== speaker);
  if (known) return known;
  return "";
}

function extractDueDate(text, meetingDate) {
  const fullDate = text.match(/(20\d{2})年?(\d{1,2})月(\d{1,2})日?/);
  if (fullDate) {
    return `${fullDate[1]}-${String(fullDate[2]).padStart(2, "0")}-${String(fullDate[3]).padStart(2, "0")}`;
  }

  const monthDay = text.match(/(\d{1,2})月(\d{1,2})日/);
  if (monthDay) {
    return `${meetingDate.slice(0, 4)}-${String(monthDay[1]).padStart(2, "0")}-${String(monthDay[2]).padStart(2, "0")}`;
  }

  const slashDate = text.match(/(?<!\d)(\d{1,2})\/(\d{1,2})(?!\d)/);
  if (slashDate) {
    return `${meetingDate.slice(0, 4)}-${String(slashDate[1]).padStart(2, "0")}-${String(slashDate[2]).padStart(2, "0")}`;
  }

  const baseDate = new Date(`${meetingDate}T00:00:00`);
  if (Number.isNaN(baseDate.getTime())) return "";

  if (/明天/.test(text)) {
    baseDate.setDate(baseDate.getDate() + 1);
    return normalizeDate(baseDate.toISOString().slice(0, 10));
  }
  if (/后天/.test(text)) {
    baseDate.setDate(baseDate.getDate() + 2);
    return normalizeDate(baseDate.toISOString().slice(0, 10));
  }
  if (/今天/.test(text)) return meetingDate;

  const weekMap = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 };
  const week = text.match(/(本周|下周)([一二三四五六日天])/);
  if (week) {
    const currentDay = baseDate.getDay();
    let delta = weekMap[week[2]] - currentDay;
    if (week[1] === "下周") delta += 7;
    if (week[1] === "本周" && delta < 0) delta += 7;
    baseDate.setDate(baseDate.getDate() + delta);
    return normalizeDate(baseDate.toISOString().slice(0, 10));
  }
  return "";
}

function parseMeetingDate(text) {
  const fullDate = text.match(/(20\d{2})年(\d{1,2})月(\d{1,2})日/);
  if (fullDate) {
    return `${fullDate[1]}-${String(fullDate[2]).padStart(2, "0")}-${String(fullDate[3]).padStart(2, "0")}`;
  }
  const monthDay = text.match(/(\d{1,2})月(\d{1,2})日/);
  if (monthDay) {
    return `${CURRENT_YEAR}-${String(monthDay[1]).padStart(2, "0")}-${String(monthDay[2]).padStart(2, "0")}`;
  }
  return "";
}

function extractTaskTitle(text, owner) {
  let title = text
    .replace(/(20\d{2})年?\d{1,2}月\d{1,2}日(?:前|之前)?/g, "")
    .replace(/\d{1,2}月\d{1,2}日(?:前|之前)?/g, "")
    .replace(/(?:本周|下周)[一二三四五六日天](?:前|之前)?/g, "")
    .replace(/(?:今天|明天|后天)(?:上午|下午|晚上)?/g, "")
    .replace(/^(请|需要|要|由|让|我们|先|再|务必)\s*/, "")
    .replace(/^(在)?\s*/, "")
    .trim();

  if (owner) {
    title = title
      .replace(new RegExp(`^${escapeRegExp(owner)}(?:在|于)?`, "u"), "")
      .replace(new RegExp(`${escapeRegExp(owner)}(?:负责|跟进|牵头|完成|整理|输出|准备|对接|确认|提交|更新|安排|推进|测试|录制|发布|评审|搭建|修复|核对|撰写|设计|开发|上线|报名|邀请|补齐|拉通|同步)`, "u"), "")
      .trim();
  }

  title = title
    .replace(/^(负责|跟进|牵头)\s*/, "")
    .replace(/[，,]\s*$/, "")
    .replace(/^可以[，,]?/, "")
    .trim();

  if (title.length > 44) title = `${title.slice(0, 42)}…`;
  return title || text.slice(0, 44);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeKey(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .replace(/[，,。！？!?；;]/g, "")
    .toLowerCase();
}

function inferTags(text) {
  const tags = [];
  if (/权限/.test(text)) tags.push("权限");
  if (/知识库|文档/.test(text)) tags.push("知识库");
  if (/设计|界面/.test(text)) tags.push("设计");
  if (/上线|评审/.test(text)) tags.push("上线");
  if (/模型|响应|引用/.test(text)) tags.push("模型");
  return tags.length ? tags : ["会议行动"];
}

function handleClick(event) {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) {
    state.view = viewButton.dataset.view;
    renderWithTransition();
    return;
  }

  if (event.target.closest("#meeting-switcher")) {
    openMeetingSwitcher();
    return;
  }

  const meetingOption = event.target.closest("[data-meeting-id]");
  if (meetingOption) {
    activateMeeting(meetingOption.dataset.meetingId);
    return;
  }

  const ownerButton = event.target.closest("[data-owner-filter]");
  if (ownerButton) {
    state.ownerFilter = ownerButton.dataset.ownerFilter;
    renderWithTransition();
    return;
  }

  const editButton = event.target.closest("[data-edit-task]");
  if (editButton) {
    event.stopPropagation();
    openTaskEditor(editButton.dataset.editTask);
    return;
  }

  const taskCard = event.target.closest(".task-card");
  if (taskCard) {
    openTaskEditor(taskCard.dataset.taskId);
    return;
  }

  const addButton = event.target.closest("[data-add-status]");
  if (addButton) {
    openTaskEditor("", addButton.dataset.addStatus);
    return;
  }

  const actionButton = event.target.closest("[data-action]");
  if (actionButton) {
    const action = actionButton.dataset.action;
    if (action === "import-meeting") openImportModal();
    if (action === "add-task") openTaskEditor("", "todo");
    if (action === "view-columns") {
      state.compact = false;
      renderWithTransition();
    }
    if (action === "view-list") {
      state.compact = true;
      renderWithTransition();
    }
    if (action === "copy-summary") copySummary();
    if (action === "export-md") exportMarkdown();
    if (action === "load-auto-demo") loadAutoDemoMaterial();
    if (action === "auto-primary") handleAutoPrimary();
    if (action === "new-meeting") {
      closeModal(true);
      openImportModal();
    }
    return;
  }

  const convertButton = event.target.closest("[data-convert-type]");
  if (convertButton) {
    convertToTask(convertButton.dataset.convertType, convertButton.dataset.convertId);
    return;
  }

  const commentButton = event.target.closest("#submit-comment");
  if (commentButton) {
    submitTaskComment(commentButton);
    return;
  }

  if (event.target.closest("[data-save-task]")) {
    saveTaskFromForm();
    return;
  }

  if (event.target.closest("[data-close-modal]")) {
    closeModal();
    return;
  }

  const backdrop = event.target.closest("[data-modal-backdrop]");
  if (backdrop && event.target === backdrop) {
    closeModal();
    return;
  }

  if (event.target.closest("#load-sample-btn")) {
    const input = document.getElementById("meeting-input");
    if (input) {
      input.value = SAMPLE_TRANSCRIPT;
      input.focus();
    }
    return;
  }

  if (event.target.closest("#extract-btn")) {
    runExtraction();
    return;
  }

  if (event.target.closest("#reset-demo-btn")) {
    if (pendingWrites) {
      showToast("正在保存修改，请稍后再试。", "alert-circle");
      return;
    }
    if (localStorage.getItem("shiling_unsynced") === "1") {
      if (!window.confirm("当前有未同步的本机修改。请先导出 JSON 备份。确定放弃这些本机修改并恢复演示数据吗？")) return;
    }
    if (window.confirm("创建一份新的演示会议？原有服务器会议会保留。")) {
      localStorage.removeItem("shiling_unsynced");
      writeFailed = false;
      state = createDemoState();
      saveState();
      renderWithTransition();
      showToast("已恢复演示数据。", "rotate-ccw");
      if (["http:", "https:"].includes(window.location.protocol)) {
        apiRequest("/reset", { method: "POST" })
          .then((payload) => {
            applyServerState(payload.state);
            renderWithTransition();
          })
          .catch(() => { trackWrite(null); updateChrome(); });
      }
    }
    return;
  }

  if (event.target.closest("#import-meeting-btn") || event.target.closest("#mobile-import-btn")) {
    openImportModal();
    return;
  }

  if (event.target.closest("#export-json-btn")) {
    exportJson();
    return;
  }

  if (event.target.closest("#export-md-btn")) {
    exportMarkdown();
  }
}

function saveTaskFromForm() {
  if (pendingWrites) return showToast("正在保存上一项修改，请稍后再试。", "alert-circle");
  const form = document.getElementById("task-form");
  if (!form) return;
  const formData = new FormData(form);
  const id = String(formData.get("id") || "");
  const title = String(formData.get("title") || "").trim();
  if (!title) return;

  const existing = state.tasks.find((task) => task.id === id);
  const task = {
    id: existing?.id || `t-${Date.now()}`,
    version: existing?.version,
    title,
    owner: String(formData.get("owner") || "").trim(),
    due: normalizeDate(String(formData.get("due") || "")),
    priority: String(formData.get("priority") || "medium"),
    status: String(formData.get("status") || "todo"),
    source: existing?.source || "手动创建",
    notes: String(formData.get("notes") || "").trim(),
    tags: existing?.tags || ["手动创建"],
  };

  if (existing) {
    state.tasks = state.tasks.map((item) => (item.id === existing.id ? task : item));
  } else {
    state.tasks.unshift(task);
  }
  syncTask(task, !existing);
  saveState();
  closeModal(true);
  renderWithTransition();
  showToast(existing ? "任务已更新。" : "任务已创建。", "check-circle-2");
}

function convertToTask(type, id) {
  if (pendingWrites) return showToast("正在保存上一项修改，请稍后再试。", "alert-circle");
  let task;
  if (type === "risk") {
    const risk = state.risks.find((item) => item.id === id);
    if (!risk) return;
    task = {
      id: `t-${Date.now()}`,
      title: `处理风险：${risk.title}`,
      owner: "",
      due: "",
      priority: risk.severity === "high" ? "high" : "medium",
      status: "backlog",
      source: risk.source,
      notes: "",
      tags: ["风险处置"],
    };
    showToast("风险已转为待确认任务。", "list-plus");
  } else {
    const decision = state.decisions.find((item) => item.id === id);
    if (!decision) return;
    task = {
      id: `t-${Date.now()}`,
      title: `落实决策：${decision.text}`,
      owner: "",
      due: "",
      priority: "medium",
      status: "backlog",
      source: decision.source,
      notes: "",
      tags: ["决策落实"],
    };
    showToast("决策已转为待确认任务。", "list-plus");
  }
  state.tasks.unshift(task);
  syncTask(task, true);
  saveState();
  renderWithTransition();
}

function handleDeleteTask(event) {
  const button = event.target.closest("[data-delete-task]");
  if (!button) return;
  if (pendingWrites) return showToast("正在保存上一项修改，请稍后再试。", "alert-circle");
  const id = button.dataset.deleteTask;
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  if (!window.confirm(`删除“${task.title}”？`)) return;
  state.tasks = state.tasks.filter((item) => item.id !== id);
  syncDelete(task);
  saveState();
  closeModal(true);
  renderWithTransition();
  showToast("任务已删除。", "trash-2");
}

function handleInput(event) {
  if (event.target.id === "auto-title") autoMode.title = event.target.value;
  if (event.target.id === "auto-date") autoMode.date = event.target.value;
  if (event.target.id === "auto-participants") {
    autoMode.participantsText = event.target.value;
  }
  if (event.target.id === "auto-manual-text") autoMode.manualText = event.target.value;
  if (event.target.matches("[data-auto-resolution]")) {
    autoMode.resolutions[event.target.dataset.autoResolution] = event.target.value;
  }
  if (event.target.id === "task-search" || event.target.id === "mobile-task-search") {
    state.query = event.target.value;
    const id = event.target.id;
    const cursor = event.target.selectionStart;
    renderApp();
    const nextInput = document.getElementById(id);
    if (nextInput) {
      nextInput.focus();
      nextInput.setSelectionRange(cursor, cursor);
    }
  }
}

function handleFileChange(event) {
  if (event.target.id === "auto-files") {
    addAutoFiles(event.target.files);
    event.target.value = "";
    return;
  }
  if (event.target.id !== "meeting-file") return;
  const file = event.target.files?.[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    showToast("文件超过 2MB。", "alert-circle");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const input = document.getElementById("meeting-input");
    if (input) {
      input.value = String(reader.result || "");
      showToast(`已导入 ${file.name}`, "file-check-2");
    }
  };
  reader.readAsText(file, "utf-8");
}

function handleDragStart(event) {
  const card = event.target.closest(".task-card");
  if (!card) return;
  draggingTaskId = card.dataset.taskId;
  card.classList.add("is-dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", draggingTaskId);
}

function handleDragEnd(event) {
  event.target.closest(".task-card")?.classList.remove("is-dragging");
  document.querySelectorAll(".board-column").forEach((column) => column.classList.remove("is-drop-target"));
  draggingTaskId = null;
}

function handleDragOver(event) {
  const autoDropzone = event.target.closest("#auto-dropzone");
  if (autoDropzone) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    autoDropzone.classList.add("is-dragover");
    return;
  }
  const column = event.target.closest(".board-column");
  if (!column) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  document.querySelectorAll(".board-column").forEach((item) => item.classList.toggle("is-drop-target", item === column));
}

function handleDrop(event) {
  const autoDropzone = event.target.closest("#auto-dropzone");
  if (autoDropzone) {
    event.preventDefault();
    autoDropzone.classList.remove("is-dragover");
    addAutoFiles(event.dataTransfer.files);
    return;
  }
  const column = event.target.closest(".board-column");
  if (!column) return;
  event.preventDefault();
  if (pendingWrites) return showToast("正在保存上一项修改，请稍后再试。", "alert-circle");
  const taskId = event.dataTransfer.getData("text/plain") || draggingTaskId;
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;
  task.status = column.dataset.status;
  syncTaskStatus(task);
  saveState();
  renderWithTransition();
  showToast(`任务已移至${STATUS_META[task.status].label}。`, "move-right");
}

function handleDragLeave(event) {
  const autoDropzone = event.target.closest("#auto-dropzone");
  if (autoDropzone && !autoDropzone.contains(event.relatedTarget)) {
    autoDropzone.classList.remove("is-dragover");
    return;
  }
  const column = event.target.closest(".board-column");
  if (!column) return;
  if (!column.contains(event.relatedTarget)) column.classList.remove("is-drop-target");
}

function handleKeydown(event) {
  if (event.key === "Escape") {
    closeModal();
    return;
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    document.getElementById("task-search")?.focus();
    return;
  }
  const card = event.target.closest(".task-card");
  if (card && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
    openTaskEditor(card.dataset.taskId);
  }
}

function exportJson() {
  const payload = {
    meeting: state.meeting,
    metrics: {
      tasks: state.tasks.length,
      active: activeTaskCount(),
      decisions: state.decisions.length,
      risks: state.risks.length,
    },
    tasks: state.tasks,
    decisions: state.decisions,
    risks: state.risks,
  };
  downloadFile(
    `${safeFilename(state.meeting.title)}_任务数据.json`,
    JSON.stringify(payload, null, 2),
    "application/json;charset=utf-8",
  );
  showToast("JSON 已导出。", "braces");
}

function exportMarkdown() {
  const report = buildMarkdownReport();
  downloadFile(`${safeFilename(state.meeting.title)}_会议报告.md`, report, "text/markdown;charset=utf-8");
  showToast("会议报告已导出。", "download");
}

function buildMarkdownReport() {
  const lines = [
    `# ${state.meeting.title}`,
    "",
    `- 日期：${formatLongDate(state.meeting.date)}`,
    `- 参与人：${state.meeting.participants.join("、")}`,
    `- 行动项：${state.tasks.length}`,
    `- 决策：${state.decisions.length}`,
    `- 风险：${state.risks.length}`,
    "",
    "## 行动项",
    "",
    "| 任务 | 负责人 | 截止时间 | 状态 | 优先级 |",
    "| --- | --- | --- | --- | --- |",
    ...state.tasks.map(
      (task) =>
        `| ${escapePipe(task.title)} | ${escapePipe(task.owner || "待定")} | ${formatShortDate(task.due)} | ${STATUS_META[task.status].label} | ${PRIORITY_META[task.priority].label} |`,
    ),
    "",
    "## 决策结论",
    "",
    ...state.decisions.map((decision) => `- ${decision.text}`),
    "",
    "## 风险清单",
    "",
    ...state.risks.map((risk) => `- [${risk.severity === "high" ? "高" : "中"}] ${risk.title}`),
    "",
  ];
  return lines.join("\n");
}

function escapePipe(value) {
  return String(value || "").replaceAll("|", "\\|");
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeFilename(value) {
  return String(value || "会议报告").replace(/[\\/:*?"<>|]/g, "_");
}

async function copySummary() {
  const text = buildMarkdownReport();
  try {
    await navigator.clipboard.writeText(text);
    showToast("会议摘要已复制。", "copy");
  } catch {
    showToast("浏览器未允许剪贴板访问。", "alert-circle");
  }
}

function showToast(message, iconName = "check-circle-2") {
  const region = document.getElementById("toast-region");
  if (!region) return;
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerHTML = `${icon(iconName)}<span>${escapeHTML(message)}</span>`;
  region.appendChild(toast);
  refreshIcons();
  window.setTimeout(() => {
    toast.classList.add("is-closing");
    window.setTimeout(() => toast.remove(), 190);
  }, 2600);
}

document.addEventListener("click", (event) => {
  handleDeleteTask(event);
  handleClick(event);
});
document.addEventListener("input", handleInput);
document.addEventListener("change", handleFileChange);
document.addEventListener("keydown", handleKeydown);
document.addEventListener("dragstart", handleDragStart);
document.addEventListener("dragend", handleDragEnd);
document.addEventListener("dragover", handleDragOver);
document.addEventListener("dragleave", handleDragLeave);
document.addEventListener("drop", handleDrop);
document.addEventListener(
  "submit",
  (event) => {
    if (event.target.id !== "task-form") return;
    event.preventDefault();
    saveTaskFromForm();
  },
  true,
);

document.addEventListener("DOMContentLoaded", () => {
  initializeApp();
});
