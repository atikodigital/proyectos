import { test, expect } from "vitest";
import { STATUS_META, statusMeta } from "../lib/status";

test("every status has color and label", () => {
  for (const s of ["draft", "approved", "scheduled", "publishing", "published", "failed"] as const) {
    expect(STATUS_META[s].label.length).toBeGreaterThan(0);
    expect(STATUS_META[s].dot).toMatch(/^#/);
  }
});

test("statusMeta falls back for unknown", () => {
  expect(statusMeta("???").label).toBe("Desconocido");
});
