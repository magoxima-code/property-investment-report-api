// Vercel Serverless Function: /api/generate
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST" });

  let body = req.body;
  if (!body) {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
    } catch { body = {}; }
  }

  const { address, purchasePrice, overrides } = body;
  if (!address) return res.status(400).json({ error: "address is required" });

  const priceStr = purchasePrice ? ` — $${purchasePrice}` : "";
  const extra = overrides ? ` ${overrides}` : "";
  const userInput = `${address}${priceStr}${extra}`;

  try {
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        prompt: { id: process.env.OPENAI_PROMPT_ID, version: "1" },
        input: userInput
      }),
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json(data);

    const parsed = data.output_parsed ??
      (typeof data.output_text === "string" ? safeParseJSON(data.output_text) : null);
    if (!parsed) return res.status(500).json({ error: "No JSON returned", raw: data });

    return res.status(200).json(parsed);
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
function safeParseJSON(s){ try{ return s ? JSON.parse(s) : null; }catch{ return null; } }
