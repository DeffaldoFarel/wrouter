/**
 * Authenticated fetch wrapper that handles 401 globally.
 *
 * On 401 response, redirects user to /login (session expired).
 * Use this for all dashboard API calls instead of raw fetch().
 */

let isRedirecting = false;

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);

  // Handle 401 Unauthorized — session expired or invalid
  if (res.status === 401 && typeof window !== "undefined" && !isRedirecting) {
    // Don't redirect from /login or /api/auth routes
    const path = window.location.pathname;
    if (!path.startsWith("/login") && !path.startsWith("/api/auth")) {
      isRedirecting = true;
      // Use replace so user can't hit "back" to a 401 page
      window.location.replace("/login");
    }
  }

  return res;
}
