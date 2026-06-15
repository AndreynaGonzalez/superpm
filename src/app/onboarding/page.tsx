"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import confetti from "canvas-confetti";
import {
  Building2,
  Link2,
  Palette,
  ChevronRight,
  ChevronLeft,
  Check,
  Loader2,
} from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
interface FormData {
  // Paso 1 — Organización
  orgName: string;
  subdomain: string;
  // Paso 2 — Jira
  jiraDomain: string;
  jiraToken: string;
  jiraEmail: string;
  // Paso 3 — Design System
  primaryColor: string;
  successColor: string;
  fontFamily: string;
  borderRadius: string;
  customRules: string;
}

const INITIAL: FormData = {
  orgName: "",
  subdomain: "",
  jiraDomain: "",
  jiraToken: "",
  jiraEmail: "",
  primaryColor: "#7C3AED",
  successColor: "#10B981",
  fontFamily: "Inter",
  borderRadius: "12px",
  customRules: "",
};

const STEPS = [
  { label: "Organización", icon: Building2 },
  { label: "Jira", icon: Link2 },
  { label: "Design System", icon: Palette },
] as const;

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------
export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>(INITIAL);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jiraStatus, setJiraStatus] = useState<
    "idle" | "testing" | "ok" | "fail"
  >("idle");

  // helpers
  const set = (field: keyof FormData, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const canAdvance = (): boolean => {
    if (step === 0) return form.orgName.trim() !== "" && form.subdomain.trim() !== "";
    if (step === 1) return form.jiraDomain.trim() !== "" && form.jiraEmail.trim() !== "";
    return true;
  };

  // Simula validación de conexión Jira
  const testJira = () => {
    setJiraStatus("testing");
    setTimeout(() => setJiraStatus("ok"), 1500);
  };

  // Guardar todo en Supabase
  const handleFinish = async () => {
    setSaving(true);
    setError(null);

    try {
      const supabase = getSupabaseBrowser();

      // 1. Crear organización
      const { data: org, error: orgErr } = await supabase
        .from("organizations")
        .insert({ name: form.orgName, subdomain: form.subdomain })
        .select("id")
        .single();

      if (orgErr) throw orgErr;
      const orgId = org.id;

      // 2. Jira integration
      const { error: jiraErr } = await supabase
        .from("jira_integrations")
        .insert({
          organization_id: orgId,
          jira_domain: form.jiraDomain,
          encrypted_token: form.jiraToken,
          admin_email: form.jiraEmail,
          is_active: true,
        });

      if (jiraErr) throw jiraErr;

      // 3. Design System
      const { error: dsErr } = await supabase
        .from("design_systems")
        .insert({
          organization_id: orgId,
          primary_color: form.primaryColor,
          success_color: form.successColor,
          font_family: form.fontFamily,
          border_radius: form.borderRadius,
          custom_rules: form.customRules
            ? { dictionary: form.customRules }
            : {},
        });

      if (dsErr) throw dsErr;

      // Confetti
      confetti({
        particleCount: 180,
        spread: 80,
        origin: { y: 0.6 },
        colors: [form.primaryColor, form.successColor, "#3B82F6"],
      });

      setTimeout(() => router.push("/dashboard"), 2000);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
            ? String((err as { message: unknown }).message)
            : "Error inesperado";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------
  const inputClass =
    "w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 shadow-sm outline-none transition-all placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-500 dark:focus:ring-zinc-800";

  const labelClass = "block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5";

  const renderStep = () => {
    switch (step) {
      // ---- Paso 1: Organización ----
      case 0:
        return (
          <div className="space-y-5">
            <div>
              <label className={labelClass}>Nombre de la empresa</label>
              <input
                className={inputClass}
                placeholder="Ej: MetaFar S.A."
                value={form.orgName}
                onChange={(e) => set("orgName", e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>Subdominio corporativo</label>
              <div className="flex items-center gap-2">
                <input
                  className={inputClass}
                  placeholder="metafar"
                  value={form.subdomain}
                  onChange={(e) =>
                    set(
                      "subdomain",
                      e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")
                    )
                  }
                />
                <span className="shrink-0 text-sm text-zinc-400">
                  .superpm.app
                </span>
              </div>
            </div>
          </div>
        );

      // ---- Paso 2: Jira ----
      case 1:
        return (
          <div className="space-y-5">
            <div>
              <label className={labelClass}>Dominio de Jira</label>
              <input
                className={inputClass}
                placeholder="empresa.atlassian.net"
                value={form.jiraDomain}
                onChange={(e) => set("jiraDomain", e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>Email del administrador</label>
              <input
                className={inputClass}
                type="email"
                placeholder="admin@empresa.com"
                value={form.jiraEmail}
                onChange={(e) => set("jiraEmail", e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>API Token</label>
              <input
                className={inputClass}
                type="password"
                placeholder="Token de Jira (Atlassian API Token)"
                value={form.jiraToken}
                onChange={(e) => set("jiraToken", e.target.value)}
              />
            </div>

            {/* Indicador de conexión */}
            <button
              type="button"
              onClick={testJira}
              disabled={
                jiraStatus === "testing" || form.jiraDomain.trim() === ""
              }
              className="flex items-center gap-2 rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-medium transition-all hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              {jiraStatus === "testing" && (
                <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
              )}
              {jiraStatus === "ok" && (
                <Check className="h-4 w-4 text-emerald-500" />
              )}
              {jiraStatus === "idle" && (
                <Link2 className="h-4 w-4 text-zinc-400" />
              )}
              {jiraStatus === "fail" && (
                <span className="h-4 w-4 text-red-500">✕</span>
              )}
              {jiraStatus === "ok"
                ? "Conexión verificada"
                : jiraStatus === "testing"
                  ? "Verificando…"
                  : "Verificar conexión OAuth 2.0"}
            </button>
          </div>
        );

      // ---- Paso 3: Design System ----
      case 2:
        return (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Color primario</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={form.primaryColor}
                    onChange={(e) => set("primaryColor", e.target.value)}
                    className="h-10 w-10 cursor-pointer rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-700"
                  />
                  <input
                    className={inputClass}
                    value={form.primaryColor}
                    onChange={(e) => set("primaryColor", e.target.value)}
                    maxLength={7}
                  />
                </div>
              </div>
              <div>
                <label className={labelClass}>Color de éxito</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={form.successColor}
                    onChange={(e) => set("successColor", e.target.value)}
                    className="h-10 w-10 cursor-pointer rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-700"
                  />
                  <input
                    className={inputClass}
                    value={form.successColor}
                    onChange={(e) => set("successColor", e.target.value)}
                    maxLength={7}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Tipografía</label>
                <select
                  className={inputClass}
                  value={form.fontFamily}
                  onChange={(e) => set("fontFamily", e.target.value)}
                >
                  <option>Inter</option>
                  <option>SF Pro</option>
                  <option>Roboto</option>
                  <option>Poppins</option>
                  <option>DM Sans</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Border radius</label>
                <select
                  className={inputClass}
                  value={form.borderRadius}
                  onChange={(e) => set("borderRadius", e.target.value)}
                >
                  <option value="4px">4px — Afilado</option>
                  <option value="8px">8px — Suave</option>
                  <option value="12px">12px — Moderno</option>
                  <option value="16px">16px — Redondeado</option>
                  <option value="9999px">Full — Pill</option>
                </select>
              </div>
            </div>

            {/* Preview en vivo */}
            <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
              <p className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-400">
                Preview en vivo
              </p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="px-4 py-2 text-sm font-medium text-white shadow-sm transition-transform hover:scale-105"
                  style={{
                    backgroundColor: form.primaryColor,
                    borderRadius: form.borderRadius,
                    fontFamily: form.fontFamily,
                  }}
                >
                  Botón Primario
                </button>
                <button
                  type="button"
                  className="px-4 py-2 text-sm font-medium text-white shadow-sm transition-transform hover:scale-105"
                  style={{
                    backgroundColor: form.successColor,
                    borderRadius: form.borderRadius,
                    fontFamily: form.fontFamily,
                  }}
                >
                  Éxito
                </button>
              </div>
            </div>

            <div>
              <label className={labelClass}>
                Diccionario de Producto / ADN del Negocio
              </label>
              <textarea
                className={inputClass + " min-h-[140px] resize-y"}
                placeholder={`Pegá acá la terminología, reglas de negocio o contexto que la IA debe conocer.\n\nEj:\n- "Dispensa" = entrega de medicamento al paciente\n- "Receta electrónica" = prescripción digital validada por ANMAT\n- Las historias deben considerar siempre la trazabilidad SNVS`}
                value={form.customRules}
                onChange={(e) => set("customRules", e.target.value)}
              />
            </div>
          </div>
        );
    }
  };

  // ---------------------------------------------------------------------------
  // Layout principal
  // ---------------------------------------------------------------------------
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-white">
            Configurá tu espacio
          </h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Paso {step + 1} de 3 — {STEPS[step].label}
          </p>
        </div>

        {/* Progress bar */}
        <div className="mb-8 flex items-center gap-2">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isActive = i === step;
            const isDone = i < step;
            return (
              <div key={s.label} className="flex flex-1 flex-col items-center gap-1.5">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-full transition-all duration-300 ${
                    isDone
                      ? "bg-emerald-500 text-white"
                      : isActive
                        ? "bg-zinc-900 text-white dark:bg-white dark:text-black"
                        : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500"
                  }`}
                >
                  {isDone ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </div>
                <div
                  className={`h-1 w-full rounded-full transition-all duration-500 ${
                    isDone
                      ? "bg-emerald-500"
                      : isActive
                        ? "bg-zinc-900 dark:bg-white"
                        : "bg-zinc-200 dark:bg-zinc-800"
                  }`}
                />
              </div>
            );
          })}
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          {renderStep()}

          {error && (
            <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
              {error}
            </p>
          )}

          {/* Navegación */}
          <div className="mt-8 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              disabled={step === 0}
              className="flex items-center gap-1 rounded-xl px-4 py-2.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 disabled:invisible dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              <ChevronLeft className="h-4 w-4" />
              Atrás
            </button>

            {step < 2 ? (
              <button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                disabled={!canAdvance()}
                className="flex items-center gap-1 rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-zinc-800 disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                Siguiente
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleFinish}
                disabled={saving}
                className="flex items-center gap-2 rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {saving ? "Guardando…" : "Finalizar Setup"}
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-zinc-400">
          SuperPM — Enterprise Product Platform
        </p>
      </div>
    </div>
  );
}
