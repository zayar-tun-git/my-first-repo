import { takeSseEvents } from "./sse.js";

const SYSTEM_PROMPT = "You are a concise coding assistant. Use markdown. Prefer short explanations and concrete code.";

export async function streamChat({ baseUrl, apiKey, model, messages, signal, onDelta }) {
  const root = String(baseUrl || "").replace(/\/$/, "");
  const response = await fetch(`${root}/chat/completions`, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      stream: true,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...messages
          .filter((message) => message && message.content && (message.role === "user" || message.role === "assistant"))
          .map((message) => ({ role: message.role, content: message.content })),
      ],
    }),
  });

  if (!response.ok) {
    let detail = "";
    try {
      detail = (await response.text()).slice(0, 280);
    } catch {
      detail = "";
    }
    throw new Error(detail ? `The API returned ${response.status}. ${detail}` : `The API returned ${response.status}.`);
  }

  const type = response.headers.get("content-type") || "";
  if (!response.body || !type.includes("text/event-stream")) {
    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content || "";
    onDelta(text);
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parsed = takeSseEvents(buffer);
    buffer = parsed.rest;
    if (parsed.deltas.length) {
      full += parsed.deltas.join("");
      onDelta(full);
    }
    if (parsed.done) break;
  }

  return full;
}
