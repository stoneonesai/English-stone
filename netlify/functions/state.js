import { getStore } from "@netlify/blobs";
import { decodeAccess, passwordMatches } from "../../src/lib/access.js";
import { validateState } from "../../src/lib/validate.js";

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function readState(body) {
  if (body && typeof body === "object" && body.state && typeof body.state === "object" && !Array.isArray(body.state)) {
    return body.state;
  }
  return body;
}

export default async function handler(req) {
  const password = process.env.ACCESS_PASSWORD || "";
  if (!password) return json(503, { error: "not-configured" });
  if (!passwordMatches(password, decodeAccess(req.headers.get("x-access-word")))) {
    return json(401, { error: "unauthorized" });
  }

  const store = () => getStore({ name: "alltagsvokabeln", consistency: "strong" });

  if (req.method === "GET") {
    const stored = await store().get("progress", { type: "json", consistency: "strong" });
    if (!stored) return json(200, { state: null });
    if (Array.isArray(stored.words)) return json(200, { version: 1, vocabIds: null, state: stored });
    return json(200, {
      version: 1,
      vocabIds: stored.vocabIds ?? null,
      state: stored.state ?? null,
    });
  }

  if (req.method === "PUT") {
    const raw = await req.text();
    if (raw.length > 3_000_000) return json(413, { error: "too-large" });
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return json(400, { error: "invalid-json" });
    }
    const state = readState(body);
    if (state && Array.isArray(state.history) && state.history.length > 120) {
      state.history = state.history.slice(-120);
    }
    if (!validateState(state)) return json(400, { error: "invalid-state" });
    const vocabIds = Array.isArray(body?.vocabIds)
      ? body.vocabIds.filter((id) => typeof id === "string" && id && id.length <= 80).slice(0, 8000)
      : [];
    state.updatedAt = new Date().toISOString();
    await store().setJSON("progress", { version: 1, vocabIds, state });
    return json(200, { ok: true, updatedAt: state.updatedAt });
  }

  return json(405, { error: "method" });
}
