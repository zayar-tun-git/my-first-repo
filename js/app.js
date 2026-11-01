import { streamChat } from "./api.js";
import { localReply } from "./local.js";
import { escapeHtml, renderMarkdown } from "./markdown.js";
import {
  STORAGE_KEY,
  createChat,
  loadState,
  titleFromMessage,
  toMarkdown,
} from "./store.js";

const SUGGESTIONS = [
  {
    label: "Structure a small web app",
    prompt: "How should I structure a small web app?",
  },
  {
    label: "Review a function",
    prompt: [
      "Review this function for bugs:",
      "",
      "```js",
      "function total(items) {",
      "  let sum = 0;",
      "  for (const item of items) sum += item.price;",
      "  return sum;",
      "}",
      "```",
    ].join("\n"),
  },
  {
    label: "Draft a commit message",
    prompt: "Write a clear commit message for adding a browser chat UI with local history.",
  },
];

const els = {
  list: document.querySelector("#chat-list"),
  search: document.querySelector("#search"),
  thread: document.querySelector("#thread"),
  title: document.querySelector("#title"),
  form: document.querySelector("#composer"),
  input: document.querySelector("#input"),
  send: document.querySelector("#send"),
  stop: document.querySelector("#stop"),
  mode: document.querySelector("#mode"),
  hint: document.querySelector("#hint"),
  newChat: document.querySelector("#new-chat"),
  menu: document.querySelector("#menu"),
  backdrop: document.querySelector("#backdrop"),
  exportChat: document.querySelector("#export"),
  openSettings: document.querySelector("#open-settings"),
  settings: document.querySelector("#settings"),
  settingsForm: document.querySelector("#settings-form"),
  settingsError: document.querySelector("#settings-error"),
  settingsCancel: document.querySelector("#settings-cancel"),
  toast: document.querySelector("#toast"),
  undo: document.querySelector("#undo"),
  status: document.querySelector("#status"),
};

let state = loadState(localStorage.getItem(STORAGE_KEY));
let runtime = { busy: false, controller: null };
let undoTimer = 0;
let undoAction = null;

bind();
renderAll({ forceScroll: true });
els.input.focus();

function bind() {
  els.form.addEventListener("submit", (event) => {
    event.preventDefault();
    send(els.input.value);
  });
  els.input.addEventListener("input", resizeInput);
  els.input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      send(els.input.value);
    }
  });
  els.stop.addEventListener("click", () => runtime.controller?.abort());
  els.newChat.addEventListener("click", newChat);
  els.mode.addEventListener("change", () => {
    state.settings.mode = els.mode.value === "api" ? "api" : "local";
    persist();
    syncChrome();
    if (state.settings.mode === "api" && !state.settings.apiKey.trim()) {
      openSettings("Add an API key to use a custom model.");
    }
  });
  els.search.addEventListener("input", renderList);
  els.list.addEventListener("click", (event) => {
    const deleter = event.target.closest("[data-delete]");
    if (deleter) {
      deleteChat(deleter.dataset.delete);
      return;
    }
    const opener = event.target.closest("[data-open]");
    if (opener) openChat(opener.dataset.open);
  });
  els.thread.addEventListener("click", (event) => {
    const suggestion = event.target.closest("[data-suggest]");
    if (suggestion) {
      const prompt = SUGGESTIONS[Number(suggestion.dataset.suggest)]?.prompt;
      if (prompt) send(prompt);
      return;
    }
    const copy = event.target.closest("[data-copy-code]");
    if (copy) copyCode(copy);
  });
  els.menu.addEventListener("click", () => document.body.classList.add("sidebar-open"));
  els.backdrop.addEventListener("click", closeSidebar);
  els.exportChat.addEventListener("click", exportActiveChat);
  els.openSettings.addEventListener("click", () => openSettings(""));
  els.settingsCancel.addEventListener("click", () => els.settings.close());
  els.settingsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const error = readSettings();
    els.settingsError.textContent = error;
    if (!error) els.settings.close();
  });
  els.undo.addEventListener("click", () => {
    if (!undoAction) return;
    undoAction();
    clearUndo();
    renderAll();
  });
}

function newChat() {
  const current = activeChat();
  if (current && current.messages.length === 0) {
    closeSidebar();
    els.input.focus();
    return;
  }
  const chat = createChat();
  state.chats.unshift(chat);
  state.activeId = chat.id;
  persist();
  renderAll({ forceScroll: true });
  closeSidebar();
  els.input.focus();
}

function openChat(id) {
  if (!state.chats.some((chat) => chat.id === id)) return;
  if (runtime.busy && state.activeId !== id) runtime.controller?.abort();
  state.activeId = id;
  persist();
  renderAll({ forceScroll: true });
  closeSidebar();
}

function deleteChat(id) {
  const index = state.chats.findIndex((chat) => chat.id === id);
  if (index < 0) return;
  if (runtime.busy && state.activeId === id) runtime.controller?.abort();
  const [removed] = state.chats.splice(index, 1);
  let createdId = null;
  if (!state.chats.length) {
    const chat = createChat();
    state.chats.push(chat);
    createdId = chat.id;
    state.activeId = chat.id;
  } else if (state.activeId === id) {
    state.activeId = state.chats[Math.min(index, state.chats.length - 1)].id;
  }
  persist();
  renderAll();
  armUndo(removed.title, () => {
    state.chats = state.chats.filter((chat) => chat.id !== createdId);
    state.chats.splice(Math.min(index, state.chats.length), 0, removed);
    state.activeId = removed.id;
    persist();
  });
}

async function send(raw) {
  const text = String(raw ?? "").trim();
  if (!text || runtime.busy) return;
  if (state.settings.mode === "api" && !state.settings.apiKey.trim()) {
    openSettings("Add an API key before using a custom model.");
    return;
  }

  const chat = activeChat();
  if (!chat.messages.length) chat.title = titleFromMessage(text);
  chat.messages.push({ role: "user", content: text, status: "done" });
  chat.messages.push({ role: "assistant", content: "", status: "streaming" });
  promote(chat);
  els.input.value = "";
  resizeInput();
  runtime.busy = true;
  runtime.controller = new AbortController();
  persist();
  renderAll({ forceScroll: true });

  const assistant = chat.messages[chat.messages.length - 1];
  try {
    const prior = chat.messages.slice(0, -1);
    if (state.settings.mode === "api") {
      await streamChat({
        baseUrl: state.settings.baseUrl,
        apiKey: state.settings.apiKey,
        model: state.settings.model,
        messages: prior,
        signal: runtime.controller.signal,
        onDelta(full) {
          assistant.content = full;
          renderMessages();
        },
      });
    } else {
      await playLocal(localReply(text), runtime.controller.signal, (partial) => {
        assistant.content = partial;
        renderMessages();
      });
    }
    assistant.status = "done";
    if (!assistant.content.trim()) assistant.content = "The model returned an empty reply.";
    setStatus("Reply ready.");
  } catch (error) {
    if (error?.name === "AbortError") {
      assistant.status = "done";
      assistant.content = assistant.content ? `${assistant.content}\n\n_(Stopped.)_` : "_(Stopped.)_";
      setStatus("Stopped.");
    } else {
      assistant.status = "error";
      assistant.content = error?.message || "The request failed.";
      setStatus("Reply failed.");
    }
  } finally {
    runtime.busy = false;
    runtime.controller = null;
    promote(chat);
    persist();
    renderAll();
    els.input.focus();
  }
}

async function playLocal(full, signal, onDelta) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) {
    onDelta(full);
    return;
  }
  let index = 0;
  while (index < full.length) {
    if (signal.aborted) throw abortError();
    index = Math.min(full.length, index + 4);
    onDelta(full.slice(0, index));
    await delay(16, signal);
  }
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort);
  });
}

function abortError() {
  const error = new Error("Aborted");
  error.name = "AbortError";
  return error;
}

function renderAll(options = {}) {
  renderList();
  renderMessages(options);
  syncChrome();
}

function renderList() {
  const query = els.search.value.trim().toLowerCase();
  const chats = state.chats.filter((chat) => {
    if (!query) return true;
    if (chat.title.toLowerCase().includes(query)) return true;
    return chat.messages.some((message) => message.content.toLowerCase().includes(query));
  });
  els.list.innerHTML = chats.length
    ? chats.map((chat) => chatRow(chat)).join("")
    : '<p class="empty-list">No matching chats</p>';
}

function chatRow(chat) {
  const active = chat.id === state.activeId ? " is-active" : "";
  return `<div class="chat-row${active}">
    <button type="button" class="chat-item" data-open="${escapeHtml(chat.id)}">
      <span class="chat-item-title">${escapeHtml(chat.title)}</span>
      <span class="chat-item-time">${escapeHtml(formatTime(chat.updatedAt))}</span>
    </button>
    <button type="button" class="chat-delete" data-delete="${escapeHtml(chat.id)}" aria-label="Delete ${escapeHtml(chat.title)}">×</button>
  </div>`;
}

function renderMessages(options = {}) {
  const chat = activeChat();
  const stick = options.forceScroll || isNearBottom();
  els.thread.innerHTML = chat.messages.length ? chat.messages.map(messageHtml).join("") : emptyHtml();
  if (stick) els.thread.scrollTop = els.thread.scrollHeight;
}

function messageHtml(message) {
  const who = message.role === "user" ? "You" : "Assistant";
  const classes = ["msg", message.role === "user" ? "msg-user" : "msg-assistant"];
  if (message.status === "error") classes.push("is-error");
  const body = message.content
    ? renderMarkdown(message.content)
    : '<p class="pending">Thinking…</p>';
  return `<article class="${classes.join(" ")}"><div class="msg-who">${who}</div><div class="msg-body">${body}</div></article>`;
}

function emptyHtml() {
  const buttons = SUGGESTIONS.map(
    (item, index) => `<button type="button" data-suggest="${index}">${escapeHtml(item.label)}</button>`,
  ).join("");
  return `<div class="empty">
    <p class="eyebrow">Coding chat</p>
    <h2>Ask about a bug, a structure, or a commit.</h2>
    <p>Chats stay in this browser. The local guide answers without a network call.</p>
    <div class="suggestions">${buttons}</div>
  </div>`;
}

function syncChrome() {
  const chat = activeChat();
  els.title.textContent = chat.title;
  document.title = chat.title === "New chat" ? "Cursor AI Chat" : `${chat.title} · Cursor AI Chat`;
  els.mode.value = state.settings.mode;
  els.send.hidden = runtime.busy;
  els.stop.hidden = !runtime.busy;
  els.input.disabled = runtime.busy;
  els.hint.textContent = state.settings.mode === "api"
    ? `Custom model · ${state.settings.model}. The key stays in this browser.`
    : "Local guide · replies are written in this page.";
}

function openSettings(message) {
  const form = els.settingsForm;
  form.elements.mode.value = state.settings.mode;
  form.elements.baseUrl.value = state.settings.baseUrl;
  form.elements.model.value = state.settings.model;
  form.elements.apiKey.value = state.settings.apiKey;
  els.settingsError.textContent = message || "";
  if (!els.settings.open) els.settings.showModal();
}

function readSettings() {
  const form = els.settingsForm;
  const mode = form.elements.mode.value === "api" ? "api" : "local";
  const baseUrl = form.elements.baseUrl.value.trim();
  const model = form.elements.model.value.trim();
  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    return "Enter a full URL, including https://.";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "Use an http or https URL.";
  }
  state.settings = {
    mode,
    baseUrl: baseUrl.replace(/\/$/, ""),
    model: model || "gpt-4o-mini",
    apiKey: form.elements.apiKey.value,
  };
  persist();
  syncChrome();
  return "";
}

function exportActiveChat() {
  const chat = activeChat();
  const blob = new Blob([toMarkdown(chat)], { type: "text/markdown;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${slug(chat.title)}.md`;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function copyCode(button) {
  const code = button.closest(".codeblock")?.querySelector("code")?.textContent ?? "";
  try {
    await navigator.clipboard.writeText(code);
    button.textContent = "Copied";
  } catch {
    button.textContent = "Copy failed";
  }
  setTimeout(() => {
    button.textContent = "Copy";
  }, 1200);
}

function activeChat() {
  return state.chats.find((chat) => chat.id === state.activeId) || state.chats[0];
}

function promote(chat) {
  chat.updatedAt = Date.now();
  state.chats = [chat, ...state.chats.filter((item) => item.id !== chat.id)];
  state.activeId = chat.id;
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      activeId: state.activeId,
      chats: state.chats,
      settings: state.settings,
    }));
  } catch {
    setStatus("This browser could not save the chat. Storage may be full.");
  }
}

function resizeInput() {
  els.input.style.height = "auto";
  els.input.style.height = `${Math.min(els.input.scrollHeight, 160)}px`;
}

function isNearBottom() {
  return els.thread.scrollHeight - els.thread.scrollTop - els.thread.clientHeight < 80;
}

function closeSidebar() {
  document.body.classList.remove("sidebar-open");
}

function formatTime(timestamp) {
  const delta = Date.now() - timestamp;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (delta < minute) return "Just now";
  if (delta < hour) return `${Math.floor(delta / minute)}m ago`;
  if (delta < day) return `${Math.floor(delta / hour)}h ago`;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(timestamp);
}

function slug(title) {
  const value = String(title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return value || "chat";
}

function armUndo(title, action) {
  clearTimeout(undoTimer);
  undoAction = action;
  els.toast.hidden = false;
  els.toast.querySelector("span").textContent = `Deleted “${title}”.`;
  undoTimer = setTimeout(clearUndo, 5000);
}

function clearUndo() {
  clearTimeout(undoTimer);
  undoAction = null;
  els.toast.hidden = true;
}

function setStatus(message) {
  els.status.textContent = message;
}
