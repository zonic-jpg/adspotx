import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { DashboardLayout } from "@earn/components/layout/DashboardLayout";
import {
  useGetAdDetail,
  useStartReview,
  useCompleteReview,
} from "@workspace/api-client-react";
import { Button } from "@earn/components/ui/button";
import { useToast } from "@earn/hooks/use-toast";
import { RadioGroup, RadioGroupItem } from "@earn/components/ui/radio-group";
import { Label } from "@earn/components/ui/label";
import { Textarea } from "@earn/components/ui/textarea";
import { CheckCircle2, AlertCircle, ArrowLeft, Star, Loader2, Gift, Zap, Copy, Trophy } from "lucide-react";
import { VideoPlayer } from "@earn/components/VideoPlayer";
import { Link } from "wouter";
import { fetchAdReward, claimReward, type AdReward } from "@earn/lib/rewards";

function isChoiceQuestion(type: string) {
  return type === "multiple_choice" || type === "mcq" || type === "yes_no" || type === "emoji";
}

export default function ReviewSession() {
  const params = useParams<{ id: string }>();
  const adId = params?.id;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [watchSeconds, setWatchSeconds] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [comment, setComment] = useState("");
  const [proverbAnswer, setProverbAnswer] = useState("");
  const [isCompleted, setIsCompleted] = useState(false);
  const [earnedPoints, setEarnedPoints] = useState(0);
  const [reward, setReward] = useState<AdReward | null>(null);
  const [claimedCode, setClaimedCode] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);

  const { data: ad, isLoading: loadingAd } = useGetAdDetail(adId);
  const startReviewMutation = useStartReview();
  const completeReviewMutation = useCompleteReview();

  useEffect(() => {
    if (adId && !sessionId && !startReviewMutation.isPending && !startReviewMutation.isSuccess) {
      startReviewMutation.mutate({ data: { adId } }, {
        onSuccess: (data) => setSessionId(data.id),
        onError: (err: any) => toast({ variant: "destructive", title: "Couldn't start review", description: err?.message }),
      });
    }
  }, [adId, sessionId]);

  useEffect(() => {
    fetchAdReward(adId).then(r => setReward(r)).catch(() => {});
  }, [adId]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying && !isCompleted) {
      interval = setInterval(() => setWatchSeconds(p => p + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [isPlaying, isCompleted]);

  const handleAnswer = (questionId: string, value: string) =>
    setAnswers(prev => ({ ...prev, [questionId]: value }));

  const allAnswered = ad?.questions?.every(q => answers[q.id]?.trim()) ?? true;
  const proverbRequired = Boolean(ad?.proverbQuestion?.trim());
  const proverbAnswered = !proverbRequired || proverbAnswer.trim().length > 0;
  const watchRequirementMet = ad ? watchSeconds >= ad.minWatchSeconds : false;
  const canSubmit = allAnswered && proverbAnswered && watchRequirementMet && sessionId && !isCompleted;

  const submitReview = () => {
    if (!canSubmit || !sessionId) return;
    const formattedAnswers = Object.entries(answers).map(([questionId, value]) => {
      const q = ad?.questions.find(q => q.id === questionId);
      return { questionId, [q?.questionType === "open_text" ? "answerText" : "answerValue"]: value };
    });
    completeReviewMutation.mutate({ sessionId, data: { watchSeconds, answers: formattedAnswers, comment: comment.trim() || undefined, proverbAnswer: proverbAnswer.trim() || undefined } }, {
      onSuccess: (res) => {
        setIsCompleted(true);
        setEarnedPoints(res.pointsAwarded);
      },
      onError: (err: any) => toast({ variant: "destructive", title: "Submission failed", description: err?.message }),
    });
  };

  const handleClaimReward = async () => {
    if (!reward) return;
    setClaiming(true);
    try {
      const claim = await claimReward(reward.id);
      setClaimedCode(claim.redemptionCode);
      toast({ title: "Reward claimed!", description: claim.rewardValueText });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Claim failed", description: e.message });
    } finally {
      setClaiming(false);
    }
  };

  if (loadingAd || !sessionId) {
    return (
      <DashboardLayout title="Review Ad">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-[#0071e3]" />
        </div>
      </DashboardLayout>
    );
  }

  if (!ad) {
    return (
      <DashboardLayout title="Ad Not Found">
        <div className="text-center py-12">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-4">Ad not found</h2>
          <Link href="/dashboard"><Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button></Link>
        </div>
      </DashboardLayout>
    );
  }

  const multiplier = parseFloat(String(ad.multiplierFactor));
  const hasMultiplier = multiplier > 1.0;

  // ─ Completion screen ─
  if (isCompleted) {
    return (
      <DashboardLayout title="Review Complete">
        <div className="max-w-lg mx-auto py-12 space-y-5">
          {/* Points earned */}
          <div className="rounded-2xl bg-[#0071e3] p-8 text-center text-white">
            <Trophy size={40} className="mx-auto mb-4 opacity-80" />
            <p className="text-white/70 text-[13px] uppercase tracking-wider mb-2">Points Earned</p>
            <div className="text-[56px] font-semibold tracking-[-0.03em] leading-none mb-1 tabular-nums">
              +{earnedPoints}
            </div>
            <p className="text-white/60 text-[14px]">Thank you for reviewing {ad.brandName}</p>
          </div>

          {/* Reward claim card */}
          {reward && reward.available && !claimedCode && (
            <div className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-6">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-amber-400 flex items-center justify-center shrink-0">
                  <Star size={18} className="text-white fill-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-[16px] font-semibold text-[#1d1d1f]">{reward.title}</h3>
                    {reward.type === "wildcard" && (
                      <span className="text-[11px] font-bold bg-amber-400 text-white px-2 py-0.5 rounded-full uppercase tracking-wide">
                        ★ Wildcard
                      </span>
                    )}
                  </div>
                  <p className="text-[14px] text-[#6e6e73]">{reward.description}</p>
                  <p className="text-[15px] font-semibold text-amber-700 mt-1">{reward.rewardValueText}</p>
                  {reward.type === "wildcard" && reward.spotsLeft !== null && (
                    <p className="text-[12px] text-amber-600 mt-1">{reward.spotsLeft} slot{reward.spotsLeft !== 1 ? "s" : ""} remaining</p>
                  )}
                </div>
              </div>
              <Button
                className="w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl"
                disabled={claiming}
                onClick={handleClaimReward}
              >
                {claiming ? <Loader2 size={16} className="animate-spin mr-2" /> : <Gift size={16} className="mr-2" />}
                Claim This Reward
              </Button>
            </div>
          )}

          {/* Claimed reward */}
          {(claimedCode || reward?.claimedCode) && (
            <div className="rounded-2xl border border-green-200 bg-green-50 p-6">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 size={18} className="text-green-600" />
                <h3 className="font-semibold text-green-800">Reward Claimed!</h3>
              </div>
              <p className="text-[13px] text-green-700 mb-3">{reward?.rewardValueText}</p>
              <div className="bg-white border border-green-200 rounded-xl p-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] text-[#6e6e73] uppercase tracking-wider mb-1">Your redemption code</p>
                  <p className="font-mono text-[16px] font-bold text-[#1d1d1f]">{claimedCode || reward?.claimedCode}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(claimedCode || reward?.claimedCode || "");
                    toast({ title: "Copied!" });
                  }}
                >
                  <Copy size={14} />
                </Button>
              </div>
            </div>
          )}

          {/* Already claimed */}
          {reward && reward.alreadyClaimed && !claimedCode && (
            <div className="rounded-2xl border border-black/[0.08] bg-[#f5f5f7] p-5 text-center text-[14px] text-[#6e6e73]">
              You already claimed the reward for this ad.
            </div>
          )}

          <Link href="/dashboard">
            <Button size="lg" className="w-full rounded-xl bg-[#0071e3] hover:bg-[#0077ed] text-white font-semibold h-12">
              Find More Ads →
            </Button>
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  // ─ Review session ─
  return (
    <DashboardLayout title="">
      <div className="max-w-3xl mx-auto space-y-5">
        <Link href="/dashboard">
          <button className="flex items-center gap-1.5 text-[13px] text-[#6e6e73] hover:text-[#0071e3] transition-colors mb-2">
            <ArrowLeft size={14} /> Back to ads
          </button>
        </Link>

        {/* Video player */}
        <div className="rounded-2xl overflow-hidden border border-black/[0.08] shadow-sm">
          <VideoPlayer
            videoId={ad.assetUrl}
            assetType={ad.assetType}
            autoplay
            className="aspect-video w-full"
            onReady={() => setIsPlaying(true)}
            onError={() => setIsPlaying(false)}
          />
        </div>

        {/* Ad info + reward indicator */}
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="flex-1">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-[#6e6e73] mb-1">{ad.brandName}</p>
            <h1 className="text-[22px] font-semibold text-[#1d1d1f] leading-snug">{ad.title}</h1>
            {ad.description && <p className="text-[14px] text-[#6e6e73] mt-2 leading-relaxed">{ad.description}</p>}
          </div>
          <div className="flex gap-2 shrink-0 flex-wrap">
            <div className="flex items-center gap-1.5 bg-[#f5f5f7] rounded-full px-4 py-2">
              <Star size={14} className="fill-amber-400 text-amber-400" />
              <span className="text-[14px] font-bold text-[#1d1d1f]">+{ad.pointReward} pts</span>
            </div>
            {hasMultiplier && (
              <div className="flex items-center gap-1 bg-amber-400 rounded-full px-4 py-2">
                <Zap size={13} className="text-white" />
                <span className="text-[13px] font-bold text-white">{multiplier.toFixed(1)}× multiplier</span>
              </div>
            )}
            {reward && reward.available && (
              <div className="flex items-center gap-1 bg-amber-50 border border-amber-300 rounded-full px-4 py-2">
                <Star size={13} className="fill-amber-400 text-amber-400" />
                <span className="text-[13px] font-semibold text-amber-700">{reward.title}</span>
              </div>
            )}
          </div>
        </div>

        {/* Progress + Questions */}
        <div className="rounded-2xl border border-black/[0.08] bg-white p-6 space-y-6">
          {/* Watch progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-[13px] font-medium">
              <span className={watchRequirementMet ? "text-[#0071e3]" : "text-[#1d1d1f]"}>
                {watchRequirementMet ? <span className="flex items-center gap-1.5"><CheckCircle2 size={14} /> Video watched</span> : "Watch the video"}
              </span>
              <span className={watchRequirementMet ? "text-[#0071e3]" : "text-[#6e6e73]"}>
                {Math.min(watchSeconds, ad.minWatchSeconds)}s / {ad.minWatchSeconds}s
              </span>
            </div>
            <div className="h-2 bg-[#f5f5f7] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#0071e3] rounded-full transition-all duration-1000 ease-linear"
                style={{ width: `${Math.min(100, (watchSeconds / ad.minWatchSeconds) * 100)}%` }}
              />
            </div>
          </div>

          {/* Questions */}
          {ad.questions?.length > 0 && (
            <div className="border-t border-black/[0.06] pt-6 space-y-6">
              <h3 className="text-[15px] font-semibold text-[#1d1d1f]">Quick survey</h3>
              {ad.questions.map((q, index) => (
                <div key={q.id} className="space-y-3">
                  <p className="text-[14px] font-medium text-[#1d1d1f]">
                    <span className="text-[#6e6e73] mr-2">{index + 1}.</span>{q.questionText}
                  </p>
                  {q.questionType === "open_text" ? (
                    <Textarea
                      placeholder="Your answer..."
                      value={answers[q.id] || ""}
                      onChange={e => handleAnswer(q.id, e.target.value)}
                      className="min-h-[80px] resize-none border-black/[0.12] rounded-xl text-[14px]"
                    />
                  ) : isChoiceQuestion(q.questionType) ? (
                    <RadioGroup value={answers[q.id] || ""} onValueChange={val => handleAnswer(q.id, val)} className="space-y-2">
                      {q.options?.map(opt => (
                        <div key={opt} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                          answers[q.id] === opt ? "border-[#0071e3] bg-[#0071e3]/[0.04]" : "border-black/[0.1] hover:border-black/20"
                        }`} onClick={() => handleAnswer(q.id, opt)}>
                          <RadioGroupItem value={opt} id={`${q.id}-${opt}`} />
                          <Label htmlFor={`${q.id}-${opt}`} className="font-normal cursor-pointer text-[14px]">{opt}</Label>
                        </div>
                      ))}
                    </RadioGroup>
                  ) : q.questionType === "rating" ? (
                    <div className="flex gap-2">
                      {[1,2,3,4,5].map(r => (
                        <button
                          key={r}
                          onClick={() => handleAnswer(q.id, r.toString())}
                          className={`w-11 h-11 rounded-xl border text-[14px] font-semibold transition-all ${
                            answers[q.id] === r.toString()
                              ? "bg-[#0071e3] border-[#0071e3] text-white"
                              : "border-black/[0.12] text-[#1d1d1f] hover:border-[#0071e3]"
                          }`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}

          {ad.proverbQuestion && (
            <div className="border-t border-black/[0.06] pt-6 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-[14px] font-medium text-[#1d1d1f]">
                  Attention check
                </label>
                {ad.proverbBonusPoints ? (
                  <span className="text-[12px] font-semibold text-amber-600">+{ad.proverbBonusPoints} bonus pts</span>
                ) : null}
              </div>
              <p className="text-[13px] text-[#6e6e73]">{ad.proverbQuestion}</p>
              <input
                type="text"
                value={proverbAnswer}
                onChange={e => setProverbAnswer(e.target.value)}
                placeholder="Your answer..."
                className="w-full h-11 px-4 rounded-xl border border-black/[0.12] text-[14px]"
                data-testid="proverb-answer-input"
              />
            </div>
          )}

          {/* Optional comment */}
          <div className="border-t border-black/[0.06] pt-6 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[14px] font-medium text-[#1d1d1f]">
                Leave a comment <span className="text-[#6e6e73] font-normal">(optional)</span>
              </label>
              <span className={`text-[12px] tabular-nums ${comment.length > 270 ? "text-orange-500 font-semibold" : "text-[#6e6e73]"}`}>
                {comment.length}/300
              </span>
            </div>
            <Textarea
              placeholder="Share any additional thoughts about this ad or product… (max 300 characters)"
              value={comment}
              onChange={e => setComment(e.target.value.slice(0, 300))}
              className="min-h-[88px] resize-none border-black/[0.12] rounded-xl text-[14px]"
              maxLength={300}
            />
          </div>

          {/* Submit */}
          <div className="pt-2">
            <button
              className={`w-full h-12 rounded-xl font-semibold text-[15px] transition-all ${
                canSubmit && !completeReviewMutation.isPending
                  ? "bg-[#0071e3] hover:bg-[#0077ed] text-white"
                  : "bg-[#f5f5f7] text-[#6e6e73] cursor-not-allowed"
              }`}
              disabled={!canSubmit || completeReviewMutation.isPending}
              onClick={submitReview}
            >
              {completeReviewMutation.isPending ? "Submitting..." :
               !watchRequirementMet ? `Watch ${Math.max(0, ad.minWatchSeconds - watchSeconds)}s more to unlock` :
               !allAnswered ? "Answer all questions to submit" :
               !proverbAnswered ? "Answer the attention check to submit" :
               "Submit Review & Earn"}
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
