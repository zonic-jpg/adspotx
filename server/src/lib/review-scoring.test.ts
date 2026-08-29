import { describe, expect, it } from "vitest";
import {
  computePointsAwarded,
  computeQuestionInsight,
  computeWatchPercentage,
  sortSurveyInsights,
  type AnswerRow,
} from "./review-scoring";

describe("computePointsAwarded", () => {
  it("rounds base reward with 1.0 multiplier", () => {
    expect(computePointsAwarded(10, "1.0")).toBe(10);
    expect(computePointsAwarded(15, null)).toBe(15);
  });

  it("applies multiplier factor", () => {
    expect(computePointsAwarded(10, "1.5")).toBe(15);
    expect(computePointsAwarded(10, 2)).toBe(20);
  });

  it("falls back when multiplier is invalid", () => {
    expect(computePointsAwarded(12, "not-a-number")).toBe(12);
    expect(computePointsAwarded(12, -1)).toBe(12);
  });
});

describe("computeWatchPercentage", () => {
  it("scales watch time against minimum, capped at 100", () => {
    expect(computeWatchPercentage(15, 15)).toBe(90);
    expect(computeWatchPercentage(30, 15)).toBe(100);
  });

  it("returns null when min watch is zero", () => {
    expect(computeWatchPercentage(10, 0)).toBeNull();
  });
});

describe("computeQuestionInsight — rating positivity", () => {
  const ratingAnswers: AnswerRow[] = [
    { answer_value: "5", answer_text: null, cnt: 3 },
    { answer_value: "4", answer_text: null, cnt: 2 },
    { answer_value: "2", answer_text: null, cnt: 1 },
  ];

  it("computes avg rating and % ratings >= 4", () => {
    const insight = computeQuestionInsight("q1", "rating", ratingAnswers);
    expect(insight.totalAnswers).toBe(6);
    expect(insight.avgRating).toBe(4.2);
    expect(insight.positivityScore).toBe(83); // 5/6 at 4+
  });
});

describe("computeQuestionInsight — yes_no", () => {
  it("computes positivity as % yes answers", () => {
    const answers: AnswerRow[] = [
      { answer_value: "yes", answer_text: null, cnt: 7 },
      { answer_value: "no", answer_text: null, cnt: 3 },
    ];
    const insight = computeQuestionInsight("q2", "yes_no", answers);
    expect(insight.positivityScore).toBe(70);
    expect(insight.distribution[0]?.option).toBe("yes");
  });

  it("is case-insensitive for yes", () => {
    const answers: AnswerRow[] = [
      { answer_value: "Yes", answer_text: null, cnt: 1 },
      { answer_value: "no", answer_text: null, cnt: 1 },
    ];
    expect(computeQuestionInsight("q", "yes_no", answers).positivityScore).toBe(50);
  });
});

describe("computeQuestionInsight — multiple_choice / emoji", () => {
  it("builds distribution percentages", () => {
    const answers: AnswerRow[] = [
      { answer_value: "A", answer_text: null, cnt: 1 },
      { answer_value: "B", answer_text: null, cnt: 3 },
    ];
    const insight = computeQuestionInsight("q3", "multiple_choice", answers);
    expect(insight.positivityScore).toBeNull();
    expect(insight.distribution).toEqual([
      { option: "B", count: 3, pct: 75 },
      { option: "A", count: 1, pct: 25 },
    ]);
  });
});

describe("sortSurveyInsights", () => {
  it("orders by positivityScore descending, then avgRating", () => {
    const sorted = sortSurveyInsights([
      { positivityScore: 40, avgRating: 3 },
      { positivityScore: 90, avgRating: 4.5 },
      { positivityScore: null, avgRating: 4.8 },
    ]);
    expect(sorted.map((s) => s.positivityScore ?? s.avgRating)).toEqual([90, 40, 4.8]);
  });
});
