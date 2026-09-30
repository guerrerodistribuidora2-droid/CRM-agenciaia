import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getMessengerCredentialsByOrg } from "@/server/messenger/credentials";
import { zernioFetch } from "@/server/zernio";

export const dynamic = "force-dynamic";

async function facebookConnection(organizationId: string) {
  const credentials = await getMessengerCredentialsByOrg(organizationId);
  if (
    !credentials ||
    credentials.source !== "zernio" ||
    credentials.status !== "connected" ||
    !credentials.accountRef
  ) {
    return null;
  }
  return credentials;
}

export const GET = withAuth(async (session) => {
  const connection = await facebookConnection(session.organizationId);
  if (!connection) {
    return apiError(424, "zernio_required", "Conecta Messenger usando Zernio en Ajustes → Messenger para consultar comentarios.");
  }
  try {
    const result = await zernioFetch(
      `/inbox/comments?platform=facebook&accountId=${encodeURIComponent(connection.accountRef!)}&limit=50&sortBy=date&sortOrder=desc`,
      { token: connection.token }
    );
    return Response.json(result);
  } catch {
    return apiError(502, "comments_unavailable", "No se pudieron cargar los comentarios de Facebook. Revisa la conexión y los permisos de Zernio.");
  }
});

const replySchema = z.object({
  postId: z.string().trim().min(1).max(200),
  commentId: z.string().trim().min(1).max(200),
  text: z.string().trim().min(1).max(8000),
});

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, replySchema);
  if (!body.ok) return body.response;
  const connection = await facebookConnection(session.organizationId);
  if (!connection) {
    return apiError(424, "zernio_required", "Conecta Messenger usando Zernio en Ajustes → Messenger para responder comentarios.");
  }
  try {
    const result = await zernioFetch(
      `/inbox/comments/${encodeURIComponent(body.data.postId)}`,
      {
        method: "POST",
        token: connection.token,
        body: {
          accountId: connection.accountRef,
          commentId: body.data.commentId,
          text: body.data.text,
        },
      }
    );
    return Response.json(result);
  } catch {
    return apiError(502, "reply_failed", "Facebook no aceptó la respuesta. Verifica que la página permita responder ese comentario.");
  }
});
