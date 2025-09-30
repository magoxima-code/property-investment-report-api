// /api/generate.js — Vercel Serverless Function (Node 18+, ESM)
// Uses your published Prompt (pmpt_...) + Responses API Structured Outputs (JSON Schema)
// and returns a JSON object shaped like property_investment_report_v1.

export default async function handler(req, res) {
  // CORS / preflight
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST" });

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const OPENAI_PROMPT_ID = process.env.OPENAI_PROMPT_ID; // pmpt_...
  const MODEL = process.env.OPENAI_MODEL || "gpt-5-mini-2025-08-07";

  if (!OPENAI_API_KEY) return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
  if (!OPENAI_PROMPT_ID) return res.status(500).json({ error: "Missing OPENAI_PROMPT_ID" });

  // Parse JSON body (supports streamed body on Vercel)
  let body = req.body;
  if (!body) {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString();
      body = raw ? JSON.parse(raw) : {};
    } catch { body = {}; }
  } else if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  const { address, purchasePrice, overrides } = body || {};
  if (!address || !String(address).trim()) {
    return res.status(400).json({ error: "address is required" });
  }

  // Build the single-line input your Prompt expects
  const priceStr = purchasePrice ? ` — $${purchasePrice}` : "";
  const extra = overrides ? ` ${String(overrides).trim()}` : "";
  const userInput = `${String(address).trim()}${priceStr}${extra}`;

  try {
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        prompt: { id: OPENAI_PROMPT_ID },   // use latest published version
        input: userInput,                    // sending as top-level input (no prompt variables)
        text: {
          // JSON Schema Structured Outputs (flattened fields)
          format: {
            type: "json_schema",
            name: "property_investment_report_v1",
            strict: false,
            schema: PROPERTY_REPORT_JSON_SCHEMA
          }
        }
      }),
    });

    const data = await r.json();
    if (!r.ok) return res.status(r.status).json(data);

    // With json_schema, output_parsed should already be the JS object
    let parsed = data.output_parsed;

    // Defensive fallbacks (in case the shape differs)
    if (!parsed && typeof data.output_text === "string") parsed = safeParseJSON(data.output_text);
    if (!parsed && Array.isArray(data.output)) {
      const firstText = data.output
        .flatMap(m => Array.isArray(m.content) ? m.content : [])
        .find(c => (c.type === "output_text" || c.type === "text") && typeof c.text === "string");
      if (firstText) parsed = safeParseJSON(firstText.text);
    }

    if (!parsed) return res.status(500).json({ error: "No JSON returned", raw: redactLarge(data) });
    return res.status(200).json(parsed);

  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}

function safeParseJSON(s) { try { return s ? JSON.parse(s) : null; } catch { return null; } }
function redactLarge(obj) {
  try {
    const str = JSON.stringify(obj);
    return str.length > 40000 ? JSON.parse(str.slice(0, 40000)) : obj;
  } catch { return { notice: "unable to serialize raw response" }; }
}

// ===== JSON Schema used by Structured Outputs =====
const PROPERTY_REPORT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "version",
    "reportMeta",
    "subject",
    "purchase",
    "propertySnapshot",
    "units",
    "rents",
    "rentComps",
    "operatingAssumptions",
    "financing",
    "totals",
    "sensitivity",
    "negotiation",
    "glossary"
  ],
  properties: {
    version: { type: "string", const: "1.0" },
    reportMeta: {
      type: "object",
      additionalProperties: false,
      required: ["generatedAt", "targetCapPct", "currency", "locale"],
      properties: {
        generatedAt: { type: "string", format: "date-time" },
        targetCapPct: { type: "number", minimum: 0 },
        currency: { type: "string", minLength: 1 },
        locale: { type: "string", minLength: 2 }
      }
    },
    subject: {
      type: "object",
      additionalProperties: false,
      required: ["address"],
      properties: {
        address: { type: "string", minLength: 3 },
        unitLabel: { type: "string" },
        city: { type: "string" },
        state: { type: "string" },
        zip: { type: "string" },
        county: { type: "string" },
        parcelId: { type: "string" },
        mlsId: { type: "string" },
        geo: {
          type: "object",
          additionalProperties: false,
          properties: {
            lat: { type: ["number", "null"], minimum: -90, maximum: 90 },
            lng: { type: ["number", "null"], minimum: -180, maximum: 180 }
          }
        }
      }
    },
    purchase: {
      type: "object",
      additionalProperties: false,
      required: ["purchasePrice", "rehabBudget", "closingCostPct", "pointsPct", "totalCost"],
      properties: {
        purchasePrice: { type: ["number", "null"], minimum: 0 },
        rehabBudget: { type: "number", minimum: 0 },
        closingCostPct: { type: "number", minimum: 0 },
        pointsPct: { type: "number", minimum: 0 },
        totalCost: { type: ["number", "null"], minimum: 0 }
      }
    },
    propertySnapshot: {
      type: "object",
      additionalProperties: false,
      required: ["propertyType", "unitMix", "beds", "baths", "hoa", "taxes", "insurance", "recentUpdates"],
      properties: {
        propertyType: { type: "string" },
        unitMix: { type: "string" },
        beds: { type: "number", minimum: 0 },
        baths: { type: "number", minimum: 0 },
        livingSqft: { type: ["number", "null"], minimum: 0 },
        yearBuilt: { type: ["integer", "null"], minimum: 1800, maximum: 2100 },
        lotSizeSqft: { type: ["number", "null"], minimum: 0 },
        hoa: {
          type: "object",
          additionalProperties: false,
          required: ["hasHoa", "annual", "monthly", "name", "notes"],
          properties: {
            hasHoa: { type: "boolean" },
            annual: { type: "number", minimum: 0 },
            monthly: { type: "number", minimum: 0 },
            name: { type: "string" },
            notes: { type: "string" }
          }
        },
        taxes: {
          type: "object",
          additionalProperties: false,
          required: ["annual", "year"],
          properties: {
            annual: { type: ["number", "null"], minimum: 0 },
            year: { type: ["integer", "null"], minimum: 2000, maximum: 2100 }
          }
        },
        insurance: {
          type: "object",
          additionalProperties: false,
          required: ["dp3Annual", "notes"],
          properties: {
            dp3Annual: { type: ["number", "null"], minimum: 0 },
            notes: { type: "string" }
          }
        },
        recentUpdates: { type: "array", items: { type: "string" } }
      }
    },
    units: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "beds", "baths", "sqft", "modeledRentMonthly", "leaseTermMonths", "notes"],
        properties: {
          name: { type: "string" },
          beds: { type: "number", minimum: 0 },
          baths: { type: "number", minimum: 0 },
          sqft: { type: ["number", "null"], minimum: 0 },
          modeledRentMonthly: { type: ["number", "null"], minimum: 0 },
          leaseTermMonths: { type: "integer", minimum: 1 },
          notes: { type: "string" }
        }
      }
    },
    rents: {
      type: "object",
      additionalProperties: false,
      required: ["benchmarkMedian", "qualityAdjustmentPct", "modeledMarketRentMonthly", "grossScheduledRentMonthly"],
      properties: {
        benchmarkMedian: { type: ["number", "null"], minimum: 0 },
        qualityAdjustmentPct: { type: "number" },
        modeledMarketRentMonthly: { type: ["number", "null"], minimum: 0 },
        grossScheduledRentMonthly: { type: ["number", "null"], minimum: 0 }
      }
    },
    rentComps: {
      type: "array",
      minItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["address", "beds", "baths", "askingRent", "distanceMiles", "conditionNote"],
        properties: {
          address: { type: "string", minLength: 3 },
          beds: { type: "number", minimum: 0 },
          baths: { type: "number", minimum: 0 },
          askingRent: { type: ["number", "null"], minimum: 0 },
          distanceMiles: { type: ["number", "null"], minimum: 0 },
          conditionNote: { type: "string" }
        }
      }
    },
    operatingAssumptions: {
      type: "object",
      additionalProperties: false,
      required: ["vacancyPct", "maintenancePctOfGrossRent", "managementPctOfEGI", "selfManaged", "utilitiesLandlordPaidAnnual", "otherOpExAnnual"],
      properties: {
        vacancyPct: { type: "number", minimum: 0 },
        maintenancePctOfGrossRent: { type: "number", minimum: 0 },
        managementPctOfEGI: { type: "number", minimum: 0 },
        selfManaged: { type: "boolean" },
        utilitiesLandlordPaidAnnual: { type: "number", minimum: 0 },
        otherOpExAnnual: { type: "number", minimum: 0 }
      }
    },
    financing: {
      type: "object",
      additionalProperties: false,
      required: ["downPaymentPct", "rateAnnualPct", "termYears", "loanAmount", "monthlyPI", "annualDebtService"],
      properties: {
        downPaymentPct: { type: "number", minimum: 0 },
        rateAnnualPct: { type: "number", minimum: 0 },
        termYears: { type: "integer", minimum: 1 },
        loanAmount: { type: ["number", "null"], minimum: 0 },
        monthlyPI: { type: ["number", "null"], minimum: 0 },
        annualDebtService: { type: ["number", "null"], minimum: 0 }
      }
    },
    totals: {
      type: "object",
      additionalProperties: false,
      required: ["egiAnnual", "opExAnnual", "noiAnnual", "capRatePct", "dscr", "cashFlowAnnual", "cashOnCashRoiPct", "onePercentRulePct"],
      properties: {
        egiAnnual: { type: ["number", "null"], minimum: 0 },
        opExAnnual: { type: ["number", "null"], minimum: 0 },
        noiAnnual: { type: ["number", "null"], minimum: 0 },
        capRatePct: { type: ["number", "null"], minimum: 0 },
        dscr: { type: ["number", "null"], minimum: 0 },
        cashFlowAnnual: { type: ["number", "null"], minimum: -1000000000 },
        cashOnCashRoiPct: { type: ["number", "null"] },
        onePercentRulePct: { type: ["number", "null"], minimum: 0 }
      }
    },
    sensitivity: {
      type: "object",
      additionalProperties: false,
      required: ["rentMinus10", "baseCase", "rentPlus10", "opExMinus10", "opExPlus10"],
      properties: {
        rentMinus10: { type: "object", additionalProperties: false, required: ["noiAnnual","capRatePct","dscr","cashFlowAnnual"], properties: { noiAnnual: {type:["number","null"]}, capRatePct:{type:["number","null"]}, dscr:{type:["number","null"]}, cashFlowAnnual:{type:["number","null"]} } },
        baseCase:    { type: "object", additionalProperties: false, required: ["noiAnnual","capRatePct","dscr","cashFlowAnnual"], properties: { noiAnnual: {type:["number","null"]}, capRatePct:{type:["number","null"]}, dscr:{type:["number","null"]}, cashFlowAnnual:{type:["number","null"]} } },
        rentPlus10:  { type: "object", additionalProperties: false, required: ["noiAnnual","capRatePct","dscr","cashFlowAnnual"], properties: { noiAnnual: {type:["number","null"]}, capRatePct:{type:["number","null"]}, dscr:{type:["number","null"]}, cashFlowAnnual:{type:["number","null"]} } },
        opExMinus10: { type: "object", additionalProperties: false, required: ["noiAnnual","capRatePct","dscr","cashFlowAnnual"], properties: { noiAnnual: {type:["number","null"]}, capRatePct:{type:["number","null"]}, dscr:{type:["number","null"]}, cashFlowAnnual:{type:["number","null"]} } },
        opExPlus10:  { type: "object", additionalProperties: false, required: ["noiAnnual","capRatePct","dscr","cashFlowAnnual"], properties: { noiAnnual: {type:["number","null"]}, capRatePct:{type:["number","null"]}, dscr:{type:["number","null"]}, cashFlowAnnual:{type:["number","null"]} } }
      }
    },
    negotiation: {
      type: "object",
      additionalProperties: false,
      required: ["targetCapPct", "maxPurchasePriceAtTargetCap", "assumptions"],
      properties: {
        targetCapPct: { type: "number", minimum: 0 },
        maxPurchasePriceAtTargetCap: { type: ["number", "null"], minimum: 0 },
        assumptions: {
          type: "object",
          additionalProperties: false,
          required: ["closingCostPct", "pointsPct"],
          properties: {
            closingCostPct: { type: "number", minimum: 0 },
            pointsPct: { type: "number", minimum: 0 }
          }
        }
      }
    },
    glossary: {
      type: "object",
      additionalProperties: false,
      required: ["EGI", "OpEx", "NOI", "Cap", "DSCR", "CoC"],
      properties: {
        EGI: { type: "string" },
        OpEx: { type: "string" },
        NOI: { type: "string" },
        Cap: { type: "string" },
        DSCR: { type: "string" },
        CoC: { type: "string" }
      }
    }
  }
};

