"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signUp } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isValidUsername, normalizeUsername, usernameLoginEmail } from "@/lib/auth/username";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isValidUsername(name)) {
      setError("Usa entre 3 y 32 caracteres: letras, números, punto, guion o guion bajo.");
      return;
    }
    setLoading(true);
    const username = normalizeUsername(name);
    const { error: err } = await signUp.email({
      name: name.trim(),
      email: usernameLoginEmail(username),
      password,
    });
    setLoading(false);
    if (err) {
      if (err.status === 403) {
        setError(
          "El registro está cerrado: esta instancia ya tiene su organización. Pide acceso al propietario."
        );
      } else if (err.status === 429) {
        setError("Demasiados intentos. Espera unos minutos.");
      } else if (/already exists|already used|duplicate/i.test(err.message ?? "")) {
        setError("Ese nombre de usuario ya está registrado. Prueba con otro.");
      } else {
        setError(err.message ?? "No se pudo crear la cuenta.");
      }
      return;
    }
    router.push("/inbox");
    router.refresh();
  }

  return (
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle>Crear cuenta</CardTitle>
        <CardDescription>
          Crea tu acceso con un nombre de usuario y una contraseña.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Nombre de usuario</Label>
            <Input
              id="name"
              required
              minLength={3}
              maxLength={32}
              autoComplete="username"
              placeholder="ej. maria_garcia"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creando…" : "Crear cuenta"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            ¿Ya tienes cuenta?{" "}
            <Link href="/login" className="text-primary hover:underline">
              Inicia sesión
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
