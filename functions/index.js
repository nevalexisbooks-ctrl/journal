const functions = require("firebase-functions");
const fetch = require("node-fetch");

exports.claudeProxy = functions.https.onRequest(async (req, res) => {
  // ── CORS ─────────────────────────────────────────────────────────────────
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }

  try {
    const apiKey = functions.config().anthropic.key;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    console.error("claudeProxy error:", err);
    res.status(500).json({ error: { message: err.message } });
  }
});
