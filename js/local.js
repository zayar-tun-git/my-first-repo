const FOOTNOTE =
  "This answer was written by the local guide in this page. It does not call a remote model. Add an API key in Settings to use a custom model.";

export function localReply(prompt) {
  const text = String(prompt ?? "").replace(/\r\n/g, "\n").trim();
  if (!text) return "Send a question, a bug, or a snippet of code.";

  const lower = text.toLowerCase();
  if (/^(hi|hello|hey|yo)\b[!.,\s]*$/i.test(text)) {
    return [
      "Hello. Paste a function, an error, or a question, and I will answer in this chat.",
      "",
      "The local guide runs in your browser and keeps the thread on this device. Open **Settings** when you want the same thread sent to an OpenAI-compatible model.",
      "",
      FOOTNOTE,
    ].join("\n");
  }

  if (lower.includes("commit message") || lower.includes("git commit")) {
    return commitAdvice(text);
  }

  if (lower.includes("structure") && (lower.includes("web") || lower.includes("app") || lower.includes("project"))) {
    return structureAdvice();
  }

  if (hasCodeSignal(text, lower)) {
    return codeAdvice(text);
  }

  if (lower.startsWith("how ") || text.includes("?")) {
    return howAdvice(text);
  }

  return generalAdvice(text);
}

function structureAdvice() {
  return [
    "Keep a small web app as files the browser can load directly.",
    "",
    "**Layout**",
    "```text",
    "index.html        page structure",
    "css/styles.css    layout and theme",
    "js/app.js         events and saved chats",
    "js/markdown.js    turn text into safe HTML",
    "```",
    "",
    "**How to split the work**",
    "- `index.html` holds the regions: chat list, transcript, and composer.",
    "- The stylesheet owns spacing, type, and color.",
    "- One module owns the conversation and writes it to `localStorage`.",
    "- Markdown goes through an escape step so pasted code cannot inject markup.",
    "",
    "Serve the folder over http so the browser can load ES modules. When the first screen works, add saving, then a custom model.",
    "",
    FOOTNOTE,
  ].join("\n");
}

function codeAdvice(text) {
  const names = uniqueIdentifiers(text);
  const subject = names.length ? names.map((name) => `\`${name}\``).join(", ") : "this snippet";
  const notes = [];
  const aboutTotal = /\bfunction\s+total\b/.test(text) || (/\bitems\b/.test(text) && /\.price\b/.test(text));

  if (/for\s*\(/.test(text) && /\bitems\b/.test(text)) {
    notes.push("The loop assumes `items` is iterable. Check for `null` before iterating.");
  }
  if (/\.price\b/.test(text)) {
    notes.push("`price` is added as-is. A missing or non-numeric price makes the sum `NaN`. Keep the row only when `Number` is finite.");
  }
  if (!notes.length) {
    notes.push("Trace the empty input, a missing field, and a thrown error before changing the happy path.");
    notes.push("Keep the calculation free of network calls and shared mutable state.");
  }

  const lines = [`Here is a review of ${subject}.`, "", "**What I noticed**", ...notes.map((note) => `- ${note}`)];

  if (aboutTotal) {
    lines.push(
      "",
      "**A tighter version**",
      "```js",
      "function total(items = []) {",
      "  return items.reduce((sum, item) => {",
      "    const price = Number(item?.price);",
      "    return Number.isFinite(price) ? sum + price : sum;",
      "  }, 0);",
      "}",
      "```",
    );
  }

  lines.push("", FOOTNOTE);
  return lines.join("\n");
}

function commitAdvice(text) {
  const subject = commitSubject(text);
  return [
    "Use an imperative subject line that names the change.",
    "",
    "**Suggested message**",
    "```text",
    subject,
    "",
    "Describe what the change stores or shows, in one or two sentences.",
    "```",
    "",
    "**Why this shape**",
    "- The first line names the change.",
    "- The body says what a reader will find in the files.",
    "",
    `Drawn from: “${oneLine(text)}”`,
    "",
    FOOTNOTE,
  ].join("\n");
}

function howAdvice(text) {
  return [
    "Make one small version you can run, then widen it.",
    "",
    `**You asked:** ${oneLine(text)}`,
    "",
    "1. Name the input, the output, and the failure you want to see.",
    "2. Build the smallest page or function that does that.",
    "3. Try it in the browser, then split files once the path is real.",
    "",
    "Paste the code or the error next and I will review that text.",
    "",
    FOOTNOTE,
  ].join("\n");
}

function generalAdvice(text) {
  return [
    "Start from the concrete piece you can point at.",
    "",
    `**You wrote:** ${oneLine(text)}`,
    "",
    "- Say what should be true when it works.",
    "- Put the current code or error under that sentence.",
    "- Change one behavior, then re-read the unhappy path.",
    "",
    FOOTNOTE,
  ].join("\n");
}

function hasCodeSignal(text, lower) {
  return text.includes("```") || /\b(function|class|const|let|error|exception|undefined|stack)\b/i.test(text) || lower.includes("review") || lower.includes("bug");
}

function uniqueIdentifiers(text) {
  const found = [];
  for (const match of text.matchAll(/\b(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g)) {
    if (!found.includes(match[1])) found.push(match[1]);
  }
  return found.slice(0, 4);
}

function commitSubject(text) {
  const line = text.split("\n").map((item) => item.trim()).find(Boolean) || "Update the project";
  const adding = line.match(/adding\s+(.+)/i);
  if (adding) {
    const rest = adding[1].replace(/[.\s]+$/, "");
    return `Add ${rest.charAt(0).toLowerCase()}${rest.slice(1)}`;
  }
  const cleaned = line.replace(/^(please\s+)?(write|draft)\s+a\s+clear\s+commit\s+message\s+for\s+/i, "");
  if (cleaned !== line) return commitSubject(cleaned);
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function oneLine(text) {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > 180 ? `${line.slice(0, 179).trimEnd()}…` : line;
}
