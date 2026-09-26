export function ambientePermiteResetDeTeste(
  appUrl: string | null | undefined,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  if (nodeEnv === "development" || nodeEnv === "test") return true;

  const bruto = appUrl?.trim();
  if (!bruto) return false;

  try {
    const host = new URL(bruto).hostname.toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.startsWith("dev-") ||
      host.startsWith("dev.")
    );
  } catch {
    return false;
  }
}
