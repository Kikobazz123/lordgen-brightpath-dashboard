/**
 * Intake: deterministic normalisation before any model sees the lead, and the
 * speed-to-lead clock.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

import { createLeadSchema } from "@/lib/contracts/leads"
import { firstTouchDeadline, normalizeIntake, resolveSlaState, waitMinutes } from "@/lib/pipeline/intake"
import { DEFAULT_SLA_MINUTES } from "@/lib/pipeline/rubric"

afterEach(() => vi.unstubAllEnvs())

const t = (iso: string) => new Date(`2026-09-01T${iso}:00Z`)

describe("normalizeIntake", () => {
  const input = createLeadSchema.parse({
    source: "website",
    contact: { name: "Ada Obi", email: "ada@example.com" },
    company: "Obi & Co",
    budget: "30000",
    need: "Our intake   takes\t\thours",
    extra: { referrer: "newsletter" },
    message: "Line one\r\n\r\n\r\n\r\nLine two",
  })
  const { rawContext, normalizedContext } = normalizeIntake(input)

  it("renders form fields as labelled lines the analyst can quote", () => {
    expect(rawContext).toContain("Name: Ada Obi\nEmail: ada@example.com")
    expect(rawContext).toContain("Company: Obi & Co")
    expect(rawContext).toContain("Budget: 30000")
    expect(rawContext).toContain("referrer: newsletter")
    expect(rawContext).toContain("Source: website")
  })

  it("omits fields that were not supplied", () => {
    expect(rawContext).not.toMatch(/Industry:|Interest level:|Phone:/)
  })

  it("keeps the raw context untouched and tidies only the normalised copy", () => {
    expect(rawContext).toContain("\r\n\r\n\r\n")
    expect(normalizedContext).toContain("Our intake takes hours")
    expect(normalizedContext).toContain("Line one\n\nLine two")
    expect(normalizedContext).not.toMatch(/\r|\n{3,}|[ \t]{2,}/)
  })
})

describe("SLA clock", () => {
  it("sets the first-touch deadline from the default SLA", () => {
    expect(firstTouchDeadline(t("10:00")).getTime() - t("10:00").getTime()).toBe(DEFAULT_SLA_MINUTES * 60_000)
  })

  it("honours SLA_FIRST_TOUCH_MINUTES and ignores a nonsensical value", () => {
    vi.stubEnv("SLA_FIRST_TOUCH_MINUTES", "60")
    expect(firstTouchDeadline(t("10:00"))).toEqual(t("11:00"))
    vi.stubEnv("SLA_FIRST_TOUCH_MINUTES", "-5")
    expect(firstTouchDeadline(t("10:00")).getTime() - t("10:00").getTime()).toBe(DEFAULT_SLA_MINUTES * 60_000)
  })

  it.each([
    ["pending while the clock runs", null, t("10:10"), "pending"],
    ["breached once the deadline passes untouched", null, t("10:20"), "breached"],
    ["met when a rep acts in time", t("10:14"), t("12:00"), "met"],
    ["still breached after a late response", t("10:30"), t("12:00"), "breached"],
  ] as const)("is %s", (_name, firstTouch, now, want) => {
    expect(resolveSlaState(t("10:15"), firstTouch, now)).toBe(want)
  })

  it("measures wait time to the first touch, or to now", () => {
    expect(waitMinutes(t("10:00"), t("10:07"), t("12:00"))).toBe(7)
    expect(waitMinutes(t("10:00"), null, t("10:45"))).toBe(45)
    expect(waitMinutes(t("10:00"), null, t("09:00"))).toBe(0)
  })
})
