import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { motion } from "framer-motion";
import { ChevronRight, ChevronLeft, LogIn, Loader2, ShieldCheck, X } from "lucide-react";

/*********************
 * Minimal 2-step app (no SDK)
 * Step 1: Login (Client ID + Region) via OAuth Implicit Grant redirect
 * Step 2: Criteria builder (with live lookups via fetch + Bearer token)
 *
 * This uses the pattern we used on previous client apps: build the
 * authorize URL, redirect, parse the access_token from the URL hash,
 * store it in sessionStorage, and call the APIs with fetch.
 *********************/

// -------------------- Auth + API helpers (no SDK) --------------------
let GC_TOKEN = sessionStorage.getItem("gc_token") || "";
let GC_REGION = sessionStorage.getItem("gc_region") || ""; // e.g. mypurecloud.ie

function setToken(token){
  GC_TOKEN = token || "";
  if (token) sessionStorage.setItem("gc_token", token);
  else sessionStorage.removeItem("gc_token");
}
function setRegion(region){
  GC_REGION = region || "";
  if (region) sessionStorage.setItem("gc_region", region);
  else sessionStorage.removeItem("gc_region");
}

function apiBase(){
  if (!GC_REGION) throw new Error("Region not set");
  return `https://api.${GC_REGION}`;
}

function buildUrl(path, query){
  const q = new URLSearchParams();
  if (query) Object.entries(query).forEach(([k,v]) => {
    if (v === undefined || v === null) return;
    if (Array.isArray(v)) v.forEach(val => q.append(k, String(val)));
    else q.append(k, String(v));
  });
  const qs = q.toString();
  return `${apiBase()}${path}${qs ? `?${qs}` : ""}`;
}

async function apiFetch(path, init){
  if (!GC_TOKEN) throw new Error("Not authenticated");
  const res = await fetch(buildUrl(path), {
    ...init,
    headers: {
      Authorization: `Bearer ${GC_TOKEN}`,
      "Content-Type": "application/json",
      ...(init && init.headers ? init.headers : {})
    }
  });
  if (!res.ok) {
    const text = await res.text().catch(()=>"");
    throw new Error(`API ${path} failed: ${res.status} ${res.statusText} ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function getAllPages(path, params = {}, maxPages = 50){
  let pageNumber = params.pageNumber || 1;
  const pageSize = params.pageSize || 100;
  const out = [];
  for (let i=0; i<maxPages; i++){
    const qs = new URLSearchParams({ ...params, pageNumber: String(pageNumber), pageSize: String(pageSize) });
    const data = await apiFetch(`${path}?${qs}`);
    const entities = (data && (data.entities || data.items)) || [];
    out.push(...entities);
    if (!data || !data.nextUri) break;
    pageNumber++;
  }
  return out;
}

function parseAuthHash(hash){
  if (!hash || hash.length < 2) return null;
  if (hash[0] === '#') hash = hash.slice(1);
  const p = new URLSearchParams(hash);
  const accessToken = p.get('access_token');
  if (!accessToken) return null;
  return {
    accessToken,
    tokenType: p.get('token_type'),
    expiresIn: Number(p.get('expires_in') || 0),
    state: p.get('state') || ''
  };
}

function stripHash(){
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
}

function buildAuthorizeUrl({ clientId, region, redirectUri, state }){
  const base = `https://login.${region}/oauth/authorize`;
  const qs = new URLSearchParams({
    response_type: 'token',
    client_id: clientId,
    redirect_uri: redirectUri,
    state
  });
  return `${base}?${qs}`;
}

// -------------------- Lookups --------------------
async function fetchUsers(){
  const entities = await getAllPages("/api/v2/users", { state: "active", pageSize: 100 });
  return entities.map(u => ({ id: u.id, label: u.name || u.username || u.id }));
}
async function fetchQueues(){
  const entities = await getAllPages("/api/v2/routing/queues", { pageSize: 100 });
  return entities.map(q => ({ id: q.id, label: q.name }));
}
async function fetchSkills(){
  const entities = await getAllPages("/api/v2/routing/skills", { pageSize: 200 });
  return entities.map(s => ({ id: s.id, label: s.name }));
}
async function fetchLanguages(){
  const entities = await getAllPages("/api/v2/routing/languages", { pageSize: 200 });
  return entities.map(l => ({ id: l.id, label: l.name || l.code || l.id }));
}
async function fetchWorkTeams(){
  const entities = await getAllPages("/api/v2/teams", { pageSize: 200 });
  return entities.map(t => ({ id: t.id, label: t.name }));
}
async function fetchWrapUpCodes(){
  const entities = await getAllPages("/api/v2/routing/wrapupcodes", { pageSize: 200 });
  return entities.map(w => ({ id: w.id, label: w.name }));
}
async function fetchTopics(){
  const entities = await getAllPages("/api/v2/speechandtextanalytics/topics", { pageSize: 200 });
  return entities.map(t => ({ id: t.id, label: t.name }));
}
async function fetchCategories(){
  const entities = await getAllPages("/api/v2/speechandtextanalytics/categories", { pageSize: 200 });
  return entities.map(c => ({ id: c.id, label: c.name }));
}

// -------------------- Small UI helpers --------------------
function Stepper({ step, setStep }){
  const steps = [
    { n: 1, label: "Login" },
    { n: 2, label: "Criteria" },
  ];
  return (
    <div className="flex items-center gap-3 mb-6">
      {steps.map((s, idx) => (
        <div key={s.n} className="flex items-center gap-3">
          <button
            className={`text-sm px-3 py-1 rounded-full border ${step === s.n ? "bg-black text-white" : "bg-white"}`}
            onClick={() => setStep(s.n)}
          >{s.n}. {s.label}</button>
          {idx < steps.length - 1 && <ChevronRight className="w-4 h-4 opacity-60" />}
        </div>
      ))}
    </div>
  );
}

function RegionSelect({ region, setRegion }){
  const regions = [
    ["mypurecloud.com","US East"],
    ["usw2.pure.cloud","US West"],
    ["cac1.pure.cloud","Canada"],
    ["euw2.pure.cloud","EU West"],
    ["mypurecloud.ie","EU Ireland"],
    ["mypurecloud.de","EU Germany"],
    ["aps1.pure.cloud","AP South 1"],
    ["apne2.pure.cloud","AP Northeast 2"],
    ["apse2.pure.cloud","AP Southeast 2"],
    ["sae1.pure.cloud","South America East"],
    ["mypurecloud.jp","Japan"],
    ["mypurecloud.au","Australia"],
  ];
  return (
    <select value={region} onChange={(e)=> setRegion(e.target.value)} className="mt-2 w-full border rounded-md p-2">
      {regions.map(([val,label]) => <option key={val} value={val}>{label} ({val})</option>)}
    </select>
  );
}

function MultiSelect({ label, options, value, onChange, placeholder="Type to search…" }){
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => options.filter(o => (o.label||"").toLowerCase().includes(query.toLowerCase())), [options, query]);

  function toggle(id){
    if (value.includes(id)) onChange(value.filter(v => v !== id));
    else onChange([...value, id]);
  }
  function remove(id){ onChange(value.filter(v => v !== id)); }

  function labelFor(id){ return (options.find(o => o.id === id)?.label) || id; }

  return (
    <div className="w-full">
      <label className="block text-sm font-medium mb-1">{label}</label>
      <div className="flex flex-wrap gap-2 mb-2">
        {value.map(v => (
          <span key={v} className="inline-flex items-center gap-1 text-xs bg-gray-200 rounded px-2 py-1">
            {labelFor(v)}
            <button className="hover:text-red-600" onClick={() => remove(v)}><X className="w-3 h-3"/></button>
          </span>
        ))}
      </div>
      <div className="relative">
        <input
          className="w-full border rounded-md p-2"
          placeholder={placeholder}
          value={query}
          onChange={(e)=> { setQuery(e.target.value); setOpen(true); }}
          onFocus={()=> setOpen(true)}
        />
        {open && (
          <div className="absolute z-10 mt-1 w-full bg-white border rounded-md max-h-56 overflow-auto shadow">
            {filtered.length === 0 ? (
              <div className="p-3 text-sm text-gray-500">No results</div>
            ) : (
              filtered.map(opt => (
                <button key={opt.id} className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2" onClick={()=> toggle(opt.id)}>
                  <input type="checkbox" readOnly checked={value.includes(opt.id)} />
                  <span>{opt.label}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// -------------------- Screens --------------------
function SplashLogin({ onLogin }){
  const [clientId, setClientId] = useState("");
  const [region, setRegionLocal] = useState(GC_REGION || "mypurecloud.com");
  const [loading, setLoading] = useState(false);
  const [me, setMe] = useState(null);

  // On load, parse token from hash (implicit grant redirect)
  useEffect(() => {
    const parsed = parseAuthHash(location.hash);
    if (parsed && parsed.accessToken) {
      setToken(parsed.accessToken);
      // Region is encoded in state as "qpw|<region>"
      if (parsed.state && parsed.state.startsWith('qpw|')) {
        const r = parsed.state.split('|')[1];
        if (r) { setRegion(r); setRegionLocal(r); }
      }
      stripHash();
      // Try to fetch current user
      (async () => {
        try {
          const me = await apiFetch('/api/v2/users/me');
          setMe(me);
          onLogin({ me });
        } catch (e) {
          console.warn('Could not fetch /me after login:', e);
        }
      })();
    }
  }, []);

  return (
    <div className="max-w-xl mx-auto bg-white rounded-2xl shadow p-8">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-semibold mb-2">Custom Quality Policies</h1>
        <p className="text-sm text-gray-600 mb-6">Enter your OAuth Client ID, select your region, and sign in.</p>
      </motion.div>

      <label className="block text-sm font-medium">Client ID</label>
      <input className="w-full border rounded-md p-2 mt-1 mb-4" value={clientId} onChange={(e)=> setClientId(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />

      <label className="block text-sm font-medium">Region</label>
      <RegionSelect region={region} setRegion={setRegionLocal} />

      <button
        disabled={!clientId || loading}
        onClick={async ()=>{
          try {
            setLoading(true);
            setRegion(region); // persist
            const redirectUri = window.location.origin + window.location.pathname; // SPA-friendly
            const authUrl = buildAuthorizeUrl({ clientId: clientId.trim(), region, redirectUri, state: `qpw|${region}` });
            window.location.assign(authUrl);
          } finally { setLoading(false); }
        }}
        className="mt-6 w-full inline-flex items-center justify-center gap-2 bg-black text-white rounded-md py-2"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin"/> : <LogIn className="w-4 h-4"/>}
        Sign in
      </button>
      <p className="mt-3 text-xs text-gray-500 flex items-center gap-1 justify-center"><ShieldCheck className="w-3 h-3"/> OAuth implicit grant (no SDK)</p>
    </div>
  );
}

function Criteria({ criteria, setCriteria, lookups }){
  const { users, queues, skills, languages, workTeams, wrapUps, topics, categories } = lookups;
  return (
    <div className="bg-white rounded-2xl shadow p-6 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium">Date range (UTC)</label>
          <div className="flex gap-3 mt-1">
            <input type="date" className="border rounded-md p-2 w-full" value={criteria.dateFrom} onChange={(e)=> setCriteria({ ...criteria, dateFrom: e.target.value })} />
            <input type="date" className="border rounded-md p-2 w-full" value={criteria.dateTo} onChange={(e)=> setCriteria({ ...criteria, dateTo: e.target.value })} />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium">Media type</label>
          <select className="mt-1 w-full border rounded-md p-2" value={criteria.mediaType} onChange={(e)=> setCriteria({ ...criteria, mediaType: e.target.value })}>
            <option value="voice">Voice</option>
            <option value="chat">Chat</option>
            <option value="email">Email</option>
            <option value="message">Messaging</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">Direction</label>
          <select className="mt-1 w-full border rounded-md p-2" value={criteria.direction} onChange={(e)=> setCriteria({ ...criteria, direction: e.target.value })}>
            <option value="both">Both</option>
            <option value="inbound">Inbound</option>
            <option value="outbound">Outbound</option>
          </select>
        </div>
        <MultiSelect label="Queues" options={queues} value={criteria.queues} onChange={(v)=> setCriteria({ ...criteria, queues: v })} />
        <MultiSelect label="Agents / Users" options={users} value={criteria.users} onChange={(v)=> setCriteria({ ...criteria, users: v })} />
        <MultiSelect label="Work teams" options={workTeams} value={criteria.workTeams} onChange={(v)=> setCriteria({ ...criteria, workTeams: v })} />
        <MultiSelect label="Wrap-up codes" options={wrapUps} value={criteria.wrapUpCodes} onChange={(v)=> setCriteria({ ...criteria, wrapUpCodes: v })} />
        <MultiSelect label="Skills" options={skills} value={criteria.skills} onChange={(v)=> setCriteria({ ...criteria, skills: v })} />
        <MultiSelect label="Languages" options={languages} value={criteria.languages} onChange={(v)=> setCriteria({ ...criteria, languages: v })} />
        <div>
          <label className="block text-sm font-medium">Duration (seconds)</label>
          <div className="grid grid-cols-2 gap-2 mt-1">
            <input type="number" className="border rounded-md p-2" placeholder="Min" value={criteria.minDurationSec ?? ""} onChange={(e)=> setCriteria({ ...criteria, minDurationSec: e.target.value === "" ? undefined : Number(e.target.value) })} />
            <input type="number" className="border rounded-md p-2" placeholder="Max" value={criteria.maxDurationSec ?? ""} onChange={(e)=> setCriteria({ ...criteria, maxDurationSec: e.target.value === "" ? undefined : Number(e.target.value) })} />
          </div>
        </div>
      </div>

      <div className="pt-4 border-t">
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={criteria.useAdvanced} onChange={(e)=> setCriteria({ ...criteria, useAdvanced: e.target.checked })} />
          <span className="text-base font-semibold">Advanced filters (STA)</span>
        </label>
        {criteria.useAdvanced && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={criteria.useSentiment} onChange={(e)=> setCriteria({ ...criteria, useSentiment: e.target.checked })} />
                <span>Sentiment</span>
              </label>
              {criteria.useSentiment && (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <input type="number" className="border rounded-md p-2" placeholder="Min (-100)" value={criteria.sentimentMin ?? ""} onChange={(e)=> setCriteria({ ...criteria, sentimentMin: e.target.value === "" ? undefined : Number(e.target.value) })} />
                  <input type="number" className="border rounded-md p-2" placeholder="Max (100)" value={criteria.sentimentMax ?? ""} onChange={(e)=> setCriteria({ ...criteria, sentimentMax: e.target.value === "" ? undefined : Number(e.target.value) })} />
                </div>
              )}
            </div>
            <div>
              <MultiSelect label="Topics include" options={topics} value={criteria.includeTopics} onChange={(v)=> setCriteria({ ...criteria, useTopics: true, includeTopics: v })} />
              <div className="mt-2" />
              <MultiSelect label="Topics exclude" options={topics} value={criteria.excludeTopics} onChange={(v)=> setCriteria({ ...criteria, useTopics: true, excludeTopics: v })} />
            </div>
            <div>
              <MultiSelect label="Categories include" options={categories} value={criteria.includeCategories} onChange={(v)=> setCriteria({ ...criteria, useCategories: true, includeCategories: v })} />
              <div className="mt-2" />
              <MultiSelect label="Categories exclude" options={categories} value={criteria.excludeCategories} onChange={(v)=> setCriteria({ ...criteria, useCategories: true, excludeCategories: v })} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// -------------------- App Shell --------------------
function App(){
  const [step, setStep] = useState(1);
  const [me, setMe] = useState(null);
  const [loadingLookups, setLoadingLookups] = useState(false);
  const [lookups, setLookups] = useState({ users:[], queues:[], skills:[], languages:[], workTeams:[], wrapUps:[], topics:[], categories:[] });

  const [criteria, setCriteria] = useState({
    dateFrom: new Date(Date.now() - 7*24*3600*1000).toISOString().slice(0,10),
    dateTo: new Date().toISOString().slice(0,10),
    mediaType: "voice",
    direction: "both",
    queues: [],
    users: [],
    workTeams: [],
    wrapUpCodes: [],
    skills: [],
    languages: [],
    minDurationSec: undefined,
    maxDurationSec: undefined,
    // Advanced
    useAdvanced: false,
    useSentiment: false,
    sentimentMin: undefined,
    sentimentMax: undefined,
    useTopics: false,
    includeTopics: [],
    excludeTopics: [],
    useCategories: false,
    includeCategories: [],
    excludeCategories: [],
  });

  async function loadLookups(){
    setLoadingLookups(true);
    try {
      const [users, queues, skills, languages, workTeams, wrapUps, topics, categories] = await Promise.all([
        fetchUsers(), fetchQueues(), fetchSkills(), fetchLanguages(), fetchWorkTeams(), fetchWrapUpCodes(), fetchTopics(), fetchCategories()
      ]);
      setLookups({ users, queues, skills, languages, workTeams, wrapUps, topics, categories });
    } catch (e) {
      console.warn("Lookup load failed:", e);
      setLookups({ users:[], queues:[], skills:[], languages:[], workTeams:[], wrapUps:[], topics:[], categories:[] });
    } finally { setLoadingLookups(false); }
  }

  useEffect(() => {
    // If token & region are already present (e.g., returning from OAuth), auto-fetch /me and go to step 2
    if (GC_TOKEN && GC_REGION && !me) {
      (async () => {
        try {
          const profile = await apiFetch('/api/v2/users/me');
          setMe(profile);
          setStep(2);
          loadLookups();
        } catch (e) {
          console.warn('Existing token invalid:', e);
        }
      })();
    }
  }, []);

  return (
    <div className="max-w-6xl mx-auto p-6">
      <Stepper step={step} setStep={(n)=> setStep(n)} />

      {step === 1 && (
        <SplashLogin onLogin={({ me })=>{ setMe(me); setStep(2); loadLookups(); }} />
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">Build your criteria</h2>
          </div>
          {loadingLookups ? (
            <div className="p-6 bg-white rounded-2xl shadow flex items-center gap-3 text-sm"><Loader2 className="w-4 h-4 animate-spin"/> Loading lists…</div>
          ) : (
            <Criteria criteria={criteria} setCriteria={setCriteria} lookups={lookups} />
          )}

          <div className="flex justify-between">
            <button className="inline-flex items-center gap-1 border rounded px-3 py-2" onClick={()=> setStep(1)}><ChevronLeft className="w-4 h-4"/> Back</button>
            <button className="inline-flex items-center gap-1 border rounded px-3 py-2 opacity-60 cursor-not-allowed" title="Next steps coming in Stage 2">Next <ChevronRight className="w-4 h-4"/></button>
          </div>
        </div>
      )}
    </div>
  );
}

const root = createRoot(document.getElementById("root"));
root.render(<App />);
