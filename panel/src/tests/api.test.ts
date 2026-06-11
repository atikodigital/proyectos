import { test, expect, vi } from "vitest";
import { listContent, createContent, scheduleContent } from "../api";

test("listContent fetches and returns items", async () => {
  const items = [{ id: "1", status: "draft" }];
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, items }) }) as any;
  const r = await listContent({ clientId: "atiko" });
  expect(r).toEqual(items);
  expect((global.fetch as any).mock.calls[0][0]).toContain("/api/content?clientId=atiko");
});

test("createContent posts the body", async () => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, item: { id: "9" } }) }) as any;
  const r = await createContent({ clientId: "a", format: "reel", network: "instagram", mediaUrl: "/x.mp4", caption: "c", hashtags: [] });
  expect(r.id).toBe("9");
  const call = (global.fetch as any).mock.calls[0];
  expect(call[1].method).toBe("POST");
});

test("scheduleContent posts scheduledAt", async () => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, item: { id: "9", status: "scheduled" } }) }) as any;
  const r = await scheduleContent("9", "2026-06-12T18:00:00Z");
  expect(r.status).toBe("scheduled");
  expect((global.fetch as any).mock.calls[0][0]).toContain("/api/content/9/schedule");
});
