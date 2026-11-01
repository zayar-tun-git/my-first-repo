export function takeSseEvents(buffer) {
  const lines = String(buffer).split("\n");
  const rest = lines.pop() ?? "";
  const deltas = [];
  let done = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload) continue;
    if (payload === "[DONE]") {
      done = true;
      continue;
    }
    try {
      const json = JSON.parse(payload);
      const delta = json.choices?.[0]?.delta?.content;
      if (typeof delta === "string" && delta) deltas.push(delta);
    } catch {
      // Ignore keep-alives and incomplete JSON lines.
    }
  }

  return { rest, deltas, done };
}
