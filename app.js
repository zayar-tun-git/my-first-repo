// Cursor AI - simple chat app. No installs, no server needed.

// =====================================================================
// MOCK MODEL  (demo mode, used when no Gemini key is saved)
// mockReply(message) must return a Promise that resolves to a string.
// =====================================================================
function mockReply(message) {
  const text = message.toLowerCase();
  let reply;
  if (/\b(hi|hello|hey)\b/.test(text)) reply = "Hello! 👋 I'm Cursor AI, running in demo mode. What would you like to talk about?";
  else if (text.includes("your name") || text.includes("who are you")) reply = "I'm Cursor AI, a friendly demo assistant. Right now my answers are canned, but a real AI can be plugged in later.";
  else if (text.includes("how are you")) reply = "I'm doing great, thanks for asking! How about you?";
  else if (text.includes("time")) reply = "Your computer says it's " + new Date().toLocaleTimeString() + ".";
  else if (text.includes("date") || text.includes("today")) reply = "Today is " + new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" }) + ".";
  else if (text.includes("joke")) reply = "Why do programmers prefer dark mode? Because light attracts bugs! 🐛";
  else if (text.includes("help")) reply = "Try saying hello, asking for a joke, the time, or the date. Everything else gets a friendly echo for now.";
  else if (text.includes("thank")) reply = "You're very welcome! 😊";
  else if (/\b(bye|goodbye)\b/.test(text)) reply = "Goodbye! Come back anytime.";
  else reply = "You said: \"" + message + "\"\n\nI'm only a demo right now, so I can't truly understand yet. Try asking for a joke or typing \"help\".";

  const delay = 600 + Math.random() * 900; // pretend to "think"
  return new Promise(resolve => setTimeout(() => resolve(reply), delay));
}

// =====================================================================
// SETTINGS (saved only in this browser's localStorage)
// =====================================================================
const DEFAULT_MODEL = "gemini-3.8-flash"; // current free-tier Flash model (Nov 2026)
const SETTINGS_KEY = "cursor-ai-settings";
const DEMO_NOTE = "\n\n(Add your free Gemini key in Settings to get real answers.)";

function loadSettings() {
  try { return Object.assign({ apiKey: "", model: DEFAULT_MODEL }, JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}); }
  catch (e) { return { apiKey: "", model: DEFAULT_MODEL }; }
}
let settings = loadSettings();

// =====================================================================
// GEMINI (real AI). Called straight from the browser with fetch.
// =====================================================================
class FriendlyError extends Error {}

async function geminiReply(history) {
  const model = (settings.model || DEFAULT_MODEL).trim();
  const url = "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(model) + ":generateContent";
  // Send the last 20 messages so the AI remembers the conversation.
  const contents = history.slice(-20).map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }]
  }));

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": settings.apiKey.trim() },
      body: JSON.stringify({ contents })
    });
  } catch (e) {
    throw new FriendlyError("⚠️ I couldn't reach Gemini. Please check your internet connection and try again.");
  }

  let data = {};
  try { data = await res.json(); } catch (e) {}

  if (!res.ok) {
    const msg = (data.error && data.error.message) || "";
    if (res.status === 400 && /api key/i.test(msg) || res.status === 401 || res.status === 403)
      throw new FriendlyError("🔑 Your Gemini API key doesn't seem to work. Open Settings and paste it again (get one at aistudio.google.com/apikey).");
    if (res.status === 429)
      throw new FriendlyError("⏳ You've hit the free-tier limit for now. Wait a minute and try again (daily limits reset at midnight US Pacific time).");
    if (res.status === 404)
      throw new FriendlyError("🤔 The model \"" + model + "\" wasn't found. Open Settings and try gemini-3.5-flash-lite or gemini-2.0-flash.");
    if (res.status >= 500)
      throw new FriendlyError("🛠️ Gemini is having trouble right now. Please try again in a moment.");
    throw new FriendlyError("⚠️ Gemini returned an error (" + res.status + "): " + (msg || "unknown problem"));
  }

  const cand = data.candidates && data.candidates[0];
  const text = cand && cand.content && cand.content.parts &&
    cand.content.parts.map(p => p.text || "").join("").trim();
  if (!text) {
    if (data.promptFeedback && data.promptFeedback.blockReason)
      throw new FriendlyError("🚫 Gemini declined to answer that message. Try rephrasing it.");
    throw new FriendlyError("🤷 Gemini sent back an empty answer. Please try again.");
  }
  return text;
}

// The app calls getReply(). Real Gemini if a key is saved, otherwise demo mode.
async function getReply(message, history) {
  if (settings.apiKey.trim()) return geminiReply(history);
  return (await mockReply(message)) + DEMO_NOTE;
}
// =====================================================================

const STORAGE_KEY = "cursor-ai-chat";
const messagesEl = document.getElementById("messages");
const welcomeEl = document.getElementById("welcome");
const chatEl = document.getElementById("chat");
const form = document.getElementById("composer");
const input = document.getElementById("input");
const sendBtn = document.getElementById("send");
const newChatBtn = document.getElementById("newChat");

let history = loadHistory();
let busy = false;

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch (e) { return []; }
}
function saveHistory() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(history)); } catch (e) {}
}

function addBubble(role, text, isError) {
  const div = document.createElement("div");
  div.className = "msg " + role + (isError ? " error" : "");
  div.textContent = text;
  messagesEl.appendChild(div);
  welcomeEl.style.display = "none";
  scrollDown();
  return div;
}
function scrollDown() { chatEl.scrollTop = chatEl.scrollHeight; }

function render() {
  messagesEl.innerHTML = "";
  welcomeEl.style.display = history.length ? "none" : "block";
  history.forEach(m => addBubble(m.role, m.content));
}

function updateSendState() { sendBtn.disabled = busy || !input.value.trim(); }

function autoResize() {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 200) + "px";
}

async function send() {
  const text = input.value.trim();
  if (!text || busy) return;
  busy = true;
  input.value = "";
  autoResize();
  updateSendState();

  history.push({ role: "user", content: text });
  saveHistory();
  addBubble("user", text);

  const typing = addBubble("assistant", "");
  typing.innerHTML = '<span class="typing"><span></span><span></span><span></span></span>';

  try {
    const reply = await getReply(text, history);
    typing.textContent = reply;
    history.push({ role: "assistant", content: reply });
  } catch (e) {
    // Errors are shown in the chat but not saved, so they aren't sent back to the AI.
    typing.textContent = e instanceof FriendlyError ? e.message : "⚠️ Something went wrong: " + e.message;
    typing.classList.add("error");
  }
  saveHistory();
  scrollDown();
  busy = false;
  updateSendState();
  input.focus();
}

form.addEventListener("submit", e => { e.preventDefault(); send(); });
input.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
});
input.addEventListener("input", () => { autoResize(); updateSendState(); });
newChatBtn.addEventListener("click", () => {
  if (busy) return;
  history = [];
  saveHistory();
  render();
  input.focus();
});

// ---------- Settings panel ----------
const modal = document.getElementById("settingsModal");
const keyInput = document.getElementById("apiKey");
const modelInput = document.getElementById("model");
const toggleKey = document.getElementById("toggleKey");
const statusEl = document.getElementById("status");

function updateStatus() {
  if (settings.apiKey.trim()) {
    statusEl.textContent = "Connected to Gemini (" + (settings.model || DEFAULT_MODEL) + ")";
    statusEl.classList.add("connected");
  } else {
    statusEl.textContent = "Demo mode – add a free Gemini key in Settings for real answers";
    statusEl.classList.remove("connected");
  }
}
function openSettings() {
  keyInput.value = settings.apiKey;
  modelInput.value = settings.model || DEFAULT_MODEL;
  keyInput.type = "password"; toggleKey.textContent = "Show";
  modal.hidden = false;
  keyInput.focus();
}
function closeSettings() { modal.hidden = true; input.focus(); }

document.getElementById("openSettings").addEventListener("click", openSettings);
document.getElementById("closeSettings").addEventListener("click", closeSettings);
toggleKey.addEventListener("click", () => {
  const show = keyInput.type === "password";
  keyInput.type = show ? "text" : "password";
  toggleKey.textContent = show ? "Hide" : "Show";
});
document.getElementById("saveSettings").addEventListener("click", () => {
  settings = { apiKey: keyInput.value.trim(), model: modelInput.value.trim() || DEFAULT_MODEL };
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {}
  updateStatus(); closeSettings();
});
document.getElementById("clearSettings").addEventListener("click", () => {
  settings = { apiKey: "", model: DEFAULT_MODEL };
  try { localStorage.removeItem(SETTINGS_KEY); } catch (e) {}
  keyInput.value = ""; modelInput.value = DEFAULT_MODEL;
  updateStatus();
});
modal.addEventListener("click", e => { if (e.target === modal) closeSettings(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !modal.hidden) closeSettings(); });

render();
updateSendState();
updateStatus();
