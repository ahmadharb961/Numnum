# Tiny image that pings the app's scheduled-maintenance endpoint (invoices, reminders, jobs).
FROM curlimages/curl:8.10.1
CMD ["sh", "-c", "curl -fsS -H \"Authorization: Bearer $CRON_SECRET\" \"$APP_URL/api/cron\""]
