"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ExternalLink,
  Facebook,
  MessageCircleMore,
  RefreshCw,
  Send,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type CommentItem = {
  id: string;
  postId?: string;
  platformPostId?: string;
  text?: string;
  message?: string;
  content?: string;
  createdTime?: string;
  createdAt?: string;
  author?: { name?: string; username?: string; profilePictureUrl?: string };
  post?: { id?: string; text?: string; permalink?: string; url?: string };
  replies?: { text?: string; message?: string }[];
  accountId?: string;
};

function unwrapComments(raw: unknown): CommentItem[] {
  if (Array.isArray(raw)) return raw as CommentItem[];
  if (!raw || typeof raw !== "object") return [];
  const value = raw as { data?: unknown; comments?: unknown };
  if (Array.isArray(value.data)) return value.data as CommentItem[];
  if (
    value.data &&
    typeof value.data === "object" &&
    Array.isArray((value.data as { comments?: unknown }).comments)
  ) {
    return (value.data as { comments: CommentItem[] }).comments;
  }
  return Array.isArray(value.comments) ? (value.comments as CommentItem[]) : [];
}

export function CommentsClient() {
  const [items, setItems] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState<Record<string, boolean>>({});
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const refreshing = useRef(false);
  const knownCommentIds = useRef<Set<string> | null>(null);

  const suggest = useCallback(async (comment: CommentItem) => {
    const text = comment.text ?? comment.message ?? comment.content ?? "";
    if (!text.trim()) return;
    setSuggesting((state) => ({ ...state, [comment.id]: true }));
    setError("");
    try {
      const res = await fetch("/api/comments/facebook/suggest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ comment: text, post: comment.post?.text ?? "" }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error?.message ?? "No se pudo generar una sugerencia.");
        return;
      }
      setDrafts((state) => ({ ...state, [comment.id]: data.text }));
    } catch {
      setError("No se pudo conectar con el agente. Inténtalo otra vez.");
    } finally {
      setSuggesting((state) => ({ ...state, [comment.id]: false }));
    }
  }, []);

  const refresh = useCallback(async (silent = false) => {
    if (refreshing.current) return;
    refreshing.current = true;
    if (!silent) setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/comments/facebook", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error?.message ?? "No se pudieron cargar los comentarios.");
        if (!silent) setItems([]);
        return;
      }
      const nextItems = unwrapComments(data);
      const previousIds = knownCommentIds.current;
      knownCommentIds.current = new Set([
        ...(previousIds ?? []),
        ...nextItems.map((item) => item.id),
      ]);
      if (previousIds) {
        // Review a small batch on each poll; remaining comments can be reviewed
        // manually, which avoids a burst of model calls on a busy page.
        for (const item of nextItems.filter((entry) => !previousIds.has(entry.id)).slice(0, 3)) {
          void suggest(item);
        }
      }
      setItems(nextItems);
      setLastUpdated(new Date());
    } catch {
      setError("No se pudo conectar para actualizar los comentarios.");
      if (!silent) setItems([]);
    } finally {
      refreshing.current = false;
      if (!silent) setLoading(false);
    }
  }, [suggest]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh(true);
    }, 20_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function reply(comment: CommentItem) {
    const postId = comment.postId ?? comment.platformPostId ?? comment.post?.id;
    const text = drafts[comment.id]?.trim();
    if (!postId || !text) return;
    setSending(comment.id);
    setError("");
    const res = await fetch("/api/comments/facebook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ postId, commentId: comment.id, text }),
    }).catch(() => null);
    setSending(null);
    if (!res?.ok) {
      const data = await res?.json().catch(() => null);
      setError(data?.error?.message ?? "No se pudo enviar la respuesta.");
      return;
    }
    setSent((state) => ({ ...state, [comment.id]: true }));
    setDrafts((state) => ({ ...state, [comment.id]: "" }));
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b px-5 py-4 sm:px-8">
        <div>
          <p className="kicker mb-1">CANALES SOCIALES</p>
          <h1 className="text-xl font-bold tracking-tight">Comentarios de Facebook</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            El agente prepara una respuesta con invitación a WhatsApp. Cuando el cliente
            escriba, la conversación entrará a la bandeja del CRM para calificarlo y
            ofrecerle una cita.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="hidden text-xs text-muted-foreground sm:inline">
              Actualizado {lastUpdated.toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <Button variant="secondary" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
        </div>
      </header>

      <div className="flex-1 p-5 sm:p-8">
        {error && (
          <div className="mx-auto mb-4 max-w-3xl rounded-lg border border-warning-soft bg-warning-tint p-4 text-sm text-warning-text">
            {error}
            {error.includes("Messenger") && (
              <a className="ml-1 font-semibold underline" href="/settings/messenger">
                Abrir Ajustes de Messenger
              </a>
            )}
            {error.includes("WhatsApp") && (
              <a className="ml-1 font-semibold underline" href="/settings/whatsapp">
                Abrir Ajustes de WhatsApp
              </a>
            )}
            {error.includes("OPENROUTER") && (
              <a className="ml-1 font-semibold underline" href="/agent">
                Configurar el agente
              </a>
            )}
          </div>
        )}

        {loading ? (
          <p className="py-16 text-center text-sm text-muted-foreground">Cargando comentarios…</p>
        ) : items.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed bg-card text-center">
            <span className="mb-3 rounded-xl bg-brand-tint p-3 text-brand">
              <MessageCircleMore className="h-6 w-6" />
            </span>
            <p className="font-semibold">No hay comentarios para mostrar</p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Conecta una página de Facebook por Zernio en Ajustes → Messenger. Los
              comentarios se actualizan automáticamente cada 20 segundos mientras esta
              pantalla esté abierta.
            </p>
            <a href="/settings/messenger" className="mt-4">
              <Button variant="secondary">Configurar Messenger</Button>
            </a>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-3">
            {items.map((item) => {
              const name = item.author?.name ?? item.author?.username ?? "Usuario de Facebook";
              const postId = item.postId ?? item.platformPostId ?? item.post?.id;
              const timestamp = item.createdTime ?? item.createdAt;
              return (
                <article key={item.id} className="rounded-xl border bg-card p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <Facebook className="h-4 w-4 shrink-0 text-[#1877f2]" />
                      <span className="truncate text-sm font-semibold">{name}</span>
                      <Badge variant="secondary">Facebook</Badge>
                    </div>
                    {timestamp && (
                      <time className="shrink-0 text-xs text-muted-foreground">
                        {new Date(timestamp).toLocaleString("es-EC")}
                      </time>
                    )}
                  </div>
                  <p className="my-3 whitespace-pre-wrap text-sm">
                    {item.text ?? item.message ?? item.content ?? "(Comentario sin texto)"}
                  </p>
                  {(item.post?.text || item.post?.permalink || item.post?.url) && (
                    <div className="rounded-lg bg-subtle px-3 py-2 text-xs text-muted-foreground">
                      <span className="font-semibold">Publicación:</span>{" "}
                      {item.post.text && <span>{item.post.text.slice(0, 180)} </span>}
                      {(item.post.permalink || item.post.url) && (
                        <a
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-brand hover:underline"
                          href={item.post.permalink ?? item.post.url}
                        >
                          Ver publicación <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  )}
                  {item.replies?.map((reply, index) => (
                    <p key={index} className="ml-5 mt-2 border-l-2 pl-3 text-xs text-muted-foreground">
                      {reply.text ?? reply.message}
                    </p>
                  ))}
                  {sent[item.id] ? (
                    <p className="mt-3 text-xs font-medium text-emerald-700">Respuesta enviada</p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground">
                          Revisa el texto antes de publicarlo en Facebook.
                        </p>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={suggesting[item.id]}
                          onClick={() => void suggest(item)}
                        >
                          <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                          {suggesting[item.id] ? "Preparando…" : "Sugerir respuesta con IA"}
                        </Button>
                      </div>
                      <div className="flex items-end gap-2">
                        <Textarea
                          className="min-h-24"
                          value={drafts[item.id] ?? ""}
                          onChange={(event) =>
                            setDrafts((state) => ({ ...state, [item.id]: event.target.value }))
                          }
                          placeholder="Escribe una respuesta o pide una sugerencia al agente…"
                          aria-label={`Responder a ${name}`}
                        />
                        <Button
                          size="sm"
                          disabled={!postId || !drafts[item.id]?.trim() || sending === item.id}
                          onClick={() => void reply(item)}
                        >
                          <Send className="mr-1.5 h-3.5 w-3.5" />
                          {sending === item.id ? "Enviando…" : "Publicar"}
                        </Button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
        <p className="mx-auto mt-4 max-w-3xl text-center text-xs text-muted-foreground">
          Los comentarios se consultan cada 20 segundos mientras la página está abierta.
          Zernio puede almacenar datos en caché durante algunos minutos.
        </p>
      </div>
    </div>
  );
}
