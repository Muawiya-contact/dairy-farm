const messages: [RegExp, string][] = [
  [/Supabase URL aur publishable key set nahi hain/i, "App ki Supabase settings missing hain. Site admin se rabta karein."],
  [/MONTH_LOCKED/i, "Yeh maheena band hai. Settings mein ja kar kholein."],
  [/RATE_MISSING/i, "Is customer ka rate set nahi. Pehle rate likhein."],
  [/FREE_CUSTOMER/i, "Muft doodh wale se wusooli nahi hoti."],
  [/BILL_OVERLAP/i, "In tareekhon ki parchi pehle se likhi hai."],
  [/NOT_COMPANY/i, "Parchi sirf company ki hoti hai."],
  [/ANIMAL_NOT_MILKING/i, "Yeh janwar doodh nahi deta."],
  [/NO_FARM_CASH/i, "Farm galla account nahi bana. Settings dekhein."],
  [/STALE/i, "Kisi aur ne yeh entry badal di hai. Reload karein."],
  [/PGRST116|result contains 0 rows/i, "Yeh entry ab nahi milti. Reload karein."],
  [/customer_rates_customer_id_effective_from_key/i, "Is tareekh ka rate pehle se hai, usay edit karein."],
  [/insem_dates_after_service/i, "Yeh tareekh tukhm-rezi se pehle nahi ho sakti."],
  [/animals_exit_ok/i, "Bechne ya marne ki tareekh likhein."],
  [/payment_needs_account/i, "Paise kahan gaye aur kaise mile, dono likhein."],
  [/animals_active_tag_uq/i, "Is tag ka janwar pehle se hai."],
  [/insem_one_open_per_animal/i, "Is janwar ki tukhm-rezi pehle se khuli hai. Pehle nateeja likhein."],
  [/project is paused|database.*paused|service unavailable/i, "Database so raha hai. Supabase dashboard mein Restore dabayein."],
  [/duplicate key|unique constraint/i, "Yeh entry pehle se hai. Purani entry edit karein."],
  [/foreign key|23503/i, "Yeh mita nahi sakte, is se juri entries hain."],
  [/failed to fetch|networkerror|network request failed|fetch failed|offline/i, "Internet nahi chal raha. Entry save nahi hui, dobara koshish karein."],
  [/jwt expired|invalid jwt|401|session.*expired/i, "Dobara login karein."],
  [/invalid login credentials|invalid credentials/i, "Email ya password ghalat hai."],
  [/rate limit|too many requests/i, "Thori der baad koshish karein."],
];

const logged = new WeakSet<object>();

export function friendlyError(error: unknown): string {
  if (error instanceof RangeError) return error.message;
  const item = error && typeof error === "object" ? error as Record<string, unknown> : null;
  const raw = [item?.code, item?.message, item?.details, item?.hint, item?.status, typeof error === "string" ? error : ""]
    .filter((part) => part != null).join(" ");
  for (const [pattern, message] of messages) if (pattern.test(raw)) return message;
  if (item && !logged.has(item)) { console.error("Unexpected farm error", error); logged.add(item); }
  return "Kuch ghalat ho gaya. Dobara koshish karein.";
}
