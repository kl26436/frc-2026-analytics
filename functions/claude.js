/**
 * Claude AI Proxy — Firebase Cloud Function
 *
 * Streams Claude API responses to the frontend via Server-Sent Events (SSE).
 * The Anthropic API key is stored as a Firebase secret:
 *   firebase functions:secrets:set ANTHROPIC_API_KEY
 *
 * Deploy:
 *   firebase deploy --only functions
 */

const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

if (getApps().length === 0) initializeApp();

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

const ALLOWED_ORIGINS = [
  "https://kl26436.github.io",
  "https://data-wrangler-2026.web.app",
  "https://data-wrangler-2026.firebaseapp.com",
  "https://analytics.bigsurf.fit",
  "https://team.148.wtf",
  "https://148.ninja",
  "http://localhost:5173",
];

function getCorsOrigin(req) {
  const origin = req.headers.origin || "";
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

exports.claudeProxy = onRequest(
  {
    secrets: [ANTHROPIC_API_KEY],
    timeoutSeconds: 120,
    memory: "256MiB",
    region: "us-central1",
    maxInstances: 10,
    cors: ALLOWED_ORIGINS,
  },
  async (req, res) => {

    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    // Verify Firebase Auth token
    const authHeader = req.headers.authorization || "";
    const match = authHeader.match(/^Bearer (.+)$/);
    if (!match) {
      res.status(401).json({ error: "Missing authorization token" });
      return;
    }

    try {
      await getAuth().verifyIdToken(match[1]);
    } catch {
      res.status(401).json({ error: "Invalid authorization token" });
      return;
    }

    const { prompt, model, maxTokens } = req.body;
    if (!prompt || typeof prompt !== "string") {
      res.status(400).json({ error: "prompt is required" });
      return;
    }

    const selectedModel = model || "claude-haiku-4-5-20251001";
    const tokens = Math.min(maxTokens || 4096, 8192);

    // Set up SSE streaming
    res.set("Content-Type", "text/event-stream");
    res.set("Cache-Control", "no-cache");
    res.set("Connection", "keep-alive");
    res.set("X-Accel-Buffering", "no");

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY.value(),
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: selectedModel,
          max_tokens: tokens,
          stream: true,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        res.write(`data: ${JSON.stringify({ type: "error", error: `API error ${response.status}: ${errorText}` })}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") continue;

          try {
            const event = JSON.parse(data);
            if (event.type === "content_block_delta" && event.delta?.text) {
              res.write(`data: ${JSON.stringify({ type: "text", text: event.delta.text })}\n\n`);
            } else if (event.type === "message_stop") {
              // done
            } else if (event.type === "message_start" && event.message?.usage) {
              res.write(`data: ${JSON.stringify({ type: "usage", usage: event.message.usage })}\n\n`);
            } else if (event.type === "message_delta" && event.usage) {
              res.write(`data: ${JSON.stringify({ type: "usage_final", usage: event.usage })}\n\n`);
            }
          } catch {
            // skip unparseable lines
          }
        }
      }

      res.write("data: [DONE]\n\n");
      res.end();
    } catch (err) {
      res.write(`data: ${JSON.stringify({ type: "error", error: err.message })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    }
  }
);
