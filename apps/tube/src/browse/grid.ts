/**
 * The video grid's column count, in one place because two files draw it.
 *
 * The real grid and the skeleton that reserves its space MUST agree. When
 * they do not, the first page landing re-flows the whole page — which is the
 * one thing a skeleton exists to prevent, and the failure is invisible on a
 * fast connection and obvious on a slow one.
 *
 * ── The numbers are the argument ──────────────────────────────────────────
 * The content track is the window minus the rail (240px expanded) minus 48px
 * of padding, capped at 1600px. So a cell is roughly:
 *
 *      640 (sm)   2 across   ~290px   — the rail is a drawer here, not a column
 *     1024 (lg)   2 across   ~356px
 *     1280 (xl)   3 across   ~320px
 *     1536 (2xl)  4 across   ~300px
 *
 * The floor is ~280px, which is where a 16:9 poster stops reading as a
 * picture and a 100-character title stops fitting in two lines. That is the
 * same threshold the old two-across layout was chosen against — the answer
 * changed because the track did, not because the taste did.
 *
 * `lg` deliberately stays at two rather than going to three: three at 1024 is
 * 235px, under the floor, and 1024 is exactly where the rail appears and
 * takes 240px out of the width.
 *
 * ── Asymmetric gaps, on purpose ───────────────────────────────────────────
 * `gap-x-4` keeps a row reading as one row; `gap-y-8` puts real air between a
 * card's title block and the poster of the card below it. An even gutter
 * makes a title look like a caption for the wrong picture.
 */
export const VIDEO_GRID =
  "grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
