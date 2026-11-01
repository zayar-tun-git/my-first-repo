# Cursor AI Chat

A browser chat for coding questions. Conversations stay in this browser. Replies come from a built-in local guide, or from an OpenAI-compatible API when you add a key.

This is a personal demo, independent of Cursor and Anysphere.

## Run

```bash
python3 -m http.server 8765
```

Open http://127.0.0.1:8765.

Serve the folder over http. Opening `index.html` as a file can block the ES modules.

## What you can do

- Start a chat, search old ones, delete with undo, and export the active thread as Markdown.
- Ask the local guide about structure, a pasted function, or a commit message. It answers from patterns in the page and does not call a network model.
- Switch the header to **Custom model**, then save a base URL, model name, and API key in Settings. The key is stored in `localStorage` and sent only to that base URL as a Bearer token.

The request is `POST {baseUrl}/chat/completions` with streaming chat completions.

## Tests

```bash
node --test
```

## Files

- `index.html` — chat list, transcript, composer, settings
- `css/styles.css` — layout and theme
- `js/app.js` — events, history, and sending
- `js/local.js` — built-in replies
- `js/api.js` — custom model client
- `js/markdown.js` — escaped Markdown rendering
- `fonts/` — IBM Plex, under the SIL Open Font License in `fonts/OFL.txt`
