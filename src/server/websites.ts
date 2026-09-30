import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

export type ManagedWebsite = {
  id: string;
  name: string;
  url: string;
  clientName: string;
  contactId: string | null;
  platform: string;
  status: "activo" | "en_proceso" | "pausado";
  monthlyFee: number | null;
  renewalDate: string | null;
  notes: string;
  updatedAt: string;
};

function metadataObject(raw: string | null): Record<string, unknown> {
  try {
    const value: unknown = raw ? JSON.parse(raw) : {};
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export async function listWebsites(organizationId: string): Promise<ManagedWebsite[]> {
  const db = getDb();
  const rows = await db
    .select({ metadata: schema.organization.metadata })
    .from(schema.organization)
    .where(eq(schema.organization.id, organizationId))
    .limit(1);
  const value = metadataObject(rows[0]?.metadata ?? null).managedWebsites;
  return Array.isArray(value) ? (value as ManagedWebsite[]) : [];
}

export async function saveWebsites(
  organizationId: string,
  websites: ManagedWebsite[]
): Promise<void> {
  const db = getDb();
  const rows = await db
    .select({ metadata: schema.organization.metadata })
    .from(schema.organization)
    .where(eq(schema.organization.id, organizationId))
    .limit(1);
  if (!rows[0]) return;
  const meta = metadataObject(rows[0].metadata);
  meta.managedWebsites = websites;
  await db
    .update(schema.organization)
    .set({ metadata: JSON.stringify(meta) })
    .where(eq(schema.organization.id, organizationId));
}
