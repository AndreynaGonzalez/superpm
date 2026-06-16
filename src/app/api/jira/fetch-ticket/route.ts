import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

// ---------------------------------------------------------------------------
// ADF → texto plano
// ---------------------------------------------------------------------------
interface AdfNode {
  type: string;
  text?: string;
  content?: AdfNode[];
}

function adfToText(node: AdfNode | undefined | null): string {
  if (!node) return "";
  if (node.text) return node.text;
  if (node.content)
    return node.content
      .map(adfToText)
      .join(node.type === "paragraph" ? "\n" : "");
  return "";
}

// ---------------------------------------------------------------------------
// POST /api/jira/fetch-ticket
// Recibe: { ticketId, organizationId }
// Lee credenciales de jira_integrations por organization_id
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const { ticketId, organizationId } = await request.json();

    if (!ticketId || typeof ticketId !== "string") {
      return Response.json(
        { error: "Falta el campo ticketId" },
        { status: 400 }
      );
    }

    if (!organizationId || typeof organizationId !== "string") {
      return Response.json(
        { error: "Falta el campo organizationId" },
        { status: 400 }
      );
    }

    // Consulta dinámica: traer credenciales Jira de esta organización
    const supabase = await getSupabaseServer();

    const { data: jiraConfig, error: dbErr } = await supabase
      .from("jira_integrations")
      .select("jira_domain, encrypted_token, admin_email, is_active")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (dbErr || !jiraConfig) {
      return Response.json(
        {
          error:
            "No hay integración de Jira configurada para esta organización. Configurala en Integraciones.",
        },
        { status: 404 }
      );
    }

    const { jira_domain, encrypted_token, admin_email } = jiraConfig;

    if (!jira_domain || !encrypted_token || !admin_email) {
      return Response.json(
        { error: "La integración de Jira está incompleta. Revisá los datos en Integraciones." },
        { status: 422 }
      );
    }

    // Basic Auth con los datos de la organización
    const auth = Buffer.from(`${admin_email}:${encrypted_token}`).toString(
      "base64"
    );

    const url = `https://${jira_domain}/rest/api/3/issue/${encodeURIComponent(
      ticketId
    )}?fields=summary,description,status,priority,assignee,comment`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      const body = await res.text();
      if (res.status === 404) {
        return Response.json(
          { error: `Ticket ${ticketId} no encontrado en Jira` },
          { status: 404 }
        );
      }
      if (res.status === 401 || res.status === 403) {
        return Response.json(
          {
            error:
              "Credenciales de Jira inválidas o sin permisos. Actualizá el token en Integraciones.",
          },
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

    const description = adfToText(fields.description) || "Sin descripción";

    const comments: string[] = (fields.comment?.comments ?? [])
      .slice(-5)
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
