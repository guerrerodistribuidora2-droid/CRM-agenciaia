"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Globe2, MessageSquareText, Plus, Search, Trash2 } from "lucide-react";
import type { ContactDto } from "@/lib/types";
import type { ManagedWebsite } from "@/server/websites";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StartConversation } from "@/components/contacts/start-conversation";

type Draft = Omit<ManagedWebsite, "id" | "updatedAt">;
const EMPTY: Draft = {
  name: "", url: "https://", clientName: "", contactId: null,
  platform: "WordPress", status: "activo", monthlyFee: null,
  renewalDate: null, notes: "",
};

const statusLabels = { activo: "Activo", en_proceso: "En proceso", pausado: "Pausado" };

export function WebsitesClient() {
  const router = useRouter();
  const [websites, setWebsites] = useState<ManagedWebsite[]>([]);
  const [contacts, setContacts] = useState<ContactDto[]>([]);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [messageSite, setMessageSite] = useState<ManagedWebsite | null>(null);

  const refresh = useCallback(async () => {
    const [sitesRes, contactsRes] = await Promise.all([
      fetch("/api/websites"), fetch("/api/contacts?archived=false"),
    ]).catch(() => [null, null]);
    if (sitesRes?.ok) setWebsites(((await sitesRes.json()) as { websites: ManagedWebsite[] }).websites);
    if (contactsRes?.ok) setContacts(((await contactsRes.json()) as { contacts: ContactDto[] }).contacts);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const visible = useMemo(() => {
    const q = search.trim().toLocaleLowerCase();
    return websites.filter((website) => !q || `${website.name} ${website.clientName} ${website.url}`.toLocaleLowerCase().includes(q));
  }, [websites, search]);
  const activeCount = websites.filter((site) => site.status === "activo").length;
  const recurring = websites.reduce((sum, site) => sum + (site.monthlyFee ?? 0), 0);

  function beginCreate() { setEditing("new"); setDraft(EMPTY); setError(""); }
  function beginEdit(site: ManagedWebsite) {
    setEditing(site.id);
    const { id: _id, updatedAt: _updatedAt, ...data } = site;
    setDraft(data);
    setError("");
  }

  async function save() {
    setBusy(true); setError("");
    const payload = { ...draft, monthlyFee: draft.monthlyFee === null ? null : Number(draft.monthlyFee) };
    const res = await fetch("/api/websites", {
      method: editing === "new" ? "POST" : "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(editing === "new" ? payload : { ...payload, id: editing }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const data = await res?.json().catch(() => null);
      setError(data?.error?.message ?? "No se pudo guardar el sitio.");
      return;
    }
    setEditing(null); await refresh();
  }

  async function remove(site: ManagedWebsite) {
    if (!window.confirm(`¿Quitar ${site.name} de tu cartera?`)) return;
    await fetch("/api/websites", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: site.id }) });
    await refresh();
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b px-5 py-4 sm:px-8">
        <div>
          <p className="kicker mb-1">OPERACIONES DE AGENCIA</p>
          <h1 className="text-xl font-bold tracking-tight">Sitios web</h1>
          <p className="mt-1 text-sm text-muted-foreground">Clientes, plataformas, renovaciones y mantenimiento en un solo lugar.</p>
        </div>
        <Button onClick={beginCreate}><Plus className="mr-1.5 h-4 w-4" />Agregar sitio</Button>
      </header>

      <section className="grid gap-3 border-b p-5 sm:grid-cols-3 sm:px-8">
        <Metric label="Sitios en cartera" value={String(websites.length)} />
        <Metric label="Activos" value={String(activeCount)} />
        <Metric label="Mantenimiento mensual" value={`$${recurring.toLocaleString("es-EC", { maximumFractionDigits: 0 })}`} />
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8">
        <p className="text-sm font-semibold">Cartera de sitios</p>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente o dominio…" className="pl-8" />
        </div>
      </div>

      <div className="flex-1 px-5 pb-8 sm:px-8">
        {visible.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed bg-card text-center">
            <span className="mb-3 rounded-xl bg-brand-tint p-3 text-brand"><Globe2 className="h-6 w-6" /></span>
            <p className="font-semibold">{websites.length ? "No hay sitios para esta búsqueda" : "Tu cartera web empieza aquí"}</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">Guarda dominio, cliente, plataforma, mantenimiento y notas para tener cada proyecto a mano.</p>
            {!websites.length && <Button variant="secondary" className="mt-4" onClick={beginCreate}>Agregar primer sitio</Button>}
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {visible.map((site) => {
              const contact = contacts.find((item) => item.id === site.contactId);
              return <article key={site.id} className="rounded-xl border bg-card p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="rounded-lg bg-brand-tint p-2.5 text-brand"><Globe2 className="h-5 w-5" /></span>
                    <div className="min-w-0">
                      <h2 className="truncate font-semibold">{site.name}</h2>
                      <p className="text-sm text-muted-foreground">{site.clientName}</p>
                      <a href={site.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-xs text-brand hover:underline">{site.url}<ExternalLink className="h-3 w-3 shrink-0" /></a>
                    </div>
                  </div>
                  <Badge variant={site.status === "activo" ? "default" : "secondary"}>{statusLabels[site.status]}</Badge>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-subtle p-3 text-xs">
                  <div><span className="text-muted-foreground">Plataforma</span><p className="mt-0.5 font-medium">{site.platform}</p></div>
                  <div><span className="text-muted-foreground">Mantenimiento</span><p className="mt-0.5 font-medium">{site.monthlyFee ? `$${site.monthlyFee}/mes` : "Sin cuota registrada"}</p></div>
                  <div><span className="text-muted-foreground">Renovación</span><p className="mt-0.5 font-medium">{site.renewalDate || "Sin fecha"}</p></div>
                  <div><span className="text-muted-foreground">Contacto</span><p className="mt-0.5 truncate font-medium">{contact?.name ?? (site.contactId ? "Contacto no disponible" : "Sin vincular")}</p></div>
                </div>
                {site.notes && <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">{site.notes}</p>}
                <div className="mt-3 flex items-center justify-between border-t pt-3">
                  <div className="flex gap-1">
                    {contact && <Button size="sm" variant="secondary" onClick={() => setMessageSite(site)}><MessageSquareText className="mr-1.5 h-3.5 w-3.5" />Iniciar conversación</Button>}
                    {site.contactId && !contact && <Button size="sm" variant="secondary" onClick={() => router.push("/contacts")}>Ver contactos</Button>}
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => beginEdit(site)}>Editar</Button>
                    <Button size="icon" variant="ghost" aria-label={`Quitar ${site.name}`} onClick={() => void remove(site)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              </article>;
            })}
          </div>
        )}
      </div>

      {editing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4" role="dialog" aria-modal="true" aria-label="Datos del sitio web">
        <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border bg-card p-5 shadow-pop">
          <h2 className="text-lg font-bold">{editing === "new" ? "Agregar sitio web" : "Editar sitio web"}</h2>
          <p className="mb-4 mt-1 text-sm text-muted-foreground">Organiza la entrega y el mantenimiento para este cliente.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre del proyecto"><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Web corporativa" /></Field>
            <Field label="Cliente"><Input value={draft.clientName} onChange={(e) => setDraft({ ...draft, clientName: e.target.value })} placeholder="Nombre del cliente" /></Field>
            <Field label="Dominio"><Input value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} placeholder="https://cliente.com" /></Field>
            <Field label="Plataforma"><Input value={draft.platform} onChange={(e) => setDraft({ ...draft, platform: e.target.value })} placeholder="WordPress, Shopify…" /></Field>
            <Field label="Estado"><select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as Draft["status"] })} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"><option value="activo">Activo</option><option value="en_proceso">En proceso</option><option value="pausado">Pausado</option></select></Field>
            <Field label="Contacto para WhatsApp"><select value={draft.contactId ?? ""} onChange={(e) => setDraft({ ...draft, contactId: e.target.value || null })} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"><option value="">Sin vincular</option>{contacts.filter((contact) => contact.phone).map((contact) => <option key={contact.id} value={contact.id}>{contact.name} · {contact.phone}</option>)}</select></Field>
            <Field label="Mantenimiento mensual ($)"><Input type="number" min="0" value={draft.monthlyFee ?? ""} onChange={(e) => setDraft({ ...draft, monthlyFee: e.target.value ? Number(e.target.value) : null })} placeholder="0" /></Field>
            <Field label="Renovación"><Input type="date" value={draft.renewalDate ?? ""} onChange={(e) => setDraft({ ...draft, renewalDate: e.target.value || null })} /></Field>
          </div>
          <Field label="Notas del proyecto"><Textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Hosting, accesos pendientes, alcance, próxima tarea…" className="min-h-20" /></Field>
          {error && <p className="mt-3 text-sm text-danger-text">{error}</p>}
          <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button><Button disabled={busy} onClick={() => void save()}>{busy ? "Guardando…" : "Guardar sitio"}</Button></div>
        </div>
      </div>}

      {messageSite && messageSite.contactId && <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4" role="dialog" aria-modal="true" aria-label="Iniciar conversación">
        <div className="w-full max-w-md rounded-xl border bg-card p-5 shadow-pop">
          <div className="mb-3 flex items-start justify-between"><div><h2 className="font-bold">Iniciar conversación</h2><p className="text-sm text-muted-foreground">Contexto: {messageSite.clientName} · {messageSite.name}</p></div><Button variant="ghost" size="sm" onClick={() => setMessageSite(null)}>Cerrar</Button></div>
          <StartConversation contactId={messageSite.contactId} initialVariables={[messageSite.clientName, messageSite.name, messageSite.url]} onStarted={() => { setMessageSite(null); router.push(`/inbox?contact=${messageSite.contactId}`); }} />
        </div>
      </div>}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border bg-card p-4"><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold tracking-tight">{value}</p></div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="mb-3 block space-y-1.5 text-xs font-medium text-text-2"><span>{label}</span>{children}</label>;
}
