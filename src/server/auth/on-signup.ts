import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";

/** Etapas sembradas del pipeline (US2). */
const SEED_STAGES: { name: string; kind: "open" | "won" | "lost" }[] = [
  { name: "Nuevo", kind: "open" },
  { name: "En conversación", kind: "open" },
  { name: "Interesado", kind: "open" },
  { name: "Cliente", kind: "won" },
  { name: "Perdido", kind: "lost" },
];

/**
 * Primer registro de la instancia: crea la organización, deja al usuario como
 * propietario y siembra pipeline + perfil del agente.
 *
 * Solo actúa si NO existe ninguna organización (las cuentas de equipo las crea
 * el propietario y reciben su membresía explícita). Un advisory lock evita que
 * dos registros simultáneos en instancia vacía creen dos organizaciones.
 */
export async function onUserCreated(
  userId: string,
  userName: string,
  joinExistingOrganization = false
) {
  const db = getDb();
  await db.transaction(async (tx) => {
    // Lock transaccional de "primer arranque" (clave arbitraria fija):
    // dos registros simultáneos en instancia vacía → solo uno crea la org.
    await tx.execute(sql`select pg_advisory_xact_lock(874201)`);
    const orgs = await tx
      .select({ id: schema.organization.id })
      .from(schema.organization);
    if (orgs.length > 0) {
      // Reabrir el registro (ALLOW_SIGNUP=true) permite que se unan usuarios
      // a la organización ya creada. Por defecto quedan como miembros; el
      // propietario conserva la gestión de conexiones y ajustes sensibles.
      // Las altas internas por invitación siguen el flujo del plugin de orgs.
      const existingOrgId = orgs.length === 1 ? orgs[0]?.id : undefined;
      if (joinExistingOrganization && existingOrgId) {
        await tx.insert(schema.member).values({
          id: newId("member"),
          organizationId: existingOrgId,
          userId,
          role: "member",
        });
      }
      return;
    }

    const orgId = newId("organization");
    await tx.insert(schema.organization).values({
      id: orgId,
      name: userName ? `Negocio de ${userName}` : "Mi negocio",
      slug: "principal",
    });
    await tx.insert(schema.member).values({
      id: newId("member"),
      organizationId: orgId,
      userId,
      role: "owner",
    });
    await tx.insert(schema.pipelineStage).values(
      SEED_STAGES.map((s, i) => ({
        id: newId("stage"),
        organizationId: orgId,
        name: s.name,
        position: i,
        kind: s.kind,
      }))
    );
    await tx.insert(schema.agentProfile).values({
      id: newId("agentProfile"),
      organizationId: orgId,
    });
  });
}

/** Organización activa de un usuario (su primera membresía). */
export async function resolveActiveOrganizationId(
  userId: string
): Promise<string | null> {
  const current = await resolveMembership(userId);
  if (current) return current.organizationId;
  // Una cuenta que se creó antes de reabrir el registro pudo quedar sin
  // membresía si ya existía la organización. Tras autenticarla, completar su
  // alta como miembro en la única organización de la instancia.
  if (process.env.ALLOW_SIGNUP !== "true") return null;
  const db = getDb();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(874201)`);
    const existingMembership = await tx
      .select({ organizationId: schema.member.organizationId })
      .from(schema.member)
      .where(eq(schema.member.userId, userId))
      .limit(1);
    if (existingMembership[0]) return existingMembership[0].organizationId;
    const orgs = await tx
      .select({ id: schema.organization.id })
      .from(schema.organization)
      .limit(2);
    if (orgs.length !== 1 || !orgs[0]) return null;
    await tx.insert(schema.member).values({
      id: newId("member"),
      organizationId: orgs[0].id,
      userId,
      role: "member",
    });
    return orgs[0].id;
  });
}

export async function resolveMembership(
  userId: string
): Promise<{ organizationId: string; role: string } | null> {
  const db = getDb();
  const rows = await db
    .select({
      organizationId: schema.member.organizationId,
      role: schema.member.role,
    })
    .from(schema.member)
    .where(eq(schema.member.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}
