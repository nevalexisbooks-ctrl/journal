// ─── claudeProxy — ora usa Gemini invece di Anthropic ────────────────────────
// Riceve dal frontend lo stesso formato (model, max_tokens, system, messages).
// Traduce in formato Gemini, chiama l'API, ritorna {content:[{text:"..."}]}
// in modo che il frontend non debba cambiare la gestione delle risposte.
// La GEMINI_KEY è un Firebase Secret (firebase functions:secrets:set GEMINI_KEY).
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const fetch  = require("node-fetch");
const admin  = require("firebase-admin");

admin.initializeApp();

const GEMINI_KEY  = defineSecret("GEMINI_KEY");
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/** Converte messaggi formato Anthropic → formato Gemini */
function toGeminiContents(messages) {
  return messages.map(m => ({
    role:  m.role === "assistant" ? "model" : "user",
    parts: [{ text: typeof m.content === "string"
      ? m.content
      : (m.content ?? []).map(c => c.text ?? "").join("") }],
  }))
}

exports.claudeProxy = onRequest(
  { secrets: [GEMINI_KEY] },
  async (req, res) => {
    res.set("Access-Control-Allow-Origin",  "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }

    try {
      const apiKey = GEMINI_KEY.value();
      if (!apiKey) {
        res.status(500).json({ error: { message: "GEMINI_KEY non configurata" } });
        return;
      }

      const {
        model      = "gemini-2.5-flash-lite",
        max_tokens = 350,
        system,
        messages   = [],
      } = req.body;

      // ── Costruisce corpo richiesta Gemini ──────────────────────
      const geminiBody = {
        contents: toGeminiContents(messages),
        generationConfig: {
          maxOutputTokens: max_tokens,
          // Disabilita il thinking dei modelli 2.5: risparmia token e previene troncature
          thinkingConfig: { thinkingBudget: 0 },
        },
      };
      if (system) {
        geminiBody.system_instruction = { parts: [{ text: system }] };
      }

      // ── Chiama Gemini REST API ──────────────────────────────────
      const url = `${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`;
      const geminiRes = await fetch(url, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(geminiBody),
      });

      const data = await geminiRes.json();

      if (!geminiRes.ok) {
        console.error("Gemini error:", JSON.stringify(data));
        res.status(geminiRes.status).json({
          error: { message: data.error?.message ?? `Gemini HTTP ${geminiRes.status}` },
        });
        return;
      }

      // ── Traduce risposta → formato Anthropic atteso dal frontend ─
      const candidate   = data.candidates?.[0];
      const finishReason = candidate?.finishReason ?? "UNKNOWN";
      // Concatena tutte le parti visibili (esclude eventuali blocchi thought)
      const parts = candidate?.content?.parts ?? [];
      const text  = parts.filter(p => !p.thought).map(p => p.text ?? "").join("");
      if (finishReason !== "STOP") {
        console.warn(`Gemini finishReason: ${finishReason} — testo parziale: ${text.length} chars`);
      }
      res.json({ content: [{ text }] });

    } catch (err) {
      console.error("claudeProxy error:", err);
      res.status(500).json({ error: { message: err.message } });
    }
  }
);
