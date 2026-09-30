import { readFileSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// drizzle-kit corre fuera de Next: carga .env manualmente si hace falta.
function loadDatabaseUrl(): string {
  const fromEnvironment =
    process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
  if (fromEnvironment) return fromEnvironment;
  for (const file of [".env.local", ".env"]) {
    try {
      const env = readFileSync(file, "utf8");
      const lines = env.split(/\r?\n/);
      for (const variable of ["MIGRATION_DATABASE_URL", "DATABASE_URL"]) {
        const line = lines.find((entry) => entry.startsWith(`${variable}=`));
        const url = line?.slice(`${variable}=`.length).trim();
        if (url) return url;
      }
    } catch {
      // probar el siguiente archivo; drizzle-kit dará un error si falta la URL
    }
  }
  return "";
}

/**
 * `TimeZone=UTC` en la sesión: mismo invariante que src/lib/db/index.ts, pero
 * aquí solo cabe en la URL — drizzle-kit no expone parámetros de conexión.
 * Se manda como el parámetro de arranque `options`, que entienden tanto
 * postgres-js como libpq.
 */
function withUtcSession(url: string): string {
  if (!url || /[?&](options|TimeZone)=/i.test(url)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}options=-c%20timezone%3DUTC`;
}

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: withUtcSession(loadDatabaseUrl()),
  },
});
