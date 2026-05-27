import { describe, it, expect } from "vitest";
import {
  DeterministicHashEmbedding,
  EmbeddingIndex,
  OnnxEmbedding,
  cosine,
  selectEmbeddingBackendFromEnv,
} from "../embedding.js";

describe("DeterministicHashEmbedding", () => {
  it("returns a vector of the configured dimension", async () => {
    const e = new DeterministicHashEmbedding(128);
    const v = await e.embed("hello");
    expect(v).toHaveLength(128);
  });

  it("produces the same vector for the same input", async () => {
    const e = new DeterministicHashEmbedding();
    const a = await e.embed("Student.lastName");
    const b = await e.embed("Student.lastName");
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("L2-normalises the vector (or yields zero)", async () => {
    const e = new DeterministicHashEmbedding();
    const v = await e.embed("Student.lastName");
    let sumSq = 0;
    for (const x of v) sumSq += x * x;
    // Allow zero (empty input) but otherwise should be ~1.
    if (sumSq > 0) {
      expect(Math.sqrt(sumSq)).toBeCloseTo(1, 5);
    }
  });

  it("rejects out-of-range dimensions", () => {
    expect(() => new DeterministicHashEmbedding(8)).toThrow();
    expect(() => new DeterministicHashEmbedding(5000)).toThrow();
  });
});

describe("cosine similarity", () => {
  it("returns 1 for identical vectors", () => {
    const v = new Float32Array([0.5, 0.5, 0.5, 0.5]);
    expect(cosine(v, v)).toBeCloseTo(1);
  });

  it("returns 0 for orthogonal vectors", () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([0, 1]);
    expect(cosine(a, b)).toBeCloseTo(0);
  });

  it("returns 0 when either vector is all zeros", () => {
    const a = new Float32Array([0, 0]);
    const b = new Float32Array([1, 1]);
    expect(cosine(a, b)).toBe(0);
  });
});

describe("EmbeddingIndex", () => {
  it("finds the nearest neighbour for a known item", async () => {
    const idx = new EmbeddingIndex(new DeterministicHashEmbedding());
    await idx.addAll([
      { id: "Student.lastName", text: "Student lastName surname family name" },
      { id: "Student.firstName", text: "Student firstName given name forename" },
      { id: "Student.husid", text: "HESA Unique Student Identifier" },
    ]);
    const hits = await idx.nearest("surname", 2);
    expect(hits[0]?.id).toBe("Student.lastName");
    expect(hits[0]?.score).toBeGreaterThan(0);
  });

  it("reports the index size", async () => {
    const idx = new EmbeddingIndex(new DeterministicHashEmbedding());
    await idx.add("a", "x");
    await idx.add("b", "y");
    expect(idx.size()).toBe(2);
  });
});

describe("OnnxEmbedding", () => {
  it("falls back to the deterministic hash backend when the model is missing", async () => {
    const e = new OnnxEmbedding({ modelPath: "/does/not/exist.onnx" });
    const v = await e.embed("hello");
    expect(v).toHaveLength(384);
  });
});

describe("selectEmbeddingBackendFromEnv", () => {
  it("returns the deterministic variant when no env var is set", () => {
    const b = selectEmbeddingBackendFromEnv({});
    expect(b.id).toBe("deterministic-hash");
  });

  it("returns the ONNX variant when DATABRIDGE_EMBEDDINGS_ONNX_PATH is set", () => {
    const b = selectEmbeddingBackendFromEnv({ DATABRIDGE_EMBEDDINGS_ONNX_PATH: "/x.onnx" });
    expect(b.id).toBe("onnx");
  });
});
