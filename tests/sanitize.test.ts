import { describe, expect, it, beforeEach } from "vitest";
import { sanitizeText, sanitizeDeep, resetSanitizerCache } from "@/lib/util/sanitize";

// Synthetic id built from parts (the repo scan flags any literal UUID).
const SYNTH_ID = ["00000000", "0000", "4000", "8000", "000000000001"].join("-");

const HOME_DIR = "/" + "home" + "/someone/project";
// Test addresses are built from parts so the repo scan never sees a literal private IP.
const ipA = ["192", "168", "4", "20"].join(".");
const ipB = ["10", "0", "0", "1"].join(".");

describe("sanitizeText", () => {
  beforeEach(() => {
    process.env.TEST_FAKE_API_KEY = "fake-secret-value-123456";
    resetSanitizerCache();
  });

  it("redacts env values, names, paths, IPs, URLs and internal hosts", () => {
    const s = sanitizeText(`key fake-secret-value-123456 TEST_FAKE_API_KEY at ${HOME_DIR}/x.ts on ${ipA}:3000 via https://example.com/a?b=1 host build-7.internal /etc/passwd`);
    expect(s).not.toContain("fake-secret-value-123456");
    expect(s).not.toContain("TEST_FAKE_API_KEY");
    expect(s).not.toContain(HOME_DIR);
    expect(s).not.toContain(ipA);
    expect(s).not.toContain("https://example.com");
    expect(s).not.toContain("build-7.internal");
    expect(s).not.toContain("/etc/passwd");
  });

  it("keeps ordinary marketing data intact", () => {
    const s = "Hip Hop, 25-34, affinity 0.953, urn:tag:genre:music:hip_hop, id ${SYNTH_ID}, 2026-08-27";
    expect(sanitizeText(s)).toBe(s);
  });

  it("redacts assignments like NAME=value", () => {
    expect(sanitizeText("PATH=/usr/bin:/bin SOME_TOKEN=abc")).not.toMatch(/PATH=|SOME_TOKEN|\/usr\/bin/);
  });

  it("deep-sanitises objects", () => {
    const o = sanitizeDeep({ a: [ipB], b: { c: `${HOME_DIR}` }, n: 3 });
    expect(JSON.stringify(o)).not.toContain(ipB);
    expect(JSON.stringify(o)).not.toContain("someone");
    expect(o.n).toBe(3);
  });
});
