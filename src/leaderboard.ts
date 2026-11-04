/**
 * The leaderboards: the Hall of Fame. Signed-in players are ranked on six
 * boards by the scores their progress keeps (`progress.scores`), and each
 * course keeps its best times; `supabase/schema.sql` answers them
 * (`leaderboard`, `leaderboard_me`, `course_board`) and only a named player
 * who has not hidden (`profiles.listed`, the switch on Settings' Account
 * page) is on them. Read through the account's endpoint (`account/rest.ts`'s
 * `rpc`), kept a minute, never thrown into the game.
 *
 * The parts live in `leaderboard/`: `boards.ts` (the boards, the words for a
 * rank and a share), `parse.ts` (an answer read leniently), `client.ts` (the
 * reads and what is kept), `page.ts` (the page's own, through its account),
 * `card.ts` and `rows.ts` (the Hall of Fame card), `course.ts` (a course's
 * records, for a dialogue), `paint.ts` (a board painted for the world),
 * `style.ts`.
 */
export { BOARDS, COURSE_ID, boardInfo, isBoard, ordinal, scoreText, scoreWithUnit, standingText, topPercent } from './leaderboard/boards.ts';
export type { BoardId, BoardInfo } from './leaderboard/boards.ts';
export { createLeaderboards } from './leaderboard/client.ts';
export type { Answer, BoardQuery, BoardsSource, Leaderboards, LeaderboardsOptions } from './leaderboard/client.ts';
export type { BoardRow, CourseRow, Standing } from './leaderboard/parse.ts';
export { leaderboards, leaderboardsAvailable } from './leaderboard/page.ts';
export { createHallOfFame } from './leaderboard/card.ts';
export type { HallOfFame, HallOfFameOptions } from './leaderboard/card.ts';
export { COURSE_RECORDS, courseBoardElement, courseRecords } from './leaderboard/course.ts';
export { FAME_LINES, paintFameBoard } from './leaderboard/paint.ts';
export type { FameLine, FamePaint } from './leaderboard/paint.ts';
