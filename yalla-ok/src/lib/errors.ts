const MESSAGES: Record<string, string> = {
  not_authenticated: "Please sign in first.",
  account_suspended: "Your account can’t post right now. Contact support if you think this is a mistake.",
  profile_missing: "Your profile isn’t ready yet. Please sign out and in again.",
  invalid_headline: "Headline must be 3–50 characters.",
  invalid_description: "Description must be 1–120 characters.",
  invalid_location: "Add a city or neighbourhood (2–60 characters).",
  invalid_reward: "Enter a reward above $0.",
  invalid_whatsapp: "Enter your WhatsApp number with the country code, e.g. +961 70 123 456.",
  invalid_duration: "Choose one of the deadlines shown.",
  invalid_image: "That image can’t be used. Try another one.",
  rate_limited: "You’re posting very quickly. Please wait a little and try again.",
  duplicate_task: "You already have this task listed. Check My Tasks.",
  task_not_found: "Task not found.",
  task_not_active: "This task isn’t live any more.",
  task_not_draft: "Only unpaid drafts can be discarded.",
  task_has_payments: "This draft has a payment on file and can’t be discarded.",
  payment_already_submitted: "Your payment is already being reviewed.",
  task_not_awaiting_payment: "This task isn’t waiting for a payment.",
  invalid_reference: "Enter the Whish transaction reference (at least 3 letters or digits).",
  reference_already_used: "This Whish reference was already used for another listing.",
  too_many_submissions: "Too many payment attempts for this task. Contact support.",
  forbidden: "You don’t have permission to do that.",
  submission_not_found: "Payment submission not found.",
  submission_already_reviewed: "This payment was already reviewed.",
  cannot_review_own_payment: "You can’t review your own payment. Ask another admin.",
  reason_required: "Please give a reason.",
  task_not_pending_approval: "This task isn’t waiting for approval.",
  payment_not_verified: "This paid task has no verified payment yet.",
  task_already_rejected: "This task is already rejected.",
  task_has_verified_payment: "Paid listings are kept for the records. Reject it instead.",
  cannot_change_own_account: "You can’t change your own account status.",
  user_not_found: "User not found.",
  report_not_found: "Report not found.",
  invalid_status: "Invalid status.",
  invalid_reporter: "Couldn’t send the report.",
};

/** Turns a database / auth error into something a person can act on. */
export function friendlyError(err: unknown, fallback = "Something went wrong. Please try again."): string {
  const msg =
    typeof err === "string"
      ? err
      : err && typeof err === "object" && "message" in err
        ? String((err as { message: unknown }).message)
        : "";
  if (MESSAGES[msg]) return MESSAGES[msg];
  for (const key of Object.keys(MESSAGES)) if (msg.includes(key)) return MESSAGES[key];
  if (/check constraint/i.test(msg)) return "Some values are out of range. Please check the form.";
  if (/fetch failed|network/i.test(msg)) return "Can’t reach the server. Check your connection.";
  return fallback;
}
