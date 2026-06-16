"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  LayoutDashboard,
  Plug,
  Palette,
  Settings,
  Search,
  Upload,
  FileText,
  AlertTriangle,
  CheckSquare,
  GitBranch,
  Monitor,
  BarChart3,
  Loader2,
  Copy,
  Check,
  X,
  Sparkles,
  KeyRound,
  Link2,
  Shield,
} from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
interface AnalysisResult {
  summary: string;
  mentor: string;
  criteria: string;
  mermaid: string;
  prototype: string;
  metrics: Record<string, string>;
}

type Tab = "summary" | "mentor" | "criteria" | "mermaid" | "prototype" | "metrics";
type SidebarView = "workspaces" | "integrations" | "design" | "settings";
type JiraMethod = "token" | "link" | "oauth";

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "summary", label: "Resumen", icon: FileText },
  { key: "mentor", label: "Mentor", icon: AlertTriangle },
  { key: "criteria", label: "Criterios", icon: CheckSquare },
  { key: "mermaid", label: "Diagrama", icon: GitBranch },
  { key: "prototype", label: "Prototipo", icon: Monitor },
  { key: "metrics", label: "Métricas", icon: BarChart3 },
];

const SIDEBAR_ITEMS: { key: SidebarView; label: string; icon: React.ElementType }[] = [
  { key: "workspaces", label: "Workspaces", icon: LayoutDashboard },
  { key: "integrations", label: "Integraciones", icon: Plug },
  { key: "design", label: "Design System", icon: Palette },
  { key: "settings", label: "Configuración", icon: Settings },
];

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
export default function DashboardPage() {
  // Workspace state
  const [ticketKey, setTicketKey] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("summary");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [modelUsed, setModelUsed] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [files, setFiles] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // Sidebar + Integrations state
  const [sidebarView, setSidebarView] = useState<SidebarView>("workspaces");
  const [jiraMethod, setJiraMethod] = useState<JiraMethod>("token");
  const [jiraConnected, setJiraConnected] = useState(false);
  const [jiraSaving, setJiraSaving] = useState(false);
  const [jiraError, setJiraError] = useState<string | null>(null);
  const [jiraForm, setJiraForm] = useState({
    domain: "",
    email: "",
    token: "",
    ticketUrl: "",
  });

  // Organization context (multi-tenant)
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [orgLoading, setOrgLoading] = useState(true);

  // ---------------------------------------------------------------------------
  // On mount: buscar la organización del usuario en Supabase
  // ---------------------------------------------------------------------------
  useEffect(() => {
    async function loadOrg() {
      setOrgLoading(true);
      try {
        const supabase = getSupabaseBrowser();

        // Traer la primera organización disponible
        const { data: orgs } = await supabase
          .from("organizations")
          .select("id")
          .order("created_at", { ascending: false })
          .limit(1);

        if (orgs && orgs.length > 0) {
          const orgId = orgs[0].id;
          setOrganizationId(orgId);

          // Verificar si ya tiene integración de Jira
          const { data: jira } = await supabase
            .from("jira_integrations")
            .select("jira_domain, admin_email, is_active")
            .eq("organization_id", orgId)
            .eq("is_active", true)
            .limit(1)
            .single();

          if (jira) {
            setJiraConnected(true);
            setJiraForm((f) => ({
              ...f,
              domain: jira.jira_domain,
              email: jira.admin_email,
            }));
          }
        }
      } catch {
        // Silencioso si no hay org todavía
      } finally {
        setOrgLoading(false);
      }
    }
    loadOrg();
  }, []);

  // ---------------------------------------------------------------------------
  // Analizar ticket: Jira real (multi-tenant) → IA
  // ---------------------------------------------------------------------------
  const handleAnalyze = async () => {
    if (!ticketKey.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // 1. Traer datos reales de Jira
      let ticketData = {
        key: ticketKey.toUpperCase(),
        title: `Ticket ${ticketKey.toUpperCase()}`,
        description: `Análisis solicitado para ${ticketKey.toUpperCase()} desde SuperPM.`,
        comments: [] as string[],
      };

      if (organizationId) {
        const jiraRes = await fetch("/api/jira/fetch-ticket", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ticketId: ticketKey.toUpperCase(),
            organizationId,
          }),
        });

        if (jiraRes.ok) {
          const jiraData = await jiraRes.json();
          ticketData = {
            key: jiraData.ticket.key,
            title: jiraData.ticket.title,
            description: jiraData.ticket.description,
            comments: jiraData.ticket.comments ?? [],
          };
        } else {
          const jiraErr = await jiraRes.json();
          if (jiraRes.status === 404 && jiraErr.error?.includes("No hay integración")) {
            setError("Configurá tu integración de Jira en la pestaña Integraciones antes de analizar tickets.");
            setLoading(false);
            return;
          }
        }
      }

      // 2. Enviar a IA con organizationId para resolver design system desde DB
      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticket: ticketData,
          organizationId,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`);

      setResult(data.data);
      setModelUsed(data.model_used);
      setActiveTab("summary");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files).map((f) => f.name);
    setFiles((prev) => [...prev, ...dropped]);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const selected = Array.from(e.target.files).map((f) => f.name);
    setFiles((prev) => [...prev, ...selected]);
  };

  // ---------------------------------------------------------------------------
  // Guardar integración Jira en Supabase (multi-tenant real)
  // ---------------------------------------------------------------------------
  const handleJiraSave = async () => {
    if (!organizationId) {
      setJiraError("No se encontró una organización. Completá el onboarding primero.");
      return;
    }

    setJiraSaving(true);
    setJiraError(null);

    try {
      const supabase = getSupabaseBrowser();

      // Desactivar integraciones anteriores
      await supabase
        .from("jira_integrations")
        .update({ is_active: false })
        .eq("organization_id", organizationId);

      // Insertar nueva integración
      const { error: insertErr } = await supabase
        .from("jira_integrations")
        .insert({
          organization_id: organizationId,
          jira_domain: jiraForm.domain,
          admin_email: jiraForm.email,
          encrypted_token: jiraForm.token,
          is_active: true,
        });

      if (insertErr) throw insertErr;

      setJiraConnected(true);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
            ? String((err as { message: unknown }).message)
            : "Error al guardar la integración";
      setJiraError(msg);
    } finally {
      setJiraSaving(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Estilos reutilizables
  // ---------------------------------------------------------------------------
  const inputClass =
    "w-full rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-400 focus:bg-white dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-600";

  const labelClass = "block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5";

  // ---------------------------------------------------------------------------
  // Render de Integraciones (guarda en Supabase)
  // ---------------------------------------------------------------------------
  const renderIntegrations = () => {
    const methods: { key: JiraMethod; label: string; desc: string; icon: React.ElementType }[] = [
      { key: "token", label: "API Key / Token", desc: "Conectá con tu API Token de Atlassian", icon: KeyRound },
      { key: "link", label: "Link Directo", desc: "Pegá la URL del ticket o proyecto", icon: Link2 },
      { key: "oauth", label: "OAuth / Atlassian Connect", desc: "Conexión nativa con permisos delegados", icon: Shield },
    ];

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
            Integraciones
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Conectá tu proyecto de Jira para analizar tickets con SuperPM.
          </p>
        </div>

        {jiraConnected && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800 dark:bg-emerald-950/30">
            <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
              Jira conectado — {jiraForm.domain}
            </span>
          </div>
        )}

        {!jiraConnected && !orgLoading && (
          <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/30">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
              Sin configurar — Completá los datos para conectar Jira.
            </span>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          {methods.map((m) => {
            const Icon = m.icon;
            const isActive = jiraMethod === m.key;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setJiraMethod(m.key)}
                className={`rounded-xl border p-4 text-left transition-all ${
                  isActive
                    ? "border-violet-300 bg-violet-50 ring-2 ring-violet-200 dark:border-violet-700 dark:bg-violet-950/30 dark:ring-violet-800"
                    : "border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:border-zinc-600"
                }`}
              >
                <Icon className={`mb-2 h-5 w-5 ${isActive ? "text-violet-600 dark:text-violet-400" : "text-zinc-400"}`} />
                <p className={`text-sm font-medium ${isActive ? "text-violet-900 dark:text-violet-200" : "text-zinc-900 dark:text-white"}`}>
                  {m.label}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{m.desc}</p>
              </button>
            );
          })}
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          {jiraMethod === "token" && (
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Dominio de Jira</label>
                <input
                  className={inputClass}
                  placeholder="empresa.atlassian.net"
                  value={jiraForm.domain}
                  onChange={(e) => setJiraForm((f) => ({ ...f, domain: e.target.value }))}
                />
              </div>
              <div>
                <label className={labelClass}>Email del administrador</label>
                <input
                  className={inputClass}
                  type="email"
                  placeholder="admin@empresa.com"
                  value={jiraForm.email}
                  onChange={(e) => setJiraForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div>
                <label className={labelClass}>API Token de Atlassian</label>
                <input
                  className={inputClass}
                  type="password"
                  placeholder="Pegá tu token de Atlassian acá"
                  value={jiraForm.token}
                  onChange={(e) => setJiraForm((f) => ({ ...f, token: e.target.value }))}
                />
                <p className="mt-1.5 text-xs text-zinc-400">
                  Generalo en id.atlassian.com &gt; Security &gt; API tokens
                </p>
              </div>
            </div>
          )}

          {jiraMethod === "link" && (
            <div className="space-y-4">
              <div>
                <label className={labelClass}>URL del ticket o proyecto</label>
                <input
                  className={inputClass}
                  placeholder="https://empresa.atlassian.net/browse/PROJ-123"
                  value={jiraForm.ticketUrl}
                  onChange={(e) => setJiraForm((f) => ({ ...f, ticketUrl: e.target.value }))}
                />
                <p className="mt-1.5 text-xs text-zinc-400">
                  Pegá la URL completa del ticket o el board del proyecto.
                </p>
              </div>
            </div>
          )}

          {jiraMethod === "oauth" && (
            <div className="space-y-4 py-4 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-950/30">
                <Shield className="h-7 w-7 text-blue-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-900 dark:text-white">
                  Atlassian Connect (OAuth 2.0)
                </p>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  Autorizá SuperPM a leer tus proyectos de Jira con permisos delegados seguros.
                </p>
              </div>
            </div>
          )}

          {jiraError && (
            <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
              {jiraError}
            </p>
          )}

          <div className="mt-6 flex items-center justify-end gap-3">
            {jiraConnected && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400">Conectado</span>
            )}
            <button
              type="button"
              onClick={handleJiraSave}
              disabled={jiraSaving || (jiraMethod === "token" && (!jiraForm.domain || !jiraForm.email || !jiraForm.token))}
              className="flex items-center gap-2 rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-violet-700 disabled:opacity-50"
            >
              {jiraSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : jiraConnected ? (
                <Check className="h-4 w-4" />
              ) : (
                <Plug className="h-4 w-4" />
              )}
              {jiraSaving
                ? "Guardando…"
                : jiraConnected
                  ? "Reconectar"
                  : jiraMethod === "oauth"
                    ? "Autorizar con Atlassian"
                    : "Guardar y Conectar"}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ---------------------------------------------------------------------------
  // Render de tabs de resultados
  // ---------------------------------------------------------------------------
  const renderTabContent = () => {
    if (!result) return null;

    switch (activeTab) {
      case "summary":
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Resumen Ejecutivo</h3>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-6 text-sm leading-relaxed text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-300">
              {result.summary}
            </div>
          </div>
        );
      case "mentor":
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Diagnóstico del Mentor IA</h3>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-950/30">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" />
                Riesgos y Dependencias Identificadas
              </div>
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-amber-900 dark:text-amber-200">{result.mentor}</div>
            </div>
          </div>
        );
      case "criteria":
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Criterios de Aceptación (Gherkin)</h3>
              <button type="button" onClick={() => copyToClipboard(result.criteria)} className="flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800">
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copiado" : "Copiar"}
              </button>
            </div>
            <pre className="overflow-x-auto rounded-xl border border-zinc-200 bg-zinc-950 p-6 text-sm leading-relaxed text-emerald-400 dark:border-zinc-700">{result.criteria}</pre>
          </div>
        );
      case "mermaid":
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Diagrama de Flujo</h3>
              <button type="button" onClick={() => copyToClipboard(result.mermaid)} className="flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800">
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copiado" : "Copiar Mermaid"}
              </button>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-800/50">
              <pre className="overflow-x-auto text-sm text-zinc-700 dark:text-zinc-300">{result.mermaid}</pre>
              <p className="mt-4 text-xs text-zinc-400">Pegá este código en <span className="font-medium">mermaid.live</span> para renderizar el diagrama interactivo.</p>
            </div>
          </div>
        );
      case "prototype":
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Prototipo Interactivo</h3>
            <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700">
              <div className="flex items-center gap-2 border-b border-zinc-200 bg-zinc-100 px-4 py-2 dark:border-zinc-700 dark:bg-zinc-800">
                <div className="flex gap-1.5">
                  <span className="h-3 w-3 rounded-full bg-red-400" />
                  <span className="h-3 w-3 rounded-full bg-amber-400" />
                  <span className="h-3 w-3 rounded-full bg-emerald-400" />
                </div>
                <span className="ml-2 text-xs text-zinc-400">prototype.superpm.app</span>
              </div>
              <iframe srcDoc={result.prototype} title="Prototipo SuperPM" className="h-[500px] w-full bg-white" sandbox="allow-scripts" />
            </div>
          </div>
        );
      case "metrics":
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Métricas HEART</h3>
            <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50">
                    <th className="px-6 py-3 text-left font-medium text-zinc-500 dark:text-zinc-400">Dimensión</th>
                    <th className="px-6 py-3 text-left font-medium text-zinc-500 dark:text-zinc-400">Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(result.metrics).map(([key, value]) => (
                    <tr key={key} className="border-b border-zinc-100 dark:border-zinc-800">
                      <td className="px-6 py-4 font-medium capitalize text-zinc-900 dark:text-white">{key.replace(/_/g, " ")}</td>
                      <td className="px-6 py-4 text-zinc-600 dark:text-zinc-400">{typeof value === "string" ? value : JSON.stringify(value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
    }
  };

  // ---------------------------------------------------------------------------
  // Render del Workspace
  // ---------------------------------------------------------------------------
  const renderWorkspace = () => (
    <>
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Clave del Ticket de Jira</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                className="w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2.5 pl-10 pr-4 text-sm text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-400 focus:bg-white dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-600"
                placeholder="PROJ-123"
                value={ticketKey}
                onChange={(e) => setTicketKey(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
              />
            </div>
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={loading || !ticketKey.trim()}
              className="flex items-center gap-2 rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-violet-700 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {loading ? "Analizando…" : "Analizar con SuperPM"}
            </button>
          </div>
        </div>

        <div
          className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed bg-white p-5 text-center transition-colors dark:bg-zinc-950 ${dragOver ? "border-violet-400 bg-violet-50 dark:bg-violet-950/20" : "border-zinc-200 dark:border-zinc-700"}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
        >
          <input ref={fileRef} type="file" multiple accept="image/*,.pdf" className="hidden" onChange={handleFileInput} />
          <Upload className="mb-2 h-6 w-6 text-zinc-400" />
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Arrastrá capturas o PDFs acá</p>
          <p className="mt-1 text-xs text-zinc-400">PNG, JPG, PDF</p>
          {files.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {files.map((f, i) => (
                <span key={`${f}-${i}`} className="flex items-center gap-1 rounded-md bg-zinc-100 px-2 py-1 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                  {f}
                  <button type="button" onClick={(e) => { e.stopPropagation(); setFiles((prev) => prev.filter((_, j) => j !== i)); }}><X className="h-3 w-3" /></button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">{error}</div>
      )}

      {loading && (
        <div className="space-y-4">
          <div className="h-10 w-full animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-64 w-full animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />
        </div>
      )}

      {result && !loading && (
        <div className="space-y-4">
          <div className="flex gap-1 overflow-x-auto rounded-xl border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-950">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)} className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors ${isActive ? "bg-zinc-900 text-white dark:bg-white dark:text-black" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"}`}>
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">{renderTabContent()}</div>
        </div>
      )}

      {!result && !loading && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-800">
            <Sparkles className="h-7 w-7 text-zinc-400" />
          </div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Ingresá un ticket para comenzar</h2>
          <p className="mt-1 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
            Escribí la clave de un ticket de Jira y SuperPM generará el análisis completo con los 6 pilares de producto.
          </p>
        </div>
      )}
    </>
  );

  const headerTitle: Record<SidebarView, string> = {
    workspaces: "Workspace",
    integrations: "Integraciones",
    design: "Design System",
    settings: "Configuración",
  };

  // ---------------------------------------------------------------------------
  // Layout
  // ---------------------------------------------------------------------------
  return (
    <div className="flex h-screen bg-zinc-50 dark:bg-black">
      <aside className="flex w-60 flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex h-14 items-center gap-2 border-b border-zinc-200 px-5 dark:border-zinc-800">
          <Sparkles className="h-5 w-5 text-violet-500" />
          <span className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-white">SuperPM</span>
        </div>
        <nav className="flex-1 px-3 py-4">
          <ul className="space-y-1">
            {SIDEBAR_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = sidebarView === item.key;
              return (
                <li key={item.key}>
                  <button type="button" onClick={() => setSidebarView(item.key)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${isActive ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-white" : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-300"}`}>
                    <Icon className="h-4 w-4" />
                    {item.label}
                    {item.key === "integrations" && jiraConnected && <span className="ml-auto h-2 w-2 rounded-full bg-emerald-500" />}
                    {item.key === "integrations" && !jiraConnected && !orgLoading && <span className="ml-auto h-2 w-2 rounded-full bg-amber-400" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="border-t border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <p className="text-xs text-zinc-400">SuperPM v0.1.0</p>
        </div>
      </aside>

      <main className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-6 dark:border-zinc-800 dark:bg-zinc-950">
          <h1 className="text-sm font-semibold text-zinc-900 dark:text-white">{headerTitle[sidebarView]}</h1>
          {modelUsed && sidebarView === "workspaces" && (
            <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-medium text-violet-700 dark:bg-violet-950 dark:text-violet-300">Modelo: {modelUsed}</span>
          )}
        </header>
        <div className="flex-1 overflow-y-auto p-6">
          {sidebarView === "workspaces" && renderWorkspace()}
          {sidebarView === "integrations" && renderIntegrations()}
          {sidebarView === "design" && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Palette className="mb-4 h-10 w-10 text-zinc-300 dark:text-zinc-600" />
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Design System</h2>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Configurá tu identidad visual desde el Onboarding o editala acá próximamente.</p>
            </div>
          )}
          {sidebarView === "settings" && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Settings className="mb-4 h-10 w-10 text-zinc-300 dark:text-zinc-600" />
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Configuración</h2>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Gestión de equipo, permisos y preferencias. Próximamente.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
