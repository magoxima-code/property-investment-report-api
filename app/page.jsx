"use client";
import React, { useMemo, useState } from "react";
import { ArrowRight, Loader2, FileDown } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL; // set in Vercel

const fmtUSD = (n) =>
  n == null || isNaN(n)
    ? "-"
    : Number(n).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const pct = (n) => (n * 100).toFixed(2) + "%";

export default function Page() {
  const [address, setAddress] = useState("");
  const [price, setPrice] = useState("");
  const [overrides, setOverrides] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [requestJSON, setRequestJSON] = useState(null);
  const [responseJSON, setResponseJSON] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const numericPrice = Number((price || "").toString().replace(/[$,\s]/g, "")) || undefined;
    const payload = { address: address.trim(), purchasePrice: numericPrice, overrides: overrides.trim() || undefined };
    setRequestJSON(payload);
    try {
      const res = await fetch(API_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `API error ${res.status}`);
      setResponseJSON(mapFromSchema(data));
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-6xl mx-auto grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold mb-3">Build Report</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-sm text-slate-600 mb-1">Property Address</label>
                <input className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                       placeholder="111/113 Cultural Park Blvd S, Cape Coral, FL 33990"
                       value={address} onChange={(e) => setAddress(e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">Purchase Price (USD)</label>
                <input className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                       placeholder="$500,000" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">Overrides (optional)</label>
                <input className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                       placeholder="self-managed; rate 7.6%; down 25%" value={overrides} onChange={(e) => setOverrides(e.target.value)} />
              </div>
              <button type="submit" className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 text-white px-4 py-2 text-sm shadow hover:bg-indigo-700 disabled:opacity-60" disabled={loading || !API_URL}>
                {loading ? (<><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>) : (<>Generate <ArrowRight className="h-4 w-4" /></>)}
              </button>
              {!API_URL && <div className="text-xs text-rose-600 mt-2">Set NEXT_PUBLIC_API_URL in Vercel</div>}
              {error && <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
            </form>
          </div>
          <div className="mt-6 grid gap-6">
            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="text-sm font-medium mb-2">JSON Request</div>
              <pre className="text-xs overflow-auto whitespace-pre-wrap">{requestJSON ? JSON.stringify(requestJSON, null, 2) : "(submit form to see)"}</pre>
            </div>
            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="text-sm font-medium mb-2">JSON Response (mapped → report)</div>
              <pre className="text-xs overflow-auto whitespace-pre-wrap">{responseJSON ? JSON.stringify(responseJSON, null, 2) : "(awaiting response)"}</pre>
            </div>
          </div>
        </div>
        <div className="lg:col-span-2">
          {responseJSON ? <Report data={responseJSON} /> : (
            <div className="rounded-2xl border bg-white p-10 shadow-sm text-center text-slate-500">The report will render here after you Generate.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function mapFromSchema(x){
  const pctToDec = (n,def=0)=> typeof n==="number"? n/100 : def;
  const yearsToMonths = (y,def=30)=> typeof y==="number"? y*12 : def*12;
  const units = Array.isArray(x.units)&&x.units.length? x.units.map(u=>({ name: u.name, rent: u.modeledRentMonthly ?? 0 })) : [{ name:"Unit A", rent:0 }];
  const comps = Array.isArray(x.rentComps)? x.rentComps.map(c=>({ label: c.address, rent: c.askingRent ?? 0, beds: `${c.beds}/${c.baths}`, dist: c.distanceMiles ?? 0, condition: c.conditionNote })) : [];
  return {
    address: x.subject?.address ?? "",
    purchasePrice: x.purchase?.purchasePrice ?? 0,
    closingPct: x.purchase?.closingCostPct ?? 0.02,
    pointsOnLoanPctOfPrice: x.purchase?.pointsPct ?? 0,
    vacancyRate: pctToDec(x.operatingAssumptions?.vacancyPct, 0.05),
    maintPctOfGrossRent: pctToDec(x.operatingAssumptions?.maintenancePctOfGrossRent, 0.08),
    mgmtPctOfEGI: pctToDec(x.operatingAssumptions?.managementPctOfEGI, 0.08),
    insuranceAnnual: x.propertySnapshot?.insurance?.dp3Annual ?? 0,
    taxesAnnual: x.propertySnapshot?.taxes?.annual ?? 0,
    hoaAnnual: x.propertySnapshot?.hoa?.annual ?? 0,
    utilsAnnualLL: x.operatingAssumptions?.utilitiesLandlordPaidAnnual ?? 0,
    otherAnnual: x.operatingAssumptions?.otherOpExAnnual ?? 0,
    units,
    financing: {
      downPct: pctToDec(x.financing?.downPaymentPct, 0.25),
      rateAnnual: pctToDec(x.financing?.rateAnnualPct, 0.077),
      termMonths: yearsToMonths(x.financing?.termYears, 30),
    },
    comps
  };
}

function withDefaults(x){
  const d = {
    address: x.address || "",
    purchasePrice: x.purchasePrice ?? 0,
    closingPct: x.closingPct ?? 0.03,
    pointsOnLoanPctOfPrice: x.pointsOnLoanPctOfPrice ?? 0.0075,
    vacancyRate: x.vacancyRate ?? 0.05,
    maintPctOfGrossRent: x.maintPctOfGrossRent ?? 0.08,
    mgmtPctOfEGI: x.mgmtPctOfEGI ?? 0.08,
    insuranceAnnual: x.insuranceAnnual ?? 0,
    taxesAnnual: x.taxesAnnual ?? 0,
    otherAnnual: x.otherAnnual ?? 0,
    hoaAnnual: x.hoaAnnual ?? 0,
    utilsAnnualLL: x.utilsAnnualLL ?? 0,
    units: Array.isArray(x.units)&&x.units.length? x.units : [{ name:"Unit A", rent:0 }],
    financing: { downPct: x.financing?.downPct ?? 0.25, rateAnnual: x.financing?.rateAnnual ?? 0.077, termMonths: x.financing?.termMonths ?? 360 },
    comps: x.comps ?? [],
  };
  return d;
}

function Report({ data }){
  const d = useMemo(()=>withDefaults(data),[data]);
  const monthlyRent = d.units.reduce((s,u)=>s+(u.rent||0),0);
  const annualGSR = monthlyRent*12;
  const vacancy = annualGSR*d.vacancyRate;
  const egi = annualGSR - vacancy;
  const maint = annualGSR*d.maintPctOfGrossRent;
  const mgmt = egi*d.mgmtPctOfEGI;
  const opEx = d.taxesAnnual + d.insuranceAnnual + d.hoaAnnual + maint + mgmt + d.utilsAnnualLL + d.otherAnnual;
  const noi = egi - opEx;
  const closingCost = d.purchasePrice * d.closingPct;
  const totalCost = d.purchasePrice + closingCost;
  const loanAmount = d.purchasePrice * (1 - d.financing.downPct);
  const r = d.financing.rateAnnual/12;
  const n = d.financing.termMonths;
  const monthlyPI = (loanAmount*r) / (1 - Math.pow(1+r,-n));
  const annualDebtService = monthlyPI*12;
  const dscr = noi/annualDebtService;
  const pointsCost = d.purchasePrice * d.pointsOnLoanPctOfPrice;
  const cashInvested = d.purchasePrice*d.financing.downPct + closingCost + pointsCost;
  const cashFlow = noi - annualDebtService;
  const capRate = noi/totalCost;

  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Investment Report — {d.address}</h1>
          <p className="text-slate-500 mt-1">Prepared: {new Date().toLocaleDateString()}</p>
        </div>
        <button className="rounded-2xl bg-indigo-600 text-white px-3 py-2 text-sm shadow hover:bg-indigo-700" onClick={()=>window.print()}>
          <FileDown className="inline h-4 w-4 mr-1" /> Download / Print PDF
        </button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
        <Metric label="Purchase Price" value={fmtUSD(d.purchasePrice)} />
        <Metric label="NOI" value={fmtUSD(noi)} sub="Net Operating Income (yr)" />
        <Metric label="Cap Rate" value={pct(capRate)} />
        <Metric label="Monthly P&I" value={fmtUSD(monthlyPI)} />
        <Metric label="DSCR" value={(dscr||0).toFixed(2)+"×"} />
        <Metric label="Cash Flow (yr)" value={fmtUSD(cashFlow)} />
        <Metric label="Total Cost" value={fmtUSD(totalCost)} />
      </div>

      <div className="mt-6 rounded-2xl border bg-white p-4">
        <div className="text-sm font-medium mb-2">Units & Rents</div>
        <table className="w-full text-sm"><tbody className="divide-y">
          {d.units.map((u,i)=>(<tr key={i}><td className="py-1">{u.name}</td><td className="py-1 text-right">{fmtUSD(u.rent)}/mo</td></tr>))}
        </tbody></table>
      </div>
    </div>
  );
}

function Metric({label,value,sub}){
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm flex flex-col gap-1">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="text-2xl font-semibold text-slate-900">{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
}
