export type Status = "draft" | "approved" | "scheduled" | "publishing" | "published" | "failed";

export interface ContentItem {
  id: string;
  clientId: string;
  format: string;
  network: string;
  mediaUrl: string | null;
  caption: string | null;
  hashtags: string[];
  status: Status;
  scheduledAt: string | null;
  publishedAt: string | null;
  error: string | null;
  createdAt: string;
}

const BASE = ""; // mismo origen (servido en /panel por el agente)

async function jsonFetch(url: string, init?: RequestInit) {
  const res = await fetch(BASE + url, init);
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || "HTTP " + res.status);
  return data;
}

function postJson(url: string, body?: unknown) {
  return jsonFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function listContent(q: { clientId?: string; status?: string } = {}): Promise<ContentItem[]> {
  const params = new URLSearchParams();
  if (q.clientId) params.set("clientId", q.clientId);
  if (q.status) params.set("status", q.status);
  const qs = params.toString();
  const data = await jsonFetch("/api/content" + (qs ? "?" + qs : ""));
  return data.items;
}

export async function createContent(item: Partial<ContentItem>): Promise<ContentItem> {
  return (await postJson("/api/content", item)).item;
}

export async function approveContent(id: string): Promise<ContentItem> {
  return (await postJson("/api/content/" + id + "/approve")).item;
}

export async function scheduleContent(id: string, scheduledAt: string): Promise<ContentItem> {
  return (await postJson("/api/content/" + id + "/schedule", { scheduledAt })).item;
}

export async function generateReel(
  topic: string,
  opts: { style?: string } = {}
): Promise<{ publicUrl: string; caption: string; hashtags: string[] }> {
  return await postJson("/api/reels/generate", { topic, ...opts });
}

export async function generatePost(
  topic: string,
  format: string
): Promise<{ imageUrls: string[]; caption: string; hashtags: string[] }> {
  return await postJson("/api/posts/generate", { topic, format });
}
