/**
 * Does the failover chain actually walk? Every provider is configured without a
 * key, so each one throws on the way in, which is exactly the condition that
 * makes the chain observable. Ported from scripts/verify-failover.ts.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import { configuredFallbacks, generateStructured, registerStub } from "@/lib/ai/provider"

const SYSTEM = "failover-probe"
const REQ = { system: SYSTEM, user: "irrelevant", schema: { type: "object" } as Record<string, unknown> }

beforeAll(() => registerStub(SYSTEM, () => ({ probe: true })))

/** Configure the chain for one case. Keys are left unset on purpose. */
function configure(primary: string, fallbacks: string) {
  vi.stubEnv("AI_PROVIDER", primary)
  vi.stubEnv("AI_FALLBACK_PROVIDER", fallbacks)
  for (const k of ["GEMINI_API_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY", "ANTHROPIC_API_KEY"]) {
    vi.stubEnv(k, "")
  }
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("configuredFallbacks", () => {
  it.each([
    ["a comma-separated list becomes an ordered chain", "groq,openrouter", ["groq", "openrouter"]],
    ["a single value still works", "groq", ["groq"]],
    ["whitespace and empty entries are tolerated", " groq , , openrouter ", ["groq", "openrouter"]],
    ["an unknown name is skipped, not treated as stub", "grok,groq", ["groq"]],
    ["the primary is dropped from its own fallback list", "gemini,groq", ["groq"]],
    ["duplicates collapse", "groq,groq,openrouter", ["groq", "openrouter"]],
    ["stub is not accepted as a fallback", "stub,groq", ["groq"]],
  ])("%s", (_name, fallbacks, expected) => {
    configure("gemini", fallbacks)
    expect(configuredFallbacks()).toEqual(expected)
  })
})

describe("generateStructured walks the chain", () => {
  it("tries every provider before using the stub", async () => {
    configure("gemini", "groq,openrouter")
    const result = await generateStructured(REQ)
    expect(result.provider).toBe("stub")
    for (const who of ["gemini", "groq", "openrouter"]) {
      expect(result.degradedReason ?? "").toContain(who)
    }
  })

  it("advances past a non-retryable failure (a dead model must not stop the chain)", async () => {
    // A missing key raises a non-retryable ProviderError, exactly like the 404
    // from a retired model name. The old code only failed over on retryable errors.
    configure("gemini", "groq")
    const result = await generateStructured(REQ)
    expect(result.degradedReason ?? "").toContain("groq")
  })

  it("says so when no fallback is configured, rather than looking protected", async () => {
    configure("gemini", "")
    expect((await generateStructured(REQ)).degradedReason ?? "").toMatch(/no AI_FALLBACK_PROVIDER configured/)
  })

  it("does not claim to be unprotected when a chain is configured", async () => {
    configure("gemini", "groq")
    expect((await generateStructured(REQ)).degradedReason ?? "").not.toMatch(/no AI_FALLBACK_PROVIDER configured/)
  })

  it("names how far the chain got in the stub label", async () => {
    configure("gemini", "groq,openrouter")
    expect((await generateStructured(REQ)).model).toMatch(/all 3 providers/)
  })

  it("returns the registered stub output", async () => {
    configure("stub", "")
    const result = await generateStructured(REQ)
    expect(result.provider).toBe("stub")
    expect(result.json).toEqual({ probe: true })
  })

  it("never reaches the network when no key is set", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    configure("gemini", "groq,openrouter")
    await generateStructured(REQ)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
