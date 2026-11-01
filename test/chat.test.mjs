import assert from "node:assert/strict";
import test from "node:test";
import { localReply } from "../js/local.js";
import { renderMarkdown } from "../js/markdown.js";
import { takeSseEvents } from "../js/sse.js";
import { loadState, titleFromMessage, toMarkdown } from "../js/store.js";

test("markdown escapes markup and keeps fenced code", () => {
  const html = renderMarkdown("```js\nconst x = 1;\n<script>alert(1)</script>\n```\n\nSee <img src=x onerror=alert(1)>.");
  assert.match(html, /const x = 1;/);
  assert.match(html, /<span>js<\/span>/);
  assert.equal(html.includes("<script"), false);
  assert.equal(html.includes("<img"), false);
  assert.match(html, /&lt;script&gt;/);
});

test("markdown renders emphasis, lists, and http links", () => {
  const html = renderMarkdown("**Bold** and [docs](https://example.com/a)\n\n- one\n- two\n\n[bad](javascript:alert(1))");
  assert.match(html, /<strong>Bold<\/strong>/);
  assert.match(html, /href="https:\/\/example.com\/a"/);
  assert.match(html, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
  assert.equal(html.includes('href="javascript:'), false);
});

test("sse parser keeps a partial trailing line", () => {
  const parsed = takeSseEvents('data: {"choices":[{"delta":{"content":"Hi"}}]}\n\ndata: {"cho');
  assert.deepEqual(parsed.deltas, ["Hi"]);
  assert.equal(parsed.done, false);
  assert.equal(parsed.rest, 'data: {"cho');
});

test("sse parser stops on the done sentinel", () => {
  const parsed = takeSseEvents('data: {"choices":[{"delta":{"content":"A"}}]}\n\ndata: [DONE]\n');
  assert.deepEqual(parsed.deltas, ["A"]);
  assert.equal(parsed.done, true);
});

test("corrupt storage falls back to a fresh chat", () => {
  const state = loadState("{");
  assert.equal(state.chats.length, 1);
  assert.equal(state.chats[0].title, "New chat");
  assert.equal(state.settings.mode, "local");
});

test("saved chats round-trip without streaming placeholders", () => {
  const raw = JSON.stringify({
    activeId: "c1",
    settings: { mode: "api", baseUrl: "https://example.com/v1/", model: "demo", apiKey: "secret" },
    chats: [{
      id: "c1",
      title: "Saved",
      createdAt: 10,
      updatedAt: 20,
      messages: [
        { role: "user", content: "Hi", status: "done" },
        { role: "assistant", content: "Partial", status: "streaming" },
        { role: "nope", content: "drop" },
      ],
    }],
  });
  const state = loadState(raw);
  assert.equal(state.activeId, "c1");
  assert.equal(state.settings.baseUrl, "https://example.com/v1");
  assert.equal(state.settings.apiKey, "secret");
  assert.equal(state.chats[0].messages.length, 2);
  assert.equal(state.chats[0].messages[1].status, "done");
});

test("titles come from the first line", () => {
  assert.equal(titleFromMessage("How should I structure a small web app?"), "How should I structure a small web app?");
  assert.equal(titleFromMessage(`${"a".repeat(50)}\nmore`), `${"a".repeat(41)}…`);
});

test("export skips the settings object", () => {
  const markdown = toMarkdown({
    title: "Notes",
    messages: [{ role: "user", content: "Hello" }, { role: "assistant", content: "Hi" }],
  });
  assert.match(markdown, /^# Notes/);
  assert.match(markdown, /### You/);
  assert.match(markdown, /### Assistant/);
  assert.equal(markdown.includes("apiKey"), false);
});

test("local guide reviews the sample total function", () => {
  const reply = localReply("Review this function for bugs:\n\nfunction total(items) {\n  for (const item of items) sum += item.price;\n}\n");
  assert.match(reply, /`total`/);
  assert.match(reply, /NaN/);
  assert.match(reply, /Number\.isFinite/);
  assert.match(reply, /local guide/);
});

test("local guide drafts an imperative commit subject", () => {
  const reply = localReply("Write a clear commit message for adding a browser chat UI with local history.");
  assert.match(reply, /Add a browser chat UI with local history/);
});

test("local guide explains a small web app layout", () => {
  const reply = localReply("How should I structure a small web app?");
  assert.match(reply, /index\.html/);
  assert.match(reply, /localStorage/);
});
