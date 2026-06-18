import { redirect } from "next/navigation";

/**
 * Legacy redirect from /dashboard/logs to /dashboard/usage.
 * The page was renamed in v1.3.0 to better reflect its purpose
 * (showing usage analytics, not just request logs).
 */
export default function LogsRedirect() {
  redirect("/dashboard/usage");
}
