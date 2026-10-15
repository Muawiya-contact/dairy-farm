export function isPasswordSetupLink(href: string): boolean {
  try {
    const url = new URL(href);
    const hash = new URLSearchParams(url.hash.slice(1));
    const type = hash.get("type") ?? url.searchParams.get("type");
    return type === "invite" || type === "recovery";
  } catch {
    return false;
  }
}

export function passwordSetupError(password: string, confirmation: string): string | null {
  if (password.length < 8) return "Password kam az kam 8 characters ka hona chahiye.";
  if (password !== confirmation) return "Dono passwords aik jaisay likhein.";
  return null;
}
