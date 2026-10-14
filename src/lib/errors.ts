const messages: [RegExp, string][] = [
  [/Supabase URL aur publishable key set nahi hain/i, "App ki Supabase settings missing hain. Site admin se rabta karein."],
  [/MONTH_LOCKED/i, "Yeh maheena band hai. Settings mein ja kar kholein."],
  [/EXPENSE_BEFORE_ACCOUNT/i, "Account khulne ke baad ki tareekh chunein."],
  [/ACCOUNT_INACTIVE/i, "Active account chunein."],
  [/CATEGORY_INACTIVE/i, "Active kharcha category chunein."],
  [/SALARY_OVERPAID/i, "Baqi tankhwah se zyada raqam hai. Page dobara load karein."],
  [/SALARY_BELOW_PAID/i, "Tay shuda tankhwah ada shuda raqam se kam nahi ho sakti."],
  [/SALARY_PERIOD_PAID/i, "Adaigi ke baad tay shuda tankhwah nahi badal sakte. Correction ke liye alag record chahiye."],
  [/SALARY_FUTURE_MONTH|SALARY_ADVANCE_NOT_ENABLED/i, "Aane wale mahine ki tankhwah abhi ada nahi kar sakte."],
  [/SALARY_LINK_REQUIRED|SALARY_STAFF_MISMATCH|SALARY_CATEGORY_REQUIRED/i, "Mulazim aur tankhwah ka maheena dobara chunein."],
  [/SALARY_PERIOD_STALE|STAFF_STALE/i, "Mulazim ya tankhwah ka record badal chuka hai. Page dobara load karein."],
  [/salary_periods_staff_id_salary_month_key/i, "Is mulazim ki is mahine ki tankhwah pehle se tay hai."],
  [/FUTURE_DATE/i, "Aaj se aage ki tareekh nahi ho sakti."],
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
  [/insem_dry_after_service/i, "Khushk hone ki tareekh tukhm-rezi se pehle nahi ho sakti."],
  [/BREEDING_NOT_OPEN/i, "Yeh nasl kashi band ho chuki hai. Page dobara kholein."],
  [/CALVING_BEFORE_SERVICE/i, "Bachay ki paidaish tukhm-rezi se pehle nahi ho sakti."],
  [/ANIMAL_NOT_ACTIVE/i, "Yeh janwar ab active nahi hai."],
  [/BREEDING_STALE/i, "Nasl kashi ka record badal chuka hai. Form dobara kholein."],
  [/BREEDING_REQUIRES_FEMALE/i, "Nasl kashi aur paidaish sirf mada janwar ke liye darj hoti hain."],
  [/BREEDING_FUTURE_DATE|CALVING_FUTURE_DATE/i, "Asal entry ki tareekh aaj se aage nahi ho sakti."],
  [/BREEDING_OUTSIDE_LIFETIME/i, "Tareekh janwar ki paidaish aur ikhtitam ke darmiyan honi chahiye."],
  [/CALVING_INSEMINATION_MISMATCH/i, "Yeh paidaish is janwar ki tukhm rezi se mail nahi khati."],
  [/animals_exit_ok/i, "Bechne ya marne ki tareekh likhein."],
  [/EXIT_BEFORE_ACTIVITY/i, "Is tareekh ke baad janwar ki entry mojood hai. Baad ki tareekh chunein."],
  [/ANIMAL_HISTORY_SEX/i, "Is janwar ka doodh ya breeding record hai. Jins male nahi kar sakte."],
  [/ANIMAL_BIRTH_AFTER_ACTIVITY/i, "Paidaish ki tareekh purani entries se baad ki hai."],
  [/ANIMAL_STALE/i, "Janwar ka record badal chuka hai. Form dobara kholein."],
  [/Invalid animal exit/i, "Janwar ke ikhtitam ki tareekh, raqam aur account dobara check karein."],
  [/Active animal not found or exit date precedes birth/i, "Janwar active nahi ya tareekh paidaish se pehle hai."],
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
