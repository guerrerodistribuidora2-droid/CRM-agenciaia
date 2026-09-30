import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { listWebsites, saveWebsites, type ManagedWebsite } from "@/server/websites";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session) =>
  Response.json({ websites: await listWebsites(session.organizationId) })
);

const websiteSchema = z.object({
  name: z.string().trim().min(1).max(120),
  url: z.string().trim().url().max(500),
  clientName: z.string().trim().min(1).max(120),
  contactId: z.string().trim().min(1).nullable().optional(),
  platform: z.string().trim().max(80).default("Otro"),
  status: z.enum(["activo", "en_proceso", "pausado"]).default("activo"),
  monthlyFee: z.number().min(0).max(1000000).nullable().optional(),
  renewalDate: z.string().date().nullable().optional(),
  notes: z.string().max(4000).default(""),
});

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, websiteSchema);
  if (!body.ok) return body.response;
  if (body.data.contactId && !(await ownsContact(session.organizationId, body.data.contactId))) {
    return apiError(422, "invalid_contact", "El contacto seleccionado no existe");
  }
  const websites = await listWebsites(session.organizationId);
  const website: ManagedWebsite = {
    ...body.data,
    id: crypto.randomUUID(),
    platform: body.data.platform ?? "Otro",
    status: body.data.status ?? "activo",
    notes: body.data.notes ?? "",
    contactId: body.data.contactId ?? null,
    monthlyFee: body.data.monthlyFee ?? null,
    renewalDate: body.data.renewalDate ?? null,
    updatedAt: new Date().toISOString(),
  };
  websites.unshift(website);
  await saveWebsites(session.organizationId, websites);
  return Response.json({ website }, { status: 201 });
});

export const PATCH = withAuth(async (session, req: Request) => {
  const body = await parseBody(
    req,
    websiteSchema.extend({ id: z.string().min(1) })
  );
  if (!body.ok) return body.response;
  if (body.data.contactId && !(await ownsContact(session.organizationId, body.data.contactId))) {
    return apiError(422, "invalid_contact", "El contacto seleccionado no existe");
  }
  const websites = await listWebsites(session.organizationId);
  const index = websites.findIndex((website) => website.id === body.data.id);
  if (index < 0) return apiError(404, "not_found", "No se encontró el sitio web");
  const { id, ...data } = body.data;
  const website: ManagedWebsite = {
    ...data,
    id,
    platform: data.platform ?? "Otro",
    status: data.status ?? "activo",
    notes: data.notes ?? "",
    contactId: data.contactId ?? null,
    monthlyFee: data.monthlyFee ?? null,
    renewalDate: data.renewalDate ?? null,
    updatedAt: new Date().toISOString(),
  };
  websites[index] = website;
  await saveWebsites(session.organizationId, websites);
  return Response.json({ website });
});

export const DELETE = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, z.object({ id: z.string().min(1) }));
  if (!body.ok) return body.response;
  const websites = await listWebsites(session.organizationId);
  const next = websites.filter((website) => website.id !== body.data.id);
  if (next.length === websites.length) {
    return apiError(404, "not_found", "No se encontró el sitio web");
  }
  await saveWebsites(session.organizationId, next);
  return Response.json({ ok: true });
});

async function ownsContact(organizationId: string, contactId: string) {
  const rows = await getDb()
    .select({ id: schema.contact.id })
    .from(schema.contact)
    .where(and(eq(schema.contact.organizationId, organizationId), eq(schema.contact.id, contactId)))
    .limit(1);
  return Boolean(rows[0]);
}
