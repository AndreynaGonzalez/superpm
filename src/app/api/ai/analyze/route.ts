import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

// ---------------------------------------------------------------------------
// Cascada de modelos (Fallback Resilience)
// ---------------------------------------------------------------------------
const MODEL_CASCADE = [
  "openai/gpt-4o-mini",
  "anthropic/claude-3-haiku",
  "openai/gpt-4o",
] as const;

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
interface AnalyzeRequest {
  ticket: {
    key: string;
    title: string;
    description: string;
    acceptance_criteria?: string;
    comments?: string[];
  };
  organizationId?: string;
  // Fallback manual si no hay org en DB
  designSystem?: {
    primary_color: string;
    success_color: string;
    font_family: string;
    border_radius: string;
    custom_rules?: Record<string, unknown>;
  };
  organizationName?: string;
}

interface DesignSystemData {
  primary_color: string;
  success_color: string;
  font_family: string;
  border_radius: string;
  custom_rules: Record<string, unknown>;
}

interface AnalyzeOutput {
  summary: string;
  mentor: string;
  criteria: string;
  mermaid: string;
  prototype: string;
  metrics: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Prompt de sistema
// ---------------------------------------------------------------------------
function buildSystemPrompt(
  ds: DesignSystemData,
  orgName?: string
): string {
  return `Eres SuperPM, un motor de inteligencia artificial de nivel enterprise para Product Managers.
${orgName ? `\nEstás analizando un ticket de la organización "${orgName}".` : ""}
${ds.custom_rules && Object.keys(ds.custom_rules).length > 0 ? `\nContexto de negocio y terminología de esta organización:\n${JSON.stringify(ds.custom_rules)}` : ""}

Tu tarea: analizar el ticket de Jira proporcionado y devolver EXCLUSIVAMENTE un objeto JSON válido (sin markdown, sin backticks, sin texto adicional) con estas 6 claves:

1. "summary" (string): Resumen ejecutivo del ticket en 3-5 oraciones. Incluye el problema, la solución propuesta y el impacto de negocio.

2. "mentor" (string): Diagnóstico computacional. Identifica riesgos técnicos, dependencias entre equipos, deuda técnica potencial y recomendaciones priorizadas.

3. "criteria" (string): Escenarios de aceptación en formato Gherkin (Given/When/Then). Mínimo 3 escenarios cubriendo happy path, edge case y error path.

4. "mermaid" (string): Código Mermaid de un diagrama de flujo que represente el flujo principal del ticket. Usa sintaxis válida de Mermaid.js.

5. "prototype" (string): Código HTML completo y auto-contenido con Tailwind CSS via CDN que represente un prototipo interactivo del ticket. Aplica estas variables del Design System corporativo:
   - Color primario: ${ds.primary_color}
   - Color de éxito: ${ds.success_color}
   - Tipografía: ${ds.font_family}
   - Border radius: ${ds.border_radius}

6. "metrics" (object): Un objeto con estas claves:
   - "happiness": métrica de satisfacción del usuario y cómo medirla.
   - "engagement": métrica de adopción/interacción y evento de tracking.
   - "adoption": porcentaje estimado de adopción y plan de rollout.
   - "retention": impacto en retención y señales de alerta.
   - "task_success": tasa de éxito esperada y criterio de medición.

RESPONDE SOLO CON EL JSON. Sin explicaciones, sin markdown.`;
}

function buildUserPrompt(
  ticket: AnalyzeRequest["ticket"]
): string {
  let prompt = `TICKET: ${ticket.key} — ${ticket.title}\n\nDESCRIPCIÓN:\n${ticket.description}`;
  if (ticket.acceptance_criteria) {
    prompt += `\n\nCRITERIOS DE ACEPTACIÓN EXISTENTES:\n${ticket.acceptance_criteria}`;
  }
  if (ticket.comments?.length) {
    prompt += `\n\nCOMENTARIOS DEL EQUIPO:\n${ticket.comments.join("\n---\n")}`;
  }
  return prompt;
}

// ---------------------------------------------------------------------------
// Llamada a OpenRouter (clave de plataforma fija, server-side)
// ---------------------------------------------------------------------------
async function callModel(
  model: string,
  systemPrompt: string,
  userPrompt: string
): Promise<AnalyzeOutput> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY no configurada");
  }

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://superpm.app",
      "X-Title": "SuperPM",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 4096,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenRouter ${model} respondió ${res.status}: ${body}`);
  }

  const data = await res.json();
  const raw: string | undefined = data.choices?.[0]?.message?.content;

  if (!raw) {
    throw new Error(`OpenRouter ${model} devolvió respuesta vacía`);
  }

  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const parsed: AnalyzeOutput = JSON.parse(cleaned);

  const requiredKeys: (keyof AnalyzeOutput)[] = [
    "summary",
    "mentor",
    "criteria",
    "mermaid",
    "prototype",
    "metrics",
  ];
  for (const key of requiredKeys) {
    if (!(key in parsed)) {
      throw new Error(`Respuesta de ${model} incompleta: falta "${key}"`);
    }
  }

  return parsed;
}

// ---------------------------------------------------------------------------
// POST /api/ai/analyze
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const body: AnalyzeRequest = await request.json();

    if (!body.ticket?.key || !body.ticket?.title || !body.ticket?.description) {
      return Response.json(
        { error: "Faltan campos obligatorios: ticket.key, ticket.title, ticket.description" },
        { status: 400 }
      );
    }

    // Resolver Design System dinámicamente desde la DB
    let ds: DesignSystemData = {
      primary_color: "#7C3AED",
      success_color: "#10B981",
      font_family: "Inter",
      border_radius: "12px",
      custom_rules: {},
    };
    let orgName: string | undefined = body.organizationName;

    if (body.organizationId) {
      const supabase = await getSupabaseServer();

      // Design System de la organización
      const { data: dsRow } = await supabase
        .from("design_systems")
        .select("primary_color, success_color, font_family, border_radius, custom_rules")
        .eq("organization_id", body.organizationId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .single();

      if (dsRow) {
        ds = {
          primary_color: dsRow.primary_color,
          success_color: dsRow.success_color,
          font_family: dsRow.font_family,
          border_radius: dsRow.border_radius,
          custom_rules: (dsRow.custom_rules as Record<string, unknown>) ?? {},
        };
      }

      // Nombre de la organización para contexto
      if (!orgName) {
        const { data: orgRow } = await supabase
          .from("organizations")
          .select("name")
          .eq("id", body.organizationId)
          .single();

        if (orgRow) orgName = orgRow.name;
      }
    } else if (body.designSystem) {
      // Fallback: design system enviado desde el frontend
      ds = {
        ...ds,
        ...body.designSystem,
        custom_rules: body.designSystem.custom_rules ?? {},
      };
    }

    const systemPrompt = buildSystemPrompt(ds, orgName);
    const userPrompt = buildUserPrompt(body.ticket);

    // Cascada secuencial de modelos
    const errors: string[] = [];

    for (const model of MODEL_CASCADE) {
      try {
        const result = await callModel(model, systemPrompt, userPrompt);
        return Response.json({
          success: true,
          model_used: model,
          data: result,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`[${model}] ${msg}`);
      }
    }

    return Response.json(
      { error: "Todos los modelos de la cascada fallaron", details: errors },
      { status: 502 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    return Response.json({ error: msg }, { status: 500 });
  }
}
