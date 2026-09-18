import { describe, expect, it } from "vitest"
import {
  commentWire,
  emptyDraft,
  nextEpisodeNum,
  normaliseCategory,
  normaliseHashtag,
  normaliseMention,
  normaliseTags,
  parseLocalDateTime,
  publishAction,
  publishButtonLabel,
  publishChecklist,
  publishSummary,
  runeLength,
  SCHEDULE_MAX_MS,
  SCHEDULE_MIN_MS,
  TAGS_MAX,
  TITLE_MAX,
  toCreateRequest,
  validateDraft,
  type VideoDraft,
} from "./fields"

function draft(overrides: Partial<VideoDraft> = {}): VideoDraft {
  return {
    ...emptyDraft(),
    title: "A perfectly ordinary title",
    category: "education",
    madeForKids: false,
    ...overrides,
  }
}

const NOW = Date.UTC(2026, 8, 10, 12, 0, 0)

/** A `datetime-local` string this many ms after NOW, in the runner's own zone. */
function localAfter(ms: number): string {
  const d = new Date(NOW + ms)
  const two = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}T${two(d.getHours())}:${two(d.getMinutes())}`
}

describe("runeLength", () => {
  // The server counts code points; `.length` counts UTF-16 units, so every
  // emoji would count twice and the form would refuse a title the server takes.
  it("counts code points, not UTF-16 units", () => {
    expect(runeLength("hello")).toBe(5)
    expect("🎬".length).toBe(2)
    expect(runeLength("🎬")).toBe(1)
    expect(runeLength("🎬🎬🎬")).toBe(3)
  })
})

describe("validateDraft — the required fields", () => {
  it("passes a complete draft", () => {
    expect(validateDraft(draft(), NOW)).toEqual([])
  })

  it("demands a title", () => {
    const issues = validateDraft(draft({ title: "   " }), NOW)
    expect(issues.map((i) => i.field)).toContain("title")
    expect(issues.find((i) => i.field === "title")?.step).toBe("details")
  })

  it("enforces the 100-rune title limit in runes", () => {
    expect(validateDraft(draft({ title: "x".repeat(TITLE_MAX) }), NOW)).toEqual([])
    expect(validateDraft(draft({ title: "x".repeat(TITLE_MAX + 1) }), NOW)).toHaveLength(1)
    // 100 emoji is 200 UTF-16 units and 100 code points. The server takes it.
    expect(validateDraft(draft({ title: "🎬".repeat(TITLE_MAX) }), NOW)).toEqual([])
    expect(validateDraft(draft({ title: "🎬".repeat(TITLE_MAX + 1) }), NOW)).toHaveLength(1)
  })

  // The phone's post button says "Unavailable: choose a category first."
  it("demands a category", () => {
    const issues = validateDraft(draft({ category: "" }), NOW)
    expect(issues.map((i) => i.field)).toEqual(["category"])
  })

  // No default, on purpose: a false here would be a legal declaration a form
  // made on somebody's behalf.
  it("demands the made-for-kids answer, and accepts either answer", () => {
    const issues = validateDraft(draft({ madeForKids: null }), NOW)
    expect(issues.map((i) => i.field)).toEqual(["madeForKids"])
    expect(issues[0].step).toBe("settings")
    expect(validateDraft(draft({ madeForKids: true }), NOW)).toEqual([])
    expect(validateDraft(draft({ madeForKids: false }), NOW)).toEqual([])
  })
})

describe("validateDraft — tags", () => {
  it("allows the limit and refuses one more", () => {
    const at = Array.from({ length: TAGS_MAX }, (_, i) => `t${i}`)
    expect(validateDraft(draft({ tags: at }), NOW)).toEqual([])
    expect(validateDraft(draft({ tags: [...at, "one-too-many"] }), NOW)).toHaveLength(1)
  })

  it("refuses a tag longer than 50", () => {
    expect(validateDraft(draft({ tags: ["x".repeat(50)] }), NOW)).toEqual([])
    expect(validateDraft(draft({ tags: ["x".repeat(51)] }), NOW)).toHaveLength(1)
  })
})

describe("validateDraft — scheduling", () => {
  it("ignores the schedule entirely in `now` mode", () => {
    expect(validateDraft(draft({ scheduleMode: "now", scheduleAt: "nonsense" }), NOW)).toEqual([])
  })

  it("accepts a time inside the window", () => {
    expect(
      validateDraft(draft({ scheduleMode: "at", scheduleAt: localAfter(60 * 60 * 1000) }), NOW)
    ).toEqual([])
  })

  // The phone's exact refusals.
  it("refuses a time under five minutes away", () => {
    const issues = validateDraft(
      draft({ scheduleMode: "at", scheduleAt: localAfter(SCHEDULE_MIN_MS - 120_000) }),
      NOW
    )
    expect(issues[0].message).toBe("Pick a time at least 5 minutes from now.")
  })

  it("refuses a time over thirty days away", () => {
    const issues = validateDraft(
      draft({ scheduleMode: "at", scheduleAt: localAfter(SCHEDULE_MAX_MS + 86_400_000) }),
      NOW
    )
    expect(issues[0].message).toBe("Pick a time within the next 30 days.")
  })

  it("refuses an unparseable time", () => {
    const issues = validateDraft(draft({ scheduleMode: "at", scheduleAt: "" }), NOW)
    expect(issues.map((i) => i.field)).toEqual(["scheduleAt"])
  })
})

describe("validateDraft — reporting", () => {
  // One problem per attempt makes somebody walk the form three times.
  it("reports every problem at once", () => {
    const issues = validateDraft(
      draft({ title: "", category: "", madeForKids: null, tags: ["x".repeat(60)] }),
      NOW
    )
    expect(issues.map((i) => i.field).sort()).toEqual(["category", "madeForKids", "tags", "title"])
  })
})

describe("parseLocalDateTime", () => {
  it("reads a datetime-local value in local time", () => {
    const at = parseLocalDateTime("2026-09-10T18:30")
    expect(at).not.toBeNull()
    const back = new Date(at as number)
    expect(back.getHours()).toBe(18)
    expect(back.getMinutes()).toBe(30)
  })

  // A half-typed value must be null, not a time twelve hours off — otherwise
  // the form refuses a time that plainly is more than five minutes away.
  it("is null for a partial or malformed value", () => {
    expect(parseLocalDateTime("")).toBeNull()
    expect(parseLocalDateTime("2026-09-10")).toBeNull()
    expect(parseLocalDateTime("tomorrow")).toBeNull()
  })
})

describe("publishAction", () => {
  // `POST /v1/videos/{id}/publish` is `UPDATE posts SET visibility='public'`.
  // Running it over a private video is the worst thing this studio could do.
  it("only publishes for public + now", () => {
    expect(publishAction(draft({ visibility: "public", scheduleMode: "now" }))).toBe("publish")
  })

  it("creates only, for every other audience", () => {
    for (const visibility of ["unlisted", "followers", "private"] as const) {
      expect(publishAction(draft({ visibility, scheduleMode: "now" }))).toBe("create")
    }
  })

  it("never publishes a scheduled video, whatever its audience", () => {
    for (const visibility of ["public", "unlisted", "followers", "private"] as const) {
      expect(publishAction(draft({ visibility, scheduleMode: "at" }))).toBe("schedule")
    }
  })

  it("labels the button the phone's way", () => {
    expect(publishButtonLabel(draft({ scheduleMode: "now" }))).toBe("Post")
    expect(publishButtonLabel(draft({ scheduleMode: "at" }))).toBe("Schedule")
  })

  it("says out loud that a non-public video will not be made public", () => {
    expect(publishSummary(draft({ visibility: "private", scheduleMode: "now" }))).toMatch(
      /will not be made public/i
    )
  })
})

describe("normaliseTags", () => {
  it("strips a leading hash, because that is what people type", () => {
    expect(normaliseTags(["#howto", "##deep"])).toEqual(["howto", "deep"])
  })

  it("trims, drops blanks and de-duplicates case-insensitively", () => {
    expect(normaliseTags(["  a  ", "A", "", "   ", "#a", "b"])).toEqual(["a", "b"])
  })
})

describe("toCreateRequest — the field mapping", () => {
  it("sends the three required fields", () => {
    const body = toCreateRequest(draft(), "media-1")
    expect(body.content_type).toBe("long_video")
    expect(body.visibility).toBe("public")
    expect(body.title).toBe("A perfectly ordinary title")
    expect(body.media_ids).toEqual(["media-1"])
  })

  // `paid_promotion`, NOT `is_paid_promotion` — the wrong spelling returns
  // 201 and the disclosure is simply not there.
  it("uses the exact compliance column names", () => {
    const body = toCreateRequest(draft({ madeForKids: true, paidPromotion: true }), "m")
    expect(body).toHaveProperty("paid_promotion", true)
    expect(body).not.toHaveProperty("is_paid_promotion")
    expect(body).toHaveProperty("is_made_for_kids", true)
    expect(body).not.toHaveProperty("made_for_kids")
    expect(body).toHaveProperty("altered_content", false)
    expect(body).toHaveProperty("license", "standard")
  })

  it("never invents a made-for-kids answer that was not given", () => {
    // The form refuses to submit an unanswered draft, but if it ever did the
    // wire value must be the safe one rather than `undefined`.
    expect(toCreateRequest(draft({ madeForKids: null }), "m").is_made_for_kids).toBe(false)
  })

  // One question on screen, three columns on the wire.
  it("inverts the two switches the server stores negatively", () => {
    const on = toCreateRequest(draft({ commentsMode: "on", allowLikes: true }), "m")
    expect(on.no_comments).toBe(false)
    expect(on.no_likes).toBe(false)

    const off = toCreateRequest(draft({ commentsMode: "off", allowLikes: false }), "m")
    expect(off.no_comments).toBe(true)
    expect(off.no_likes).toBe(true)
  })

  // An omitted switch means "unspecified", not "off" — the phone's note.
  it("always sends the interaction switches, even at their defaults", () => {
    const body = toCreateRequest(emptyDraft(), "m")
    for (const key of [
      "no_comments",
      "no_likes",
      "hide_share",
      "allow_download",
      "allow_embedding",
      "publish_to_feed",
      "remix_setting",
      "comment_moderation",
      "comment_access",
    ]) {
      expect(body).toHaveProperty(key)
    }
  })

  // `"category": ""` is a category whose name is the empty string.
  it("omits empty optionals rather than sending blanks", () => {
    const body = toCreateRequest(
      draft({ seoTitle: "  ", description: "  ", recordingLocation: "  ", recordingDate: "" }),
      "m"
    )
    expect(body).not.toHaveProperty("seo_title")
    expect(body).not.toHaveProperty("text")
    expect(body).not.toHaveProperty("recording_location")
    expect(body).not.toHaveProperty("recording_date")
    expect(body).not.toHaveProperty("cover_media_id")
    expect(body).not.toHaveProperty("publish_at")
    expect(body).not.toHaveProperty("tags")
  })

  it("sends the optionals that were filled in", () => {
    const body = toCreateRequest(
      draft({
        seoTitle: "How to sharpen a chisel",
        description: "Body text",
        tags: ["#woodwork", "woodwork", "tools"],
        recordingDate: "2026-09-01",
        recordingLocation: "Hyderabad, India",
      }),
      "m",
      "cover-1"
    )
    expect(body.seo_title).toBe("How to sharpen a chisel")
    expect(body.text).toBe("Body text")
    expect(body.tags).toEqual(["woodwork", "tools"])
    expect(body.recording_date).toBe("2026-09-01")
    expect(body.recording_location).toBe("Hyderabad, India")
    expect(body.cover_media_id).toBe("cover-1")
  })

  it("trims the title, because the server counts what it is sent", () => {
    expect(toCreateRequest(draft({ title: "  spaced  " }), "m").title).toBe("spaced")
  })

  it("emits publish_at as RFC3339 truncated to the second", () => {
    const body = toCreateRequest(
      draft({ scheduleMode: "at", scheduleAt: "2026-09-20T18:30" }),
      "m"
    )
    expect(body.publish_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/)
    const back = new Date(body.publish_at as string)
    expect(back.getHours()).toBe(18)
    expect(back.getMinutes()).toBe(30)
    expect(back.getSeconds()).toBe(0)
  })

  it("does not emit publish_at in `now` mode even when a time is sitting there", () => {
    const body = toCreateRequest(
      draft({ scheduleMode: "now", scheduleAt: "2026-09-20T18:30" }),
      "m"
    )
    expect(body).not.toHaveProperty("publish_at")
  })

  // The four dead columns and the concept that does not exist. A control for
  // any of them would do nothing, and a creator would rely on it.
  it("never sends the columns that accept no client value", () => {
    const body = toCreateRequest(draft(), "m", "cover") as unknown as Record<string, unknown>
    for (const dead of [
      "access",
      "required_tier_id",
      "premiere_at",
      "is_branded",
      "age_restricted",
      "is_age_restricted",
    ]) {
      expect(body).not.toHaveProperty(dead)
    }
  })
})

describe("nextEpisodeNum", () => {
  it("is one past the highest number", () => {
    expect(nextEpisodeNum([1, 2, 3])).toBe(4)
  })

  // A gap is a gap. The server does not renumber, the watch page steps over
  // the hole, and a creator who removed episode 3 may be keeping the number.
  it("does not fill a gap", () => {
    expect(nextEpisodeNum([1, 2, 4])).toBe(5)
  })

  it("starts at 1 for an empty series, because 0 reads as 'missing' on the wire", () => {
    expect(nextEpisodeNum([])).toBe(1)
  })

  it("ignores numbers that are not numbers", () => {
    expect(nextEpisodeNum([Number.NaN, 2, Number.POSITIVE_INFINITY])).toBe(3)
  })
})

describe("validateDraft — series", () => {
  it("has nothing to say when the video is not in a series", () => {
    expect(validateDraft(draft(), NOW, null)).toEqual([])
    expect(validateDraft(draft(), NOW, { episodeNums: [1, 2, 3] })).toEqual([])
  })

  it("accepts a series with room and a number in range", () => {
    const d = draft({ seriesId: "s1", seriesEpisodeNum: 3 })
    expect(validateDraft(d, NOW, { episodeNums: [1, 2] })).toEqual([])
  })

  // The founder's number, and the links editor's: a series the studio can
  // fill past three is one the editor would then refuse to touch.
  it("refuses a series that is already full, under the details step", () => {
    const d = draft({ seriesId: "s1", seriesEpisodeNum: 4 })
    const issues = validateDraft(d, NOW, { episodeNums: [1, 2, 3] })
    expect(issues.map((i) => i.field)).toEqual(["series"])
    expect(issues[0].step).toBe("details")
    expect(issues[0].message).toContain("3 episodes")
  })

  it("names the server's own cap when a series something else filled is at it", () => {
    const fifty = Array.from({ length: 50 }, (_, i) => i + 1)
    const issues = validateDraft(draft({ seriesId: "s1", seriesEpisodeNum: 51 }), NOW, {
      episodeNums: fifty,
    })
    expect(issues[0].message).toContain("50 episodes")
  })

  it("demands an episode number once a series is chosen", () => {
    const issues = validateDraft(draft({ seriesId: "s1", seriesEpisodeNum: null }), NOW, {
      episodeNums: [],
    })
    expect(issues.map((i) => i.field)).toEqual(["series"])
  })

  it("bounds the number to 1..999", () => {
    const facts = { episodeNums: [] }
    expect(validateDraft(draft({ seriesId: "s1", seriesEpisodeNum: 0 }), NOW, facts)).toHaveLength(1)
    expect(validateDraft(draft({ seriesId: "s1", seriesEpisodeNum: 1000 }), NOW, facts)).toHaveLength(1)
    expect(validateDraft(draft({ seriesId: "s1", seriesEpisodeNum: 2.5 }), NOW, facts)).toHaveLength(1)
    expect(validateDraft(draft({ seriesId: "s1", seriesEpisodeNum: 999 }), NOW, facts)).toEqual([])
  })

  // The series is a second write after the post exists. A `series_id` in
  // the create body would be dropped by the server without a word.
  it("never reaches the create request", () => {
    const body = toCreateRequest(
      draft({ seriesId: "s1", seriesEpisodeNum: 2 }),
      "m"
    ) as unknown as Record<string, unknown>
    for (const key of ["series_id", "seriesId", "episode_num", "seriesEpisodeNum"]) {
      expect(body).not.toHaveProperty(key)
    }
  })
})

/* ── Category ──────────────────────────────────────────────────────────────── */

describe("normaliseCategory", () => {
  /*
    post-service `NormalizeCategory`: trim, lowercase, collapse each internal
    run of whitespace to a single hyphen. Reimplemented in the browser so the
    combobox shows the value that will actually be stored — migration 047
    exists because the column held "Education" and "education" as separate
    buckets and some category pages came up empty.
  */
  it("lowercases and trims", () => {
    expect(normaliseCategory("  Education ")).toBe("education")
  })

  it("collapses whitespace into a single hyphen", () => {
    expect(normaliseCategory("Home   Repair")).toBe("home-repair")
    expect(normaliseCategory("a\tb\nc")).toBe("a-b-c")
  })

  it("leaves an already-canonical id alone", () => {
    expect(normaliseCategory("tech")).toBe("tech")
    expect(normaliseCategory("home-repair")).toBe("home-repair")
  })

  it("is empty in, empty out", () => {
    expect(normaliseCategory("   ")).toBe("")
  })

  it("normalises on the wire too, so the form cannot show a different value", () => {
    expect(toCreateRequest(draft({ category: "Home Repair" }), "m").category).toBe("home-repair")
  })
})

/* ── Hashtags and mentions ─────────────────────────────────────────────────── */

describe("normaliseHashtag", () => {
  /*
    `NormalizeExplicitHashtags` returns an ERROR for a bad entry and
    `CreatePost` never runs — one malformed hashtag is a 400 for the whole
    create. So `null` means "the server would refuse this", not "tidy it up".
  */
  it("drops a leading # and lowercases for the index", () => {
    expect(normaliseHashtag("#HowTo")).toBe("howto")
  })

  it("accepts letters from any script, and combining marks", () => {
    expect(normaliseHashtag("नमस्ते")).toBe("नमस्ते")
    expect(normaliseHashtag("тест")).toBe("тест")
  })

  it("refuses anything outside the server's alphabet", () => {
    expect(normaliseHashtag("two words")).toBeNull()
    expect(normaliseHashtag("dash-ed")).toBeNull()
    expect(normaliseHashtag("emoji🎉")).toBeNull()
    expect(normaliseHashtag("#")).toBeNull()
  })

  it("refuses one longer than 50 code points, counted in runes", () => {
    expect(normaliseHashtag("a".repeat(50))).toBe("a".repeat(50))
    expect(normaliseHashtag("a".repeat(51))).toBeNull()
  })
})

describe("normaliseMention", () => {
  it("drops a leading @ and KEEPS the case", () => {
    // user-service owns username case, so the server keeps it and so do we.
    expect(normaliseMention("@RaviK")).toBe("RaviK")
  })

  it("accepts the username alphabet and nothing else", () => {
    expect(normaliseMention("ravi.k_1")).toBe("ravi.k_1")
    expect(normaliseMention("ravi k")).toBeNull()
    expect(normaliseMention("ravi-k")).toBeNull()
    expect(normaliseMention("नमस्ते")).toBeNull()
  })

  it("refuses one longer than 30", () => {
    expect(normaliseMention("a".repeat(31))).toBeNull()
  })
})

describe("toCreateRequest — hashtags and mentions", () => {
  it("sends them under their own keys", () => {
    const body = toCreateRequest(draft({ hashtags: ["howto"], mentions: ["RaviK"] }), "m")
    expect(body.hashtags).toEqual(["howto"])
    expect(body.mentions).toEqual(["RaviK"])
  })

  it("omits them when empty rather than sending empty arrays", () => {
    const body = toCreateRequest(draft(), "m")
    expect(body).not.toHaveProperty("hashtags")
    expect(body).not.toHaveProperty("mentions")
  })

  it("normalises and dedupes whatever is in the draft", () => {
    // A restored draft has been through a different machine's form, so the
    // wire re-normalises rather than trusting it.
    const body = toCreateRequest(
      draft({ hashtags: ["#HowTo", "howto", "bad word"], mentions: ["@Ravi", "ravi"] }),
      "m"
    )
    expect(body.hashtags).toEqual(["howto"])
    expect(body.mentions).toEqual(["Ravi"])
  })
})

describe("validateDraft — hashtags and mentions", () => {
  it("refuses a hashtag the server would 400 on", () => {
    const issues = validateDraft(draft({ hashtags: ["two words"] }), NOW)
    expect(issues.map((i) => i.field)).toContain("hashtags")
  })

  it("refuses more than thirty hashtags", () => {
    const issues = validateDraft(
      draft({ hashtags: Array.from({ length: 31 }, (_, i) => `tag${i}`) }),
      NOW
    )
    expect(issues.find((i) => i.field === "hashtags")?.message).toMatch(/limit is 30/)
  })

  it("refuses more than twenty mentions", () => {
    const issues = validateDraft(
      draft({ mentions: Array.from({ length: 21 }, (_, i) => `user${i}`) }),
      NOW
    )
    expect(issues.find((i) => i.field === "mentions")?.message).toMatch(/limit is 20/)
  })

  it("accepts a draft whose hashtags and mentions are legal", () => {
    expect(validateDraft(draft({ hashtags: ["howto"], mentions: ["ravi.k"] }), NOW)).toEqual([])
  })
})

/* ── Comments ──────────────────────────────────────────────────────────────── */

describe("commentWire", () => {
  /*
    One question, three columns. Asserted here rather than in the component so
    the mapping cannot be changed by editing a JSX prop.
  */
  it("maps on", () => {
    expect(commentWire("on")).toEqual({ no_comments: false, comment_moderation: "none" })
  })

  it("maps on-with-approval to the drafts table's own hold_all", () => {
    expect(commentWire("review")).toEqual({ no_comments: false, comment_moderation: "hold_all" })
  })

  it("does not claim a moderation queue on a video that takes no comments", () => {
    expect(commentWire("off")).toEqual({ no_comments: true, comment_moderation: "none" })
  })
})

/* ── Distribution ──────────────────────────────────────────────────────────── */

describe("toCreateRequest — the distribution policy", () => {
  it("sends the typed policy at version 1", () => {
    const body = toCreateRequest(draft(), "m")
    expect(body.distribution).toEqual({
      version: 1,
      main_feed: true,
      notify_subscribers: true,
    })
  })

  // `ParseDistributionPolicy` answers 400 UNSUPPORTED_DISTRIBUTION for
  // `create_reel_preview: true` — in those words. It is never sent.
  it("never sends create_reel_preview", () => {
    const body = toCreateRequest(draft(), "m")
    expect(body.distribution).not.toHaveProperty("create_reel_preview")
  })

  it("keeps the legacy column in step with the policy", () => {
    // The policy wins wherever it is read, but an older consumer still reads
    // `publish_to_feed`, and two readers must not get two answers.
    const off = toCreateRequest(draft({ mainFeed: false }), "m")
    expect(off.publish_to_feed).toBe(false)
    expect(off.distribution?.main_feed).toBe(false)
  })

  it("carries the subscriber notification separately from the feed", () => {
    const body = toCreateRequest(draft({ mainFeed: true, notifySubscribers: false }), "m")
    expect(body.distribution).toEqual({
      version: 1,
      main_feed: true,
      notify_subscribers: false,
    })
  })
})

/* ── Publishing before the encode finishes ─────────────────────────────────── */

describe("publishAction — the still-processing case", () => {
  /*
    `POST /v1/videos/{id}/publish` is gated on `video_metadata.upload_status`
    and answers 409 NOT_READY until the transcode consumer flips it. The CREATE
    accepts a still-encoding asset. So the second call is dropped rather than
    attempted, and the post reaches the same state on its own.
  */
  it("still publishes a public video when the asset is ready", () => {
    expect(publishAction(draft({ visibility: "public" }), true)).toBe("publish")
  })

  it("creates without the publish call while the asset is still encoding", () => {
    expect(publishAction(draft({ visibility: "public" }), false)).toBe("create")
  })

  it("never calls publish for a narrower audience, ready or not", () => {
    expect(publishAction(draft({ visibility: "unlisted" }), true)).toBe("create")
    expect(publishAction(draft({ visibility: "private" }), false)).toBe("create")
  })

  it("schedules regardless of readiness", () => {
    const scheduled = draft({ scheduleMode: "at", scheduleAt: localAfter(60 * 60 * 1000) })
    expect(publishAction(scheduled, true)).toBe("schedule")
    expect(publishAction(scheduled, false)).toBe("schedule")
  })
})

/* ── The checklist ─────────────────────────────────────────────────────────── */

describe("publishChecklist", () => {
  const labels = (d: VideoDraft, ready = true) => publishChecklist(d, ready).map((s) => s.label)

  it("names the audience", () => {
    expect(labels(draft({ visibility: "followers" })).join(" ")).toMatch(
      /only people who follow you/i
    )
  })

  it("says whether subscribers are told, in both directions", () => {
    expect(labels(draft({ notifySubscribers: true })).join(" ")).toMatch(/are told about it/)
    expect(labels(draft({ notifySubscribers: false })).join(" ")).toMatch(/are not told about it/)
  })

  it("says whether it reaches the main feed", () => {
    expect(labels(draft({ mainFeed: false })).join(" ")).toMatch(/out of the main feed/)
  })

  it("explains the author-only window when the encode has not finished", () => {
    const entry = publishChecklist(draft(), false).find((s) => s.id === "processing")
    expect(entry?.label).toMatch(/only you can see it/i)
  })

  it("has no processing line once the asset is ready", () => {
    expect(publishChecklist(draft(), true).some((s) => s.id === "processing")).toBe(false)
  })

  it("carries a shape as well as a sentence, so nothing rests on colour", () => {
    const entry = publishChecklist(draft({ mainFeed: false }), true).find((s) => s.id === "feed")
    expect(entry?.on).toBe(false)
  })

  it("restates both disclosures when they are declared", () => {
    const joined = labels(draft({ paidPromotion: true, alteredContent: true })).join(" ")
    expect(joined).toMatch(/paid promotion/i)
    expect(joined).toMatch(/altered or synthetic/i)
  })

  it("says nothing about a disclosure that was not made", () => {
    expect(labels(draft()).join(" ")).not.toMatch(/paid promotion/i)
  })
})
