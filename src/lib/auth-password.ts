export function isPasswordSetupSession(href: string, sessionAccessToken: string | undefined): boolean {
  if (!sessionAccessToken) return false;
  try {
    const url = new URL(href);
    const hash = new URLSearchParams(url.hash.slice(1));
    const type = hash.get("type") ?? url.searchParams.get("type");
    const linkAccessToken = hash.get("access_token") ?? url.searchParams.get("access_token");
    return (type === "invite" || type === "recovery") && linkAccessToken === sessionAccessToken;
  } catch {
    return false;
  }
}

export function passwordLinkError(href: string): string | null {
  try {
    const url = new URL(href);
    const hash = new URLSearchParams(url.hash.slice(1));
    const code = hash.get("error_code") ?? url.searchParams.get("error_code");
    const error = hash.get("error") ?? url.searchParams.get("error");
    if (code === "otp_expired") return "Email ka link expire ho gaya. Farm admin se naya link mangain.";
    if (code || error) return "Email ka link kaam nahi kar raha. Farm admin se naya link mangain.";
    return null;
  } catch {
    return null;
  }
}

export function passwordSetupError(password: string, confirmation: string): string | null {
  if (password.length < 8) return "Password kam az kam 8 characters ka hona chahiye.";
  if (password !== confirmation) return "Dono passwords aik jaisay likhein.";
  return null;
}

export function passwordRecoveryRedirect(href: string): string {
  return new URL("/", href).toString();
}
