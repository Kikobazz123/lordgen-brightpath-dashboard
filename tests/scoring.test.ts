/**
 * The scoring rubric is a pure function: no database, no network, no API key.
 * Ported from scripts/verify-scoring.ts.
 */
import { describe, expect, it } from "vitest"

import {
  evidenceSchema,
  scoreResultSchema,
  type Evidence,
  type EvidenceItem,
  type Signal,
} from "@/lib/contracts/leads"
import { RUBRIC_VERSION, WEIGHTS } from "@/lib/pipeline/rubric"
import { scoreLead } from "@/lib/pipeline/scoring"
import { chooseDraftKind } from "@/lib/pipeline/writer"

function item(signal: Signal, value: string | null, confidence = 0.9): EvidenceItem {
  const present = value !== null
  return {
    signal,
    present,
    value,
    source_span: present ? "quoted from the lead" : null,
    confidence: present ? confidence : 0,
    note: null,
  }
}

function evidence(items: EvidenceItem[]): Evidence {
  return {
    items,
    context_notes: [],
    extracted_at: new Date("2026-08-23T10:00:00Z").toISOString(),
    model: "test-fixture",
  }
}

type Five = [string | null, string | null, string | null, string | null, string | null]
const lead = ([company, industry, need, budget, interest]: Five, confidence = 0.9) =>
  evidence([
    item("company_fit", company, confidence),
    item("industry_fit", industry, confidence),
    item("need", need, confidence),
    item("budget", budget, confidence),
    item("interest", interest, confidence),
  ])

const strongLead = lead(["50-249", "professional services", "explicit_urgent", "30000", "high"])
const weakLead = lead(["1000+", "deep sea mining", "implied", "2000", "low"])
/** A strong enquiry that never mentions money: the case rubric 1.1.0 was made for. */
const missingBudget = lead(["50-249", "accounting", "explicit", null, "high"])
/** Need is the one signal still required. */
const missingNeed = lead(["50-249", "accounting", null, "30000", "high"])
const noBudget = evidence([
  item("company_fit", "10-49"),
  item("industry_fit", "non-profit"),
  item("need", "explicit"),
  item("budget", "no_budget", 0.97),
  item("interest", "medium"),
])

const NOW = { now: new Date("2026-08-23T12:00:00Z") }

describe("rubric", () => {
  it("has weights that sum to exactly 100", () => {
    expect(Object.values(WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100)
  })
})

describe("determinism", () => {
  it("scores identical evidence identically across 200 runs", () => {
    const first = scoreLead(strongLead, NOW)
    for (let i = 0; i < 200; i++) expect(scoreLead(strongLead, NOW)).toEqual(first)
  })

  it("is independent of evidence ordering", () => {
    const reversed = evidence([...strongLead.items].reverse())
    const a = scoreLead(strongLead, NOW)
    const b = scoreLead(reversed, NOW)
    expect([b.score, b.priority]).toEqual([a.score, a.priority])
  })
})

describe("known fixtures", () => {
  it("scores the strong lead 100, HIGH, QUALIFIED", () => {
    // 20 company + 15 industry + 25 need + 20 budget + 20 interest
    expect(scoreLead(strongLead)).toMatchObject({ score: 100, priority: "HIGH", qualification_status: "QUALIFIED" })
  })

  it("scores the weak lead 26, LOW, NOT_QUALIFIED", () => {
    // 5 company + 2 industry + 10 need + 5 budget + 4 interest
    expect(scoreLead(weakLead)).toMatchObject({ score: 26, priority: "LOW", qualification_status: "NOT_QUALIFIED" })
  })

  it("traces every awarded point to a named rubric line", () => {
    const r = scoreLead(strongLead)
    expect(r.reasons).toHaveLength(5)
    expect(r.reasons.reduce((s, x) => s + x.points_awarded, 0)).toBe(r.score)
    for (const reason of r.reasons) {
      expect(reason.explanation.length).toBeGreaterThan(0)
      expect(reason.points_awarded).toBeLessThanOrEqual(reason.points_possible)
    }
  })
})

describe("missing evidence is surfaced, never guessed", () => {
  it("withholds the score (null, not zero) when a required signal is absent", () => {
    const r = scoreLead(missingNeed)
    expect(r).toMatchObject({ qualification_status: "NEEDS_REVIEW", score: null, priority: null })
    expect(r.missing_information).toContain("need")
  })

  it("still explains what it did see", () => {
    const budget = scoreLead(missingNeed).reasons.find((x) => x.signal === "budget")
    expect(budget?.points_awarded).toBeGreaterThan(0)
  })

  it("forces review on low confidence alone, even with full coverage", () => {
    const hedged = lead(["50-249", "accounting", "explicit", "30000", "high"], 0.2)
    expect(scoreLead(hedged)).toMatchObject({ qualification_status: "NEEDS_REVIEW", score: null })
  })

  it("counts an unreadable budget as missing, not as zero-and-scored", () => {
    const vague = lead(["50-249", "accounting", "explicit", "we'll see how it goes", "high"])
    const budget = scoreLead(vague).reasons.find((x) => x.signal === "budget")!
    expect(budget.points_awarded).toBe(0)
    expect(budget.explanation).toMatch(/could not be read/i)
  })
})

describe("a lead that never mentions money", () => {
  it("is still scored, and the gap is named", () => {
    const r = scoreLead(missingBudget)
    // 20 company + 15 industry + 20 need + 0 budget + 20 interest
    expect(r).toMatchObject({ qualification_status: "QUALIFIED", score: 75 })
    expect(r.missing_information).toContain("budget")
  })

  it("is capped at MEDIUM however well it scores, and says why", () => {
    const r = scoreLead(missingBudget)
    expect(r.score).toBeGreaterThanOrEqual(70)
    expect(r.priority).toBe("MEDIUM")
    expect(r.reasons.some((x) => x.signal === "budget" && /no budget figure was stated/i.test(x.explanation)))
      .toBe(true)
  })

  it("reaches HIGH once any real figure is stated", () => {
    expect(scoreLead(lead(["50-249", "accounting", "explicit", "30000", "high"])).priority).toBe("HIGH")
    // 20 + 15 + 25 + 5 + 20 = 85: the gate asks for a figure, not a large one
    expect(scoreLead(lead(["50-249", "accounting", "explicit_urgent", "3000", "high"])).priority).toBe("HIGH")
  })
})

describe("gates a weighted total cannot outvote", () => {
  it("disqualifies an explicit 'no budget' despite a decent total, and explains itself", () => {
    const r = scoreLead(noBudget)
    expect(r.score).toBeGreaterThanOrEqual(40)
    expect(r).toMatchObject({ qualification_status: "NOT_QUALIFIED", priority: "LOW" })
    expect(r.reasons.some((x) => x.explanation.startsWith("Gate:"))).toBe(true)
  })

  it("preserves the score when a gate fires", () => {
    // 20 company + 8 adjacent + 20 need + 0 budget + 12 interest
    expect(scoreLead(noBudget).score).toBe(60)
  })

  it("caps a vague need at MEDIUM however high the total", () => {
    const r = scoreLead(lead(["10-49", "construction", "implied", "15000", "high"]))
    // 20 + 15 + 10 + 16 + 20 = 81, which would otherwise be HIGH
    expect(r).toMatchObject({ score: 81, priority: "MEDIUM", qualification_status: "QUALIFIED" })
  })

  it("lets an explicit need reach HIGH", () => {
    expect(scoreLead(strongLead).priority).toBe("HIGH")
  })
})

describe("contract enforcement: fabrication is a type error", () => {
  const wrap = (items: unknown[]) => ({
    items,
    context_notes: [],
    extracted_at: new Date().toISOString(),
    model: "test",
  })

  it("rejects evidence claiming a value while marked absent", () => {
    const fabricated = { signal: "budget", present: false, value: "$50,000", source_span: null, confidence: 0.9, note: null }
    expect(evidenceSchema.safeParse(wrap([fabricated])).success).toBe(false)
  })

  it("rejects evidence claiming presence without a source span", () => {
    const unsourced = { signal: "need", present: true, value: "explicit", source_span: null, confidence: 0.9, note: null }
    expect(evidenceSchema.safeParse(wrap([unsourced])).success).toBe(false)
  })

  it("rejects a QUALIFIED result with a null score", () => {
    const inconsistent = {
      rubric_version: RUBRIC_VERSION,
      score: null,
      priority: null,
      qualification_status: "QUALIFIED",
      confidence: 0.9,
      reasons: [],
      missing_information: [],
      scored_at: new Date().toISOString(),
    }
    expect(scoreResultSchema.safeParse(inconsistent).success).toBe(false)
  })

  it.each([
    ["strong", strongLead],
    ["weak", weakLead],
    ["missing budget", missingBudget],
    ["missing need", missingNeed],
  ])("real scoring output satisfies the contract (%s)", (_name, fixture) => {
    expect(scoreResultSchema.safeParse(scoreLead(fixture)).success).toBe(true)
  })
})

describe("chooseDraftKind: which message an enquiry earns", () => {
  it.each([
    ["a lead with a stated problem", strongLead],
    ["a lead with no stated budget", missingBudget],
    ["a weak but real enquiry", weakLead],
  ])("sends a sales follow-up to %s", (_name, fixture) => {
    expect(chooseDraftKind(fixture, scoreLead(fixture))).toBe("follow_up")
  })

  it("asks an unscorable lead for clarification", () => {
    expect(chooseDraftKind(missingNeed, scoreLead(missingNeed))).toBe("clarification")
  })

  it("asks for clarification when no problem is described, even if it scores", () => {
    const noProblem = lead(["50-249", "accounting", "none", "30000", "high"])
    const assessment = scoreLead(noProblem)
    expect(assessment.score).not.toBeNull()
    expect(chooseDraftKind(noProblem, assessment)).toBe("clarification")
  })

  it("does not pitch an off-topic enquiry", () => {
    const offTopic = lead([null, "deep sea mining", "none", null, "low"])
    expect(chooseDraftKind(offTopic, scoreLead(offTopic))).toBe("clarification")
  })
})
