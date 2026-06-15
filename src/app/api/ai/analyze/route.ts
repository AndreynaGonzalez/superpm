import { NextRequest } from "next/server";

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
  designSystem: {
    primary_color: string;
    success_color: string;
    font_family: string;
    border_radius: string;
    custom_rules?: Record<string, unknown>;
  };
  organizationName?: string;
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
function buildSystemPrompt(req: AnalyzeRequest): string {
  const ds = req.designSystem;
  return `Eres SuperPM, un motor de inteligencia artificial de nivel enterprise para Product Managers.

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
   ${ds.custom_rules ? `- Reglas custom: ${JSON.stringify(ds.custom_rules)}` : ""}

6. "metrics" (object): Un objeto con estas claves:
   - "happiness": métrica de satisfacción del usuario y cómo medirla.
   - "engagement": métrica de adopción/interacción y evento de tracking.
   - "adoption": porcentaje estimado de adopción y plan de rollout.
   - "retention": impacto en retención y señales de alerta.
   - "task_success": tasa de éxito esperada y criterio de medición.

RESPONDE SOLO CON EL JSON. Sin explicaciones, sin markdown.`;
}

function buildUserPrompt(req: AnalyzeRequest): string {
  const t = req.ticket;
  let prompt = `TICKET: ${t.key} — ${t.title}\n\nDESCRIPCIÓN:\n${t.description}`;
  if (t.acceptance_criteria) {
    prompt += `\n\nCRITERIOS DE ACEPTACIÓN EXISTENTES:\n${t.acceptance_criteria}`;
  }
  if (t.comments?.length) {
    prompt += `\n\nCOMENTARIOS DEL EQUIPO:\n${t.comments.join("\n---\n")}`;
  }
  if (req.organizationName) {
    prompt += `\n\nORGANIZACIÓN: ${req.organizationName}`;
  }
  return prompt;
}

// ---------------------------------------------------------------------------
// Llamada a OpenRouter con un modelo específico
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

  // Limpiar posibles backticks markdown que el modelo pueda agregar
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const parsed: AnalyzeOutput = JSON.parse(cleaned);

  // Validar que las 6 claves existan
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

    // Validación de entrada
    if (!body.ticket?.key || !body.ticket?.title || !body.ticket?.description) {
      return Response.json(
        { error: "Faltan campos obligatorios: ticket.key, ticket.title, ticket.description" },
        { status: 400 }
      );
    }

    if (!body.designSystem) {
      return Response.json(
        { error: "Falta el objeto designSystem" },
        { status: 400 }
      );
    }

    const systemPrompt = buildSystemPrompt(body);
    const userPrompt = buildUserPrompt(body);

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

    // Todos los modelos fallaron
    return Response.json(
      {
        error: "Todos los modelos de la cascada fallaron",
        details: errors,
      },
      { status: 502 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    return Response.json({ error: msg }, { status: 500 });
  }
}
