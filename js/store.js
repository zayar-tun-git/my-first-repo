export const STORAGE_KEY = "cursor-ai-chat-v1";

export function createId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `chat-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

export function defaultSettings() {
  return {
    mode: "local",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    apiKey: "",
  };
}

export function createChat(now = Date.now()) {
  return {
    id: createId(),
    title: "New chat",
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}

export function createState(now = Date.now()) {
  const chat = createChat(now);
  return {
    activeId: chat.id,
    chats: [chat],
    settings: defaultSettings(),
  };
}

export function loadState(raw) {
  if (!raw) return createState();
  try {
    return normalizeState(JSON.parse(raw));
  } catch {
    return createState();
  }
}

export function normalizeState(input) {
  const settings = normalizeSettings(input?.settings);
  const chats = Array.isArray(input?.chats) ? input.chats.map(normalizeChat).filter(Boolean) : [];
  if (!chats.length) {
    const fresh = createState();
    return { ...fresh, settings };
  }
  const activeId = chats.some((chat) => chat.id === input.activeId) ? input.activeId : chats[0].id;
  return { activeId, chats, settings };
}

export function titleFromMessage(text) {
  const line = String(text)
    .split("\n")
    .map((item) => item.trim())
    .find(Boolean) || "New chat";
  const clean = line.replace(/^#+\s*/, "").replace(/\s+/g, " ");
  if (clean.length <= 42) return clean || "New chat";
  return `${clean.slice(0, 41).trimEnd()}…`;
}

export function toMarkdown(chat) {
  const title = chat?.title || "Chat";
  const body = (chat?.messages || [])
    .map((message) => {
      const who = message.role === "user" ? "You" : "Assistant";
      return `### ${who}\n\n${message.content}`;
    })
    .join("\n\n");
  return `# ${title}\n\n${body}\n`;
}

function normalizeSettings(input) {
  const defaults = defaultSettings();
  const settings = { ...defaults, ...(input || {}) };
  settings.mode = settings.mode === "api" ? "api" : "local";
  settings.baseUrl = String(settings.baseUrl || defaults.baseUrl).trim().replace(/\/$/, "");
  settings.model = String(settings.model || defaults.model).trim().slice(0, 80) || defaults.model;
  settings.apiKey = String(settings.apiKey || "");
  return settings;
}

function normalizeChat(chat) {
  if (!chat || typeof chat !== "object" || !chat.id) return null;
  const messages = Array.isArray(chat.messages)
    ? chat.messages
        .filter((message) => message && (message.role === "user" || message.role === "assistant") && typeof message.content === "string")
        .map((message) => ({
          role: message.role,
          content: message.content,
          status: message.status === "error" ? "error" : "done",
        }))
    : [];
  const title = String(chat.title || "New chat").trim().slice(0, 80) || "New chat";
  return {
    id: String(chat.id),
    title,
    createdAt: Number(chat.createdAt) || Date.now(),
    updatedAt: Number(chat.updatedAt) || Date.now(),
    messages,
  };
}
