/**
 * The authentication provider currently requires an email address. Give
 * username-only accounts a stable internal address without asking the person
 * to create or remember an email account.
 */
export function normalizeUsername(value: string): string {
  return value
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, ".");
}

export function isValidUsername(value: string): boolean {
  return /^[a-z0-9._-]{3,32}$/.test(normalizeUsername(value));
}

export function usernameLoginEmail(value: string): string {
  const normalized = normalizeUsername(value);
  return `${normalized}@usuarios.agencia-ia.invalid`;
}

export function usernameFromLoginEmail(email: string): string | null {
  const suffix = "@usuarios.agencia-ia.invalid";
  return email.toLowerCase().endsWith(suffix)
    ? email.slice(0, -suffix.length)
    : null;
}

/** Keep existing email-based accounts usable while new accounts use usernames. */
export function loginIdentifier(value: string): string {
  const identifier = value.trim();
  return identifier.includes("@")
    ? identifier.toLowerCase()
    : usernameLoginEmail(identifier);
}
