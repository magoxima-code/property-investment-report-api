// /api/generate.js  — Vercel Serverless Function (Node 18, ESM)
// Calls your published OpenAI Prompt (pmpt_...) and returns JSON only.
//
// Env vars required in Vercel Project Settings:
//   OPENAI_API_KEY   = your OpenAI API key
//   OPENAI_PROMPT_ID = pmpt_... from “Your prompt was published”
//
// This endpoint expects: { address, purchasePrice?, overrides? } via POST.
// It returns the JSON object produced by your prompt (no prose).

export default async function handler(req, res) {
  // --- CORS / preflight ---
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST" });

  // --- Basic env validation ---
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const OPENAI_PROMPT_ID = process.env.OPENAI_PROMPT_ID;
  if (!OPENAI_API_KEY) return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
  if (!OPENAI_PROMPT_ID) return res.status(500).json({ error: "Missing OPENAI_PROMPT_ID" });

  // --- Parse JSON body (supports streamed body on Vercel/Node) ---
  let body = req.body;
  if (!body) {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString();
      body = raw ? JSON.parse(raw) : {};
    } catch {
      body = {};
    }
  } else if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  const { address, purchasePrice, overrides } = body || {};
  if (!address || typeof address !== "string" || !address.trim()) {
    return res.status(400).json({ error: "address is required" });
  }

  // Build the one-line input your prompt expects (address + optional price/overrides)
  const priceStr = purchasePrice ? ` — $${purchasePrice}` : "";
  const extra = overrides ? ` ${String(overrides).trim()}` : "";
  const userInput = `${address.trim()}${priceStr}${extra}`;

  try {
    // --- Call OpenAI Responses API with your Prompt ID ---
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        // Use your published prompt asset
        prompt: { id: OPENAI_PROMPT_ID, version: "1" },
        // Provide the single-line input for the prompt to parse
        input: userInput,
        // Force JSON-only output (no prose). Swap to json_schema later if you want strict validation.
        response_format: { type: "json_object" }
      }),
    });

    const data = await r.json();
    if (!r.ok) {
      // Bubble up OpenAI errors (rate limit, auth, etc.)
      return res.status(r.status).json(data);
    }

    // --- Robust parsing across possible Responses API shapes ---
    let parsed = data.output_parsed;

    if (!parsed && typeof data.output_text === "string") {
      parsed = safeParseJSON(data.output_text);
    }

    if (!parsed && Array.isArray(data.output)) {
      // responses.output[].content[] may contain { type: "output_text" | "text", text: "..." }
      const firstText = data.output
        .flatMap(m => Array.isArray(m.content) ? m.content : [])
        .find(c => (c.type === "output_text" || c.type === "text") && typeof c.text === "string");
      if (firstText) parsed = safeParseJSON(firstText.text);
    }

    if (!parsed) {
      return res.status(500).json({ error: "No JSON returned", raw: redactLarge(data) });
    }

    // Success: return the JSON object your prompt produced
    return res.status(200).json(parsed);

  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}

function safeParseJSON(s) {
  try { return s ? JSON.parse(s) : null; } catch { return null; }
}

function redactLarge(obj) {
  try {
    const str = JSON.stringify(obj);
    return str.length > 40_000 ? JSON.parse(str.slice(0, 40_000)) : obj;
  } catch { return { notice: "unable to serialize raw response" }; }
}
