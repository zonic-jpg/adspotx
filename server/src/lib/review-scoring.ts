/**
 * Pure review / survey scoring helpers — unit-tested, no DB required.
 */

export type AnswerRow = {
  answer_value: string | null;
  answer_text: string | null;
  cnt: string | number;
};

export type QuestionInsight = {
  questionId: string;
  questionType: string;
  totalAnswers: number;
  avgRating: number | null;
  positivityScore: number | null;
  distribution: Array<{ option: string; count: number; pct: number }>;
  samples: string[];
};

/** Points awarded for a completed review (server-side, never trust client). */
export function computePointsAwarded(
  pointReward: number,
  multiplierFactor: string | number | null | undefined,
): number {
  const multiplier = parseFloat(String(multiplierFactor ?? "1.0"));
  if (!Number.isFinite(multiplier) || multiplier <= 0) {
    return Math.round(pointReward);
  }
  return Math.round(pointReward * multiplier);
}

/** Watch engagement % capped at 100 (based on min watch requirement). */
export function computeWatchPercentage(
  watchSeconds: number,
  minWatchSeconds: number,
): number | null {
  if (!minWatchSeconds || minWatchSeconds <= 0) return null;
  return Math.min(100, Math.round((watchSeconds / minWatchSeconds) * 90));
}

function totalAnswerCount(answers: AnswerRow[]): number {
  return answers.reduce((s, r) => s + Number(r.cnt), 0);
}

/** Build survey insight metrics for one question from aggregated answer rows. */
export function computeQuestionInsight(
  questionId: string,
  questionType: string,
  answers: AnswerRow[],
): QuestionInsight {
  const totalAnswers = totalAnswerCount(answers);
  let avgRating: number | null = null;
  let positivityScore: number | null = null;
  let distribution: Array<{ option: string; count: number; pct: number }> = [];
  let samples: string[] = [];

  if (questionType === "rating") {
    const sum = answers.reduce(
      (s, r) => s + Number(r.answer_value ?? 0) * Number(r.cnt),
      0,
    );
    avgRating =
      totalAnswers > 0 ? Math.round((sum / totalAnswers) * 10) / 10 : null;
    const positiveCount = answers
      .filter((r) => Number(r.answer_value) >= 4)
      .reduce((s, r) => s + Number(r.cnt), 0);
    positivityScore =
      totalAnswers > 0 ? Math.round((positiveCount / totalAnswers) * 100) : null;
  } else if (["multiple_choice", "yes_no", "emoji"].includes(questionType)) {
    distribution = answers
      .map((r) => ({
        option: r.answer_value ?? "",
        count: Number(r.cnt),
        pct:
          totalAnswers > 0
            ? Math.round((Number(r.cnt) / totalAnswers) * 100)
            : 0,
      }))
      .sort((a, b) => b.count - a.count);
    if (questionType === "yes_no") {
      const yesCount = answers
        .filter((r) => r.answer_value?.toLowerCase() === "yes")
        .reduce((s, r) => s + Number(r.cnt), 0);
      positivityScore =
        totalAnswers > 0 ? Math.round((yesCount / totalAnswers) * 100) : null;
    }
  } else if (questionType === "open_text") {
    samples = answers
      .slice(0, 6)
      .map((r) => r.answer_text ?? "")
      .filter(Boolean);
  }

  return {
    questionId,
    questionType,
    totalAnswers,
    avgRating,
    positivityScore,
    distribution,
    samples,
  };
}

/** Sort survey insights: highest positivity (or avg rating) first. */
export function sortSurveyInsights<T extends { positivityScore: number | null; avgRating: number | null }>(
  insights: T[],
): T[] {
  return [...insights].sort(
    (a, b) =>
      (b.positivityScore ?? b.avgRating ?? 0) -
      (a.positivityScore ?? a.avgRating ?? 0),
  );
}
