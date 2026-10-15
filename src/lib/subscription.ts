import { getSupabase } from "./supabase";
import { formatDay } from "./dates";

export type SubscriptionStatus = {
  expires_on: string | null;
  farm_date: string;
  days_remaining: number | null;
  read_only: boolean;
};

export async function getSubscriptionStatus(): Promise<SubscriptionStatus> {
  const { data, error } = await getSupabase().rpc("subscription_status");
  if (error) throw error;
  const row = data?.[0];
  if (!row) throw new Error("SUBSCRIPTION_STATUS_MISSING");
  return row;
}

export function subscriptionMessage(status: SubscriptionStatus): string | null {
  const days = status.days_remaining;
  if (status.expires_on === null || days === null || days > 7) return null;
  if (status.read_only) return "Saalana fee ki muddat guzar gayi hai. Data dekh sakte hain, nayi entry ya tabdeeli nahi kar sakte. Farm admin se rabta karein.";
  const when = days === 0 ? "aaj aakhri din hai" : `${days} din baqi hain`;
  return `Saalana fee ki muddat mein ${when} (${formatDay(status.expires_on)}). Waqt par tajdeed ke liye farm admin se rabta karein.`;
}
