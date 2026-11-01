# Cursor AI

Project created: **November 1, 2026**.

Cursor AI is a simple chat app that runs in your web browser. There's nothing to install. Out of the box it runs in **demo mode** with simple ready-made replies. Add a free Google Gemini key and it gives real AI answers.

## 1. Open the app
1. Open the `cursor-ai` folder.
2. Double-click **index.html**. It opens in your browser (Edge or Chrome).
3. Type a message. Press **Enter** to send, or **Shift+Enter** for a new line.
4. **+ New chat** clears the conversation. Your chats are saved in this browser.

The line under the message box tells you which mode you're in: **Demo mode** or **Connected to Gemini (model name)**.

## 2. Get a free Gemini key
1. Go to **https://aistudio.google.com/apikey** and sign in with your Google account.
2. Click **Create API key** and accept the terms if asked.
3. Click **Copy** next to the new key. It's a long line of letters and numbers.

You don't need a credit card. The free tier costs nothing.

## 3. Put the key in the app
1. In Cursor AI, click **⚙ Settings** at the top right.
2. Paste the key into **Gemini API key**. Click **Show** if you want to check it.
3. Leave **Model** as `gemini-3.8-flash` (the current free model).
4. Click **Save**. The bottom line should now say "Connected to Gemini".

Click **Clear** in Settings to remove the key and go back to demo mode.

## Keep your key safe
- The key is saved **only in this browser on this computer**. It isn't put inside the app's files.
- Treat it like a password. **Don't share it, post it online, or send it in screenshots.**
- If you think someone else has it, delete it at aistudio.google.com/apikey and make a new one.
- On a shared computer, click **Clear** when you're done.

## Free-tier limits
- The free tier only lets you send a certain number of messages per minute and per day. You can see your limits in Google AI Studio.
- If you go over, the app says so. Wait a minute and try again. The daily limit resets at midnight US Pacific time (about 2–3 PM in Thailand).
- On the free tier, Google may use your messages to improve its products, so don't type private information.

## Troubleshooting
| What you see | What to do |
|---|---|
| "Your Gemini API key doesn't seem to work" | Copy the key again from AI Studio, paste it in Settings, and click Save. Make sure there are no extra spaces. |
| "You've hit the free-tier limit" | Wait a minute, or try again tomorrow. |
| "The model ... wasn't found" | In Settings, change Model to `gemini-3.5-flash-lite` (or `gemini-2.0-flash` on older accounts) and click Save. |
| "I couldn't reach Gemini" | Check your internet connection. Some work or school networks block it. |
| Still says "Demo mode" | You haven't saved a key yet. Open Settings, paste it, and click Save. |
| Chats or key disappeared | They're stored per browser. If you open the app in a different browser or clear browsing data, you'll need to add the key again. |

## Files
- `index.html` – the page and the Settings window.
- `styles.css` – the look.
- `app.js` – the logic: demo replies (`mockReply`), the Gemini connection (`geminiReply`), and settings.

## For the curious: how it works
- **Demo mode:** `mockReply(message)` in `app.js` picks a ready-made answer based on words like "hello", "joke", or "time".
- **Gemini mode:** `geminiReply` sends your recent messages (up to 20) to Google's Gemini service (`generateContent`) and shows the answer.
- `getReply` chooses between the two depending on whether a key is saved.
