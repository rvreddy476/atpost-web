/**
 * Every user-facing string in Know It, in one place. Mirrors Android's QaCopy.kt
 * so the phone and the web say the same thing. Error sentences live with the
 * classifier in ./errors.ts.
 */
import type { SettingKey } from "./parse"

export const COPY = {
  title: "Know It",

  // The dormant gate. A calm screen, never an error one.
  notAvailableTitle: "Know It isn't available yet",
  notAvailableBody:
    "Questions and answers are not switched on for your account yet. We will let you know the moment they are.",

  // Feeds
  tabForYou: "For you",
  tabFollowing: "Following",
  tabTrending: "Trending",
  tabUnanswered: "Unanswered",
  emptyForYouTitle: "Nothing here yet",
  emptyForYouBody: "Follow a few topics and questions you care about will show up here.",
  emptyFollowingTitle: "You are not following anyone yet",
  emptyFollowingBody: "Follow people and topics to see their questions.",
  emptyTrendingTitle: "Nothing is trending",
  emptyTrendingBody: "Be the first to ask something this week.",
  emptyUnansweredTitle: "Every question has an answer",
  emptyUnansweredBody: "Nothing is waiting. Check back later.",
  emptySavedTitle: "Nothing saved",
  emptySavedBody: "Save a question to find it again here.",
  emptyMineTitle: "You have not asked anything yet",
  emptyMineBody: "Questions you ask show up here, including the ones you asked anonymously.",
  emptySearchTitle: "No matches",
  emptySearchBody: "Try fewer words, or ask the question yourself.",
  emptyAnswersTitle: "No answers yet",
  emptyAnswersBody: "Be the first to answer this.",
  emptyTopicsTitle: "No topics yet",
  emptyTopicsBody: "Topics are added by moderators. Check back soon.",
  emptyTopicQuestionsTitle: "No questions in this topic yet",
  emptyTopicQuestionsBody: "Ask the first one.",
  loadFailedTitle: "We could not load this",

  // Ask a question. The action label keeps the verb; the product is Know It.
  askTitle: "Ask a question",
  askTitleLabel: "Your question",
  askTitleHint: "Be specific. A clear question gets a better answer.",
  askBodyLabel: "Details (optional)",
  askBodyHint: "Add context, what you have already tried, or an example.",
  askTopicsLabel: "Topics",
  askTopicsHint: "Pick at least one so the right people see it.",
  askTagsLabel: "Tags (optional)",
  askTagsHint: "Up to five, separated by commas.",
  askAnonymousLabel: "Ask anonymously",
  askAnonymousHint: "Your name will not be shown on this question.",
  askSubmit: "Post question",
  askSimilarHeader: "Already asked?",
  askSimilarHint: "These look close. One may already have your answer.",

  // Question detail
  answerLabel: "Your answer",
  answerHint: "Share what you know. Say how you know it.",
  answerSubmit: "Post answer",
  answerAnonymousLabel: "Answer anonymously",
  answerAnonymousHint: "Your name will not be shown on this answer.",
  bestAnswerBadge: "Best answer",
  markBest: "Mark as best",
  anonymousAuthor: "Anonymous",
  unknownAuthor: "Member",
  postedAnonymously: "Posted anonymously",
  follow: "Follow",
  following: "Following",
  followHint: "Get notified when someone answers.",
  save: "Save",
  saved: "Saved",
  share: "Share",
  linkCopied: "Link copied.",
  report: "Report",
  closedNotice: "This question is closed. You can still read the answers.",
  closeQuestion: "Close question",
  closeReasonLabel: "Why are you closing it?",
  closeReasonHint: "Shown to readers, e.g. “Answered elsewhere”.",
  closed: "Question closed.",
  deleteQuestion: "Delete question",
  deleteConfirm: "Delete this question? Its answers go with it. This cannot be undone.",
  deleted: "Question deleted.",
  comments: "Comments",
  commentLabel: "Add a comment",
  commentSubmit: "Comment",
  sortVotes: "Top",
  sortNewest: "Newest",

  // Report
  reportTitle: "Report",
  reportReasonLabel: "What is wrong with it?",
  reportDetailsLabel: "Tell us more",
  reportSubmit: "Send report",
  reported: "Thanks. We will take a look.",

  // Topics
  topicsTitle: "Topics",
  topicsIntro: "Follow topics to shape your For you feed.",
  featuredTopics: "Featured topics",
  allTopics: "All topics",

  // Me
  meTitle: "Your questions",
  tabMine: "My questions",
  tabSaved: "Saved",

  // Settings › Know It. Separate from the app-wide notification settings.
  settingsTitle: "Know It settings",
  settingsIntro:
    "These are Know It's own settings. They are separate from your app-wide notification settings, and changing one does not change the other.",
  settingsInbox: "In the app",
  settingsPush: "Push notifications",
  settingsEmail: "Email",
  settingsSaved: "Saved.",

  // Search
  searchHint: "Search questions",
  searchShort: "Search",
  searchTooShort: "Type at least two characters to search.",

  // Sign in
  signIn: "Sign in",
  signInToAnswer: "Sign in to answer, vote, follow or report.",
  signInToAsk: "Sign in to ask a question",
  signInToAskBody: "Asking needs an account — even when you ask anonymously.",
  signInForMe: "Sign in to see your questions",
  signInForMeBody: "Your questions and saved questions are kept against your account.",
  signInForSettings: "Sign in to change your Know It settings",
  signInForSettingsBody: "Know It settings are kept against your account.",
  signInToVote: "Sign in to vote.",

  // Success lines
  asked: "Your question is live.",
  answered: "Your answer is posted.",
  commented: "Comment posted.",
  markedBest: "Marked as the best answer.",
  retry: "Try again",
} as const

export interface SettingRow {
  key: SettingKey
  label: string
  hint?: string
}

export interface SettingGroup {
  id: "inbox" | "push" | "email"
  title: string
  rows: SettingRow[]
}

const ANSWERS = "Answers to my questions"
const ANSWERS_HINT = "When someone answers a question you asked"
const FOLLOWED = "Answers to questions I follow"
const FOLLOWED_HINT = "When someone answers a question you follow"
const BEST = "My answer marked best"
const BEST_HINT = "When the person who asked chooses your answer"
const REQUESTS = "Requests to answer"
const COMMENTS = "Comments on my answers"
const VOTES = "Votes"

/**
 * The three groups and their switches: In the app / Push / Email. Every one
 * of the sixteen keys appears exactly once (tested).
 */
export const SETTING_GROUPS: SettingGroup[] = [
  {
    id: "inbox",
    title: COPY.settingsInbox,
    rows: [
      { key: "inbox_answers", label: ANSWERS, hint: ANSWERS_HINT },
      { key: "inbox_followed_answers", label: FOLLOWED, hint: FOLLOWED_HINT },
      { key: "inbox_best_answer", label: BEST, hint: BEST_HINT },
      { key: "inbox_answer_requests", label: REQUESTS },
      { key: "inbox_comments", label: COMMENTS },
      { key: "inbox_votes", label: VOTES },
    ],
  },
  {
    id: "push",
    title: COPY.settingsPush,
    rows: [
      { key: "push_answers", label: ANSWERS },
      { key: "push_followed_answers", label: FOLLOWED },
      { key: "push_best_answer", label: BEST },
      { key: "push_answer_requests", label: REQUESTS },
      { key: "push_comments", label: COMMENTS },
      { key: "push_votes", label: VOTES },
    ],
  },
  {
    id: "email",
    title: COPY.settingsEmail,
    rows: [
      { key: "email_answers", label: ANSWERS, hint: ANSWERS_HINT },
      { key: "email_followed_answers", label: FOLLOWED, hint: FOLLOWED_HINT },
      { key: "email_best_answer", label: BEST, hint: BEST_HINT },
      {
        key: "email_topic_digest",
        label: "Weekly topic digest",
        hint: "Unanswered questions from the past week in topics you follow",
      },
    ],
  },
]
