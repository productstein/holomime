export function isAdminUser(email: string | null | undefined): boolean {
  const admins = new Set(
    (import.meta.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e: string) => e.trim())
      .filter(Boolean),
  );
  return !!email && admins.has(email);
}
