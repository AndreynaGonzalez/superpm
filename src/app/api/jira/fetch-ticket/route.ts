import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Helpers para convertir ADF (Atlassian Document Format) a texto plano
// ---------------------------------------------------------------------------
interface AdfNode {
  type: string;
  text?: string;
  content?: AdfNode[];
}

function adfToText(node: AdfNode | undefined | null): string {
  if (!node) return "";
  if (node.text) return node.text;
  if (node.content) return node.content.map(adfToText).join(node.type === "paragraph" ? "\n" : "");
  return "";
}

// ---------------------------------------------------------------------------
// POST /api/jira/fetch-ticket
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const { ticketId } = await request.json();

    if (!ticketId || typeof ticketId !== "string") {
      return Response.json(
        { error: "Falta el campo ticketId" },
        { status: 400 }
      );
    }

    const domain = process.env.JIRA_DOMAIN;
    const email = process.env.JIRA_USER_EMAIL;
    const token = process.env.JIRA_API_TOKEN;

    // Diagnóstico de variables (token oculto por seguridad)
    console.log("[Jira] JIRA_DOMAIN:", domain ?? "undefined");
    console.log("[Jira] JIRA_USER_EMAIL:", email ?? "undefined");
    console.log("[Jira] JIRA_API_TOKEN:", token ? `configurado (${token.length} chars)` : "undefined");

    if (!domain || !email || !token) {
      console.error("[Jira] Faltan credenciales. Abortando.");
      return Response.json(
        { error: "Credenciales de Jira no configuradas en el servidor" },
        { status: 500 }
      );
    }

    // Basic Auth en Base64 (server-side, nunca expuesto al frontend)
    const auth = Buffer.from(`${email}:${token}`).toString("base64");
    const url = `https://${domain}/rest/api/3/issue/${encodeURIComponent(ticketId)}?fields=summary,description,status,priority,assignee,comment`;
    console.log("[Jira] Fetching:", url);

    const res = await fetch(url, {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
      },
    });

    console.log("[Jira] Response status:", res.status);

    if (!res.ok) {
      const body = await res.text();
      console.error("[Jira] Error body:", body);
      if (res.status === 404) {
        return Response.json(
          { error: `Ticket ${ticketId} no encontrado en Jira` },
          { status: 404 }
        );
      }
      if (res.status === 401 || res.status === 403) {
        return Response.json(
          { error: `Credenciales de Jira inválidas o sin permisos (${res.status})` },
          { status: 401 }
        );
      }
      return Response.json(
        { error: `Jira respondió ${res.status}: ${body}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    const fields = data.fields;

    // Extraer descripción (ADF → texto plano)
    const description = adfToText(fields.description) || "Sin descripción";

    // Extraer comentarios
    const comments: string[] = (fields.comment?.comments ?? [])
      .slice(-5) // últimos 5 comentarios
      .map((c: { body?: AdfNode }) => adfToText(c.body))
      .filter((t: string) => t.length > 0);

    return Response.json({
      success: true,
      ticket: {
        key: data.key,
        title: fields.summary || ticketId,
        description,
        status: fields.status?.name ?? null,
        priority: fields.priority?.name ?? null,
        assignee: fields.assignee?.displayName ?? null,
        comments,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    return Response.json({ error: msg }, { status: 500 });
  }
}
