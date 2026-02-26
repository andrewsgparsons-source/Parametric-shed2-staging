// FILE: docs/src/ui/lead-notify.js
// Notifies Andrew via Telegram when a new lead comes in.
// Called after successful Firebase write from quote-form.js

var TELEGRAM_NOTIFY_URL = null; // Set via integration if needed

/**
 * Send a lead notification.
 * Uses a lightweight webhook approach — the Clawdbot cron job monitors Firebase directly.
 * This module is a placeholder for any client-side post-submit actions.
 */
export function notifyNewLead(leadData) {
  console.log('[lead-notify] New lead submitted:', leadData.refNumber);
  // Client-side notification is handled by Clawdbot monitoring Firebase /leads
  // No additional client-side action needed
}
