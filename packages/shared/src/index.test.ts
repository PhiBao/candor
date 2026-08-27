import { describe, it, expect } from "vitest";
import { bucketForSalary, BUCKETS, K_ANONYMITY, emptyHistogram, histogramPercentile } from "./index.js";

describe("buckets", () => {
  it("maps salary to bucket", () => {
    expect(bucketForSalary(0)).toBe(0);
    expect(bucketForSalary(160_000)).toBe(5);
    expect(bucketForSalary(500_000)).toBe(9);
  });
  it("percentile hidden below k", () => {
    const h = emptyHistogram();
    h[5] = 4;
    expect(histogramPercentile(h, 5)).toBeNull();
    h[5] = 5;
    expect(histogramPercentile(h, 5)).not.toBeNull();
  });
});
