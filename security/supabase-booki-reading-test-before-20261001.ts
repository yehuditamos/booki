import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const ALLOWED_ORIGINS = new Set([
  "https://yehuditamos.github.io",
  "http://localhost:5000",
  "http://127.0.0.1:5000",
]);

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const jsonHeaders = (origin: string) => ({
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, max-age=0",
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Vary": "Origin",
});

function response(origin: string, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders(origin) });
}

function safeString(value: unknown, max = 120): string | null {
  if (typeof value !== "string") return null;
  return value.replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, max) || null;
}

function safeNumber(value: unknown, min: number, max: number): number | null {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(min, Math.min(max, number));
}

function safeArray(value: unknown, limit: number): unknown[] {
  return Array.isArray(value) ? value.slice(-limit) : [];
}

function safeSurvey(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const output: Record<string, string> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const safeKey = safeString(key, 40);
    const safeValue = safeString(item, 100);
    if (safeKey && safeValue && Object.keys(output).length < 12) output[safeKey] = safeValue;
  }
  return Object.keys(output).length ? output : null;
}

async function sha256(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  const allowed = ALLOWED_ORIGINS.has(origin);

  if (req.method === "OPTIONS") {
    if (!allowed) return new Response(null, { status: 403 });
    return new Response(null, { status: 204, headers: jsonHeaders(origin) });
  }

  if (req.method === "GET") {
    return response(allowed ? origin : "https://yehuditamos.github.io", { ok: true, service: "booki-reading-test" });
  }

  if (req.method !== "POST") return response(origin || "https://yehuditamos.github.io", { error: "method_not_allowed" }, 405);
  if (!allowed) return response("https://yehuditamos.github.io", { error: "origin_not_allowed" }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return response(origin, { error: "invalid_json" }, 400);
  }

  const action = safeString(body.action, 30);
  if (action === "start") {
    const token = `${crypto.randomUUID()}-${crypto.randomUUID()}`;
    const writeTokenHash = await sha256(token);
    const source = safeString(body.source, 64) ?? "public";
    const payload = {
      write_token_hash: writeTokenHash,
      source,
      grade: safeString(body.grade, 20),
      reading_level: safeString(body.readingLevel, 30),
      status: "started",
      device_type: safeString(body.deviceType, 30),
      browser_name: safeString(body.browserName, 50),
      user_agent: safeString(body.userAgent, 500),
      total_words: safeNumber(body.totalWords, 0, 1000) ?? 0,
    };
    const { data, error } = await supabase
      .from("booki_reading_test_sessions")
      .insert(payload)
      .select("id")
      .single();
    if (error || !data?.id) {
      console.error("booki start error", error);
      return response(origin, { error: "save_failed" }, 500);
    }
    return response(origin, { ok: true, sessionId: data.id, token });
  }

  const sessionId = body.sessionId;
  const token = safeString(body.token, 120);
  if (!isUuid(sessionId) || !token) return response(origin, { error: "invalid_session" }, 400);
  const hash = await sha256(token);
  const { data: session, error: sessionError } = await supabase
    .from("booki_reading_test_sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("write_token_hash", hash)
    .maybeSingle();
  if (sessionError || !session) return response(origin, { error: "session_not_found" }, 404);

  const update: Record<string, unknown> = { last_seen_at: new Date().toISOString() };

  if (action === "save" || action === "complete" || action === "abandon") {
    const requestedStatus = action === "complete" ? "completed" : action === "abandon" ? "abandoned" : "reading";
    update.status = requestedStatus;
    update.page_index = Math.round(safeNumber(body.pageIndex, 0, 100) ?? 0);
    update.word_index = Math.round(safeNumber(body.wordIndex, 0, 5000) ?? 0);
    update.total_words = Math.round(safeNumber(body.totalWords, 0, 5000) ?? 0);
    update.duration_ms = Math.round(safeNumber(body.durationMs, 0, 24 * 60 * 60 * 1000) ?? 0);
    update.estimated_wpm = safeNumber(body.estimatedWpm, 0, 1000);
    update.average_lag_ms = safeNumber(body.averageLagMs, 0, 60000);
    update.retries_count = Math.round(safeNumber(body.retriesCount, 0, 10000) ?? 0);
    update.help_count = Math.round(safeNumber(body.helpCount, 0, 10000) ?? 0);
    update.adult_interventions = Math.round(safeNumber(body.adultInterventions, 0, 1000) ?? 0);
    update.stuck_words = safeArray(body.stuckWords, 100);
    update.recognition_errors = safeArray(body.recognitionErrors, 50);
    update.events = safeArray(body.events, 250);
    if (action === "complete") update.completed_at = new Date().toISOString();
  } else if (action === "child_survey") {
    const survey = safeSurvey(body.survey);
    if (!survey) return response(origin, { error: "invalid_survey" }, 400);
    update.child_survey = survey;
  } else if (action === "adult_survey") {
    const survey = safeSurvey(body.survey);
    if (!survey) return response(origin, { error: "invalid_survey" }, 400);
    update.adult_survey = survey;
  } else {
    return response(origin, { error: "unknown_action" }, 400);
  }

  const { error } = await supabase
    .from("booki_reading_test_sessions")
    .update(update)
    .eq("id", sessionId)
    .eq("write_token_hash", hash);
  if (error) {
    console.error("booki update error", error);
    return response(origin, { error: "save_failed" }, 500);
  }
  return response(origin, { ok: true });
});

