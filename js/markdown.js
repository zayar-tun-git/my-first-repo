export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderMarkdown(source) {
  const text = String(source ?? "").replace(/\r\n/g, "\n");
  const fences = [];
  const stripped = text.replace(/```([\w+-]*)[^\S\n]*\n([\s\S]*?)```/g, (_, lang, code) => {
    const token = `\u0000FENCE${fences.length}\u0000`;
    fences.push({
      lang: String(lang || "").toLowerCase(),
      code: code.replace(/\n$/, ""),
    });
    return `\n${token}\n`;
  });
  return renderPlain(stripped).replace(/\u0000FENCE(\d+)\u0000/g, (token, index) => {
    const fence = fences[Number(index)];
    return fence ? fenceHtml(fence) : escapeHtml(token);
  });
}

function fenceHtml(fence) {
  const label = escapeHtml(fence.lang || "text");
  return `<div class="codeblock"><div class="codeblock-bar"><span>${label}</span><button type="button" data-copy-code>Copy</button></div><pre><code>${escapeHtml(fence.code)}</code></pre></div>`;
}

function renderPlain(source) {
  const lines = source.split("\n");
  let html = "";
  let paragraph = [];
  let list = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html += `<p>${renderInline(paragraph.join(" "))}</p>`;
    paragraph = [];
  };

  const flushList = () => {
    if (!list) return;
    html += `<${list.type}>${list.items}</${list.type}>`;
    list = null;
  };

  for (const line of lines) {
    const fence = line.trim().match(/^\u0000FENCE(\d+)\u0000$/);
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    const ordered = line.match(/^\s*\d+\.\s+(.*)$/);

    if (fence) {
      flushParagraph();
      flushList();
      html += `\u0000FENCE${fence[1]}\u0000`;
      continue;
    }

    if (bullet || ordered) {
      flushParagraph();
      const type = bullet ? "ul" : "ol";
      if (!list || list.type !== type) {
        flushList();
        list = { type, items: "" };
      }
      list.items += `<li>${renderInline((bullet || ordered)[1])}</li>`;
      continue;
    }

    flushList();

    if (heading) {
      flushParagraph();
      const level = heading[1].length;
      html += `<h${level}>${renderInline(heading[2])}</h${level}>`;
      continue;
    }

    if (line.trim() === "") {
      flushParagraph();
      continue;
    }

    paragraph.push(line.trim());
  }

  flushList();
  flushParagraph();
  return html;
}

function renderInline(raw) {
  return raw
    .split(/(`[^`\n]+`)/g)
    .map((part) => {
      if (part.startsWith("`") && part.endsWith("`")) {
        return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
      }
      let html = escapeHtml(part);
      html = html.replace(
        /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
      );
      html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      html = html.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
      return html;
    })
    .join("");
}
