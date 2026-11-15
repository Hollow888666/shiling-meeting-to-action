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
    view: "board",
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
      view: "board",
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
  const timeout = window.setTimeout(() => controller.abort(), 6000);
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
      throw new Error(payload.error || `API request failed: ${response.status}`);
    }
    backendAvailable = true;
    return payload;
  } catch (error) {
    backendAvailable = false;
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
  saveState();
}

async function initializeApp() {
  if (["http:", "https:"].includes(window.location.protocol)) {
    try {
      const serverState = await apiRequest("/state");
      applyServerState(serverState);
      backendAvailable = true;
    } catch {
      backendAvailable = false;
    }
  }
  renderApp();
}

function syncTask(task, isNew) {
  if (!backendAvailable) return;
  const request = isNew
    ? apiRequest("/tasks", { method: "POST", body: task })
    : apiRequest(`/tasks/${encodeURIComponent(task.id)}`, { method: "PUT", body: task });
  request.catch(() => {
    showToast("后端连接已断开，当前修改保存在本机。", "cloud-off");
    updateChrome();
  });
}

function syncDelete(taskId) {
  if (!backendAvailable) return;
  apiRequest(`/tasks/${encodeURIComponent(taskId)}`, { method: "DELETE" }).catch(() => {
    showToast("后端连接已断开，删除只保存在本机。", "cloud-off");
    updateChrome();
  });
}

function syncTaskStatus(task) {
  if (!backendAvailable) return;
  apiRequest(`/tasks/${encodeURIComponent(task.id)}`, {
    method: "PUT",
    body: { status: task.status },
  }).catch(() => {
    showToast("后端连接已断开，状态仅保存在本机。", "cloud-off");
    updateChrome();
  });
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
  } else {
    root.innerHTML = renderBoardView();
  }
  refreshIcons();
}

function renderWithTransition() {
  if (document.startViewTransition) {
    document.startViewTransition(() => renderApp());
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
          <p>支持粘贴文本或导入 TXT、MD 文件，原始内容只保存在本机。</p>
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
  setTimeout(() => document.getElementById("task-title")?.focus(), 50);
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
    });
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
      const payload = await serverRequest;
      applyServerState(payload.state);
      result = { tasks: state.tasks, risks: state.risks };
      usedBackend = true;
    } catch {
      result = extractMeeting(text);
    }
  } else {
    result = extractMeeting(text);
  }

  if (!usedBackend) {
    state.meeting = result.meeting;
    state.tasks = result.tasks;
    state.decisions = result.decisions;
    state.risks = result.risks;
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
  if (/^(会议|日期|时间|地点|参会|主题)[：:]/.test(text)) return false;
  if (/上线门槛|不上线/.test(text) && !/负责|完成|整理|提交|准备|安排|拉通|补齐/.test(text)) return false;
  if (/设计稿会在.*给到/.test(text)) return false;
  const actionPattern =
    /负责|请[\p{L}\w]{2,4}|需要|完成|整理|输出|准备|对接|确认|提交|更新|安排|推进|测试|录制|发布|做一次|搭建|修复|核对|撰写|设计|开发|报名|邀请|跟进|补齐|拉通|同步|梳理|标记|验收|交付|导入|回滚|检查|落实|关闭/;
  if (!actionPattern.test(text)) return false;
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
    if (window.confirm("恢复初始演示数据？当前调整会被覆盖。")) {
      state = createDemoState();
      saveState();
      renderWithTransition();
      showToast("已恢复演示数据。", "rotate-ccw");
      if (backendAvailable) {
        apiRequest("/reset", { method: "POST" })
          .then((payload) => {
            applyServerState(payload.state);
            renderWithTransition();
          })
          .catch(() => updateChrome());
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
  const form = document.getElementById("task-form");
  if (!form) return;
  const formData = new FormData(form);
  const id = String(formData.get("id") || "");
  const title = String(formData.get("title") || "").trim();
  if (!title) return;

  const existing = state.tasks.find((task) => task.id === id);
  const task = {
    id: existing?.id || `t-${Date.now()}`,
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
  const id = button.dataset.deleteTask;
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  if (!window.confirm(`删除“${task.title}”？`)) return;
  state.tasks = state.tasks.filter((item) => item.id !== id);
  syncDelete(id);
  saveState();
  closeModal(true);
  renderWithTransition();
  showToast("任务已删除。", "trash-2");
}

function handleInput(event) {
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
  const column = event.target.closest(".board-column");
  if (!column) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  document.querySelectorAll(".board-column").forEach((item) => item.classList.toggle("is-drop-target", item === column));
}

function handleDrop(event) {
  const column = event.target.closest(".board-column");
  if (!column) return;
  event.preventDefault();
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
