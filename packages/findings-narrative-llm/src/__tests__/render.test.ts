import { describe, it, expect } from "vitest";
import { renderText, renderMarkdown } from "../render.js";
import type { NarrativeSlots } from "../template.js";

const slots: NarrativeSlots = {
  headline_sentence: "Run summary.",
  severity_breakdown_bullets: ["A", "B"],
  top_cluster_root_cause: "Cause.",
  recommended_next_actions: [
    { owner: "Y", action: "Do Y.", priority: 2 },
    { owner: "X", action: "Do X.", priority: 1 },
    { owner: "Z", action: "Do Z." },
  ],
};

describe("renderText", () => {
  it("includes the headline, breakdown, root cause and actions", () => {
    const t = renderText(slots);
    expect(t).toContain("Run summary.");
    expect(t).toContain("- A");
    expect(t).toContain("- B");
    expect(t).toContain("Cause.");
    expect(t).toContain("[X]");
    expect(t).toContain("[Z]");
  });

  it("sorts actions by priority ascending; unprioritised last", () => {
    const t = renderText(slots);
    const idxX = t.indexOf("Do X.");
    const idxY = t.indexOf("Do Y.");
    const idxZ = t.indexOf("Do Z.");
    expect(idxX).toBeLessThan(idxY);
    expect(idxY).toBeLessThan(idxZ);
  });

  it("renders priority markers when present", () => {
    expect(renderText(slots)).toContain("(P1)");
    expect(renderText(slots)).toContain("(P2)");
  });
});

describe("renderMarkdown", () => {
  it("uses markdown headings + bold owner", () => {
    const md = renderMarkdown(slots);
    expect(md).toContain("# Findings narrative");
    expect(md).toContain("## Severity breakdown");
    expect(md).toContain("**X**");
  });

  it("is deterministic for the same input", () => {
    expect(renderMarkdown(slots)).toBe(renderMarkdown(slots));
  });
});
