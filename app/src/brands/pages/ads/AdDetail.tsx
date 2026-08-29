import React, { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useGetBrandAdDetail, useGetBrandAdStats, useUpdateBrandAd, getGetBrandAdsQueryKey } from "@workspace/api-client-react";
import { customFetch } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@brands/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@brands/components/ui/card";
import { Skeleton } from "@brands/components/ui/skeleton";
import { Badge } from "@brands/components/ui/badge";
import { Button } from "@brands/components/ui/button";
import { Switch } from "@brands/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@brands/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@brands/components/ui/radio-group";
import { Label } from "@brands/components/ui/label";
import { Textarea } from "@brands/components/ui/textarea";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";
import { Play, CheckCircle, CheckCircle2, TrendingUp, Star, MessageSquare, PlayCircle, Eye, AlignLeft, EyeIcon, Trash2 } from "lucide-react";
import { AISummaryButton } from "@brands/components/AISummaryPanel";
import { UpdateAdRequestStatus, getGetBrandAdStatsQueryKey } from "@workspace/api-client-react";
import type { AdWithQuestions } from "@workspace/api-client-react";

export default function AdDetail() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [deleting, setDeleting] = useState(false);
  
  const { data: ad, isLoading: adLoading } = useGetBrandAdDetail(id as string);
  const { data: stats, isLoading: statsLoading } = useGetBrandAdStats(id as string, { query: { refetchInterval: 60000, queryKey: getGetBrandAdStatsQueryKey(id as string) } });
  const updateMutation = useUpdateBrandAd();

  const handleDelete = async () => {
    if (!ad) return;
    const confirmed = window.confirm(
      "Delete this campaign? If it has review history it will be archived instead of permanently removed.",
    );
    if (!confirmed) return;
    setDeleting(true);
    try {
      const result = await customFetch<{ deleted: boolean; archived: boolean; message: string }>(
        `/api/brands/ads/${ad.id}`,
        { method: "DELETE" },
      );
      toast({ title: result.archived ? "Campaign archived" : "Campaign deleted", description: result.message });
      await queryClient.invalidateQueries({ queryKey: getGetBrandAdsQueryKey() });
      setLocation("/ads");
    } catch (err: unknown) {
      toast({
        title: "Delete failed",
        description: err instanceof Error ? err.message : "Could not delete campaign",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleStatusToggle = (checked: boolean) => {
    if (!ad) return;
    const newStatus = checked ? UpdateAdRequestStatus.active : UpdateAdRequestStatus.paused;
    updateMutation.mutate({
      adId: ad.id,
      data: { status: newStatus }
    });
  };

  if (adLoading || statsLoading) {
    return <div className="p-8 max-w-7xl mx-auto space-y-6"><Skeleton className="h-12 w-1/3" /><Skeleton className="h-64 w-full" /></div>;
  }

  if (!ad || !stats) {
    return <div className="p-8 max-w-7xl mx-auto">Ad not found.</div>;
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{ad.title}</h1>
            <Badge variant={ad.status === "active" ? "default" : ad.status === "paused" ? "secondary" : "outline"} className={ad.status === "active" ? "bg-green-500" : ""}>
              {ad.status.toUpperCase()}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1">Created on {new Date(ad.createdAt).toLocaleDateString()}</p>
        </div>
        
        <div className="flex items-center gap-3">
          <AISummaryButton adId={ad.id} adTitle={ad.title} />
          <Button
            variant="outline"
            className="text-destructive border-destructive/30 hover:bg-destructive/10"
            disabled={deleting || ad.status === "archived"}
            onClick={handleDelete}
            data-testid="btn-delete-ad"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            {deleting ? "Deleting…" : "Delete"}
          </Button>
          <Card className="flex items-center gap-4 p-2 px-4">
            <span className="text-sm font-medium">Campaign Active</span>
            <Switch
              checked={ad.status === "active"}
              onCheckedChange={handleStatusToggle}
              disabled={updateMutation.isPending || ad.status === "archived"}
              data-testid="ad-status-toggle"
            />
          </Card>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title="Total Views" value={stats.totalViews} icon={Eye} />
        <StatCard title="Completions" value={stats.completedViews} icon={CheckCircle} />
        <StatCard title="Completion Rate" value={`${(stats.completionRate * 100).toFixed(1)}%`} icon={TrendingUp} />
        <StatCard title="Avg Watch Time" value={`${stats.averageWatchSeconds.toFixed(1)}s`} icon={PlayCircle} />
      </div>

      <Tabs defaultValue="questions" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="questions">Question Responses</TabsTrigger>
          <TabsTrigger value="activity">Recent Activity</TabsTrigger>
          <TabsTrigger value="settings">Configuration</TabsTrigger>
          <TabsTrigger value="preview" className="flex items-center gap-1.5">
            <EyeIcon className="h-3.5 w-3.5" /> Preview
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="questions" className="space-y-6">
          {stats.questionStats && stats.questionStats.length > 0 ? (
            <div className="grid gap-6 md:grid-cols-2">
              {stats.questionStats.map((qStat) => (
                <Card key={qStat.questionId} className="flex flex-col">
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-base font-medium leading-tight">{qStat.questionText}</CardTitle>
                      <Badge variant="outline" className="text-[10px] uppercase ml-2 flex-shrink-0">{qStat.questionType.replace("_", " ")}</Badge>
                    </div>
                    <CardDescription>{qStat.responseCount} responses</CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col justify-end pt-4">
                    {qStat.questionType === "multiple_choice" && qStat.optionBreakdown && (
                      <div className="h-[200px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={qStat.optionBreakdown} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                            <XAxis type="number" hide />
                            <YAxis dataKey="option" type="category" axisLine={false} tickLine={false} tick={{fill: "hsl(var(--muted-foreground))", fontSize: 12}} width={100} />
                            <RechartsTooltip cursor={{fill: "hsl(var(--muted)/0.5)"}} contentStyle={{backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px"}} />
                            <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} barSize={20} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                    
                    {qStat.questionType === "rating" && (
                      <div className="space-y-4">
                        <div className="flex items-center gap-3">
                          <Star className="w-6 h-6 fill-amber-400 text-amber-400 flex-shrink-0" />
                          <span className="text-3xl font-bold">{qStat.averageRating?.toFixed(1) ?? "—"}</span>
                          <span className="text-sm text-muted-foreground self-end pb-1">avg rating</span>
                        </div>
                        {qStat.optionBreakdown && qStat.optionBreakdown.length > 0 ? (
                          <div className="h-[180px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={qStat.optionBreakdown} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                                <XAxis dataKey="option" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                                <RechartsTooltip cursor={{ fill: "hsl(var(--muted)/0.5)" }} contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }} formatter={(v: number) => [`${v} responses`]} />
                                <Bar dataKey="count" fill="hsl(var(--chart-3))" radius={[4, 4, 0, 0]} barSize={28} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">No distribution data yet.</p>
                        )}
                      </div>
                    )}

                    {qStat.questionType === "open_text" && qStat.openTextSamples && (
                      <div className="space-y-3">
                        {qStat.openTextSamples.slice(0, 3).map((text, i) => (
                          <div key={i} className="bg-muted/50 p-3 rounded-md border border-border/50 text-sm flex gap-3">
                            <MessageSquare className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                            <p className="italic text-foreground/80">"{text}"</p>
                          </div>
                        ))}
                        {qStat.responseCount > 3 && (
                          <div className="text-center pt-2">
                            <Button variant="link" size="sm" className="text-xs">View all responses</Button>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {(qStat.questionType === "yes_no" || qStat.questionType === "emoji") && qStat.optionBreakdown && (
                       <div className="space-y-3 pt-2">
                         {qStat.optionBreakdown.map((opt, i) => (
                           <div key={i} className="flex items-center gap-4">
                             <div className="w-16 text-sm font-medium">{opt.option}</div>
                             <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                               <div className="h-full bg-primary" style={{ width: `${opt.percentage}%` }} />
                             </div>
                             <div className="w-12 text-right text-sm text-muted-foreground">{Math.round(opt.percentage)}%</div>
                           </div>
                         ))}
                       </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <AlignLeft className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p>No question data available yet.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
        
        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle>Recent Views</CardTitle>
            </CardHeader>
            <CardContent>
              {stats.recentActivity && stats.recentActivity.length > 0 ? (
                <div className="space-y-4">
                  {stats.recentActivity.map((act) => (
                    <div key={act.sessionId} className="flex justify-between items-center pb-4 border-b last:border-0 last:pb-0">
                      <div>
                        <p className="font-mono text-sm">Session {act.sessionId.substring(0, 8)}</p>
                        <p className="text-xs text-muted-foreground">{new Date(act.completedAt).toLocaleString()}</p>
                      </div>
                      <Badge variant="secondary">+{act.pointsAwarded} pts awarded</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">No recent activity.</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>Campaign Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 border p-4 rounded-md bg-muted/30">
                <div>
                  <span className="block text-xs text-muted-foreground mb-1">Asset URL</span>
                  <a href={ad.assetUrl} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline break-all">{ad.assetUrl}</a>
                </div>
                <div>
                  <span className="block text-xs text-muted-foreground mb-1">Asset Type</span>
                  <span className="text-sm font-medium capitalize">{ad.assetType}</span>
                </div>
                <div>
                  <span className="block text-xs text-muted-foreground mb-1">Min Watch Time</span>
                  <span className="text-sm font-medium">{ad.minWatchSeconds} seconds</span>
                </div>
                <div>
                  <span className="block text-xs text-muted-foreground mb-1">Point Reward</span>
                  <span className="text-sm font-medium">{ad.pointReward} points</span>
                </div>
                <div>
                  <span className="block text-xs text-muted-foreground mb-1">Ad ID</span>
                  <span className="text-sm font-mono text-muted-foreground">{ad.id}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preview">
          <AdPreview ad={ad} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({ title, value, icon: Icon }: { title: string, value: string | number, icon: React.ComponentType<{ className?: string }> }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{typeof value === 'number' ? value.toLocaleString() : value}</div>
      </CardContent>
    </Card>
  );
}

function AdPreview({ ad }: { ad: AdWithQuestions }) {
  const [watchSeconds, setWatchSeconds] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const iframeRef   = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => setWatchSeconds(p => p + 1), 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isPlaying]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== "https://player.vimeo.com") return;
      let d: any;
      try { d = JSON.parse(e.data as string); } catch { return; }
      if (d.event === "play")                        setIsPlaying(true);
      if (d.event === "pause" || d.event === "finish") setIsPlaying(false);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  const onVimeoLoad = () => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    const o = "https://player.vimeo.com";
    win.postMessage(JSON.stringify({ method: "addEventListener", value: "play"   }), o);
    win.postMessage(JSON.stringify({ method: "addEventListener", value: "pause"  }), o);
    win.postMessage(JSON.stringify({ method: "addEventListener", value: "finish" }), o);
  };

  const handleAnswer = (questionId: string, value: string) =>
    setAnswers(prev => ({ ...prev, [questionId]: value }));

  const watchRequirementMet = watchSeconds >= ad.minWatchSeconds;
  const allAnswered = ad.questions?.every(q => answers[q.id]?.trim()) ?? true;

  const resetPreview = () => {
    setWatchSeconds(0);
    setIsPlaying(false);
    setAnswers({});
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200">
        <EyeIcon className="h-4 w-4 text-amber-600 shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-amber-800">Preview Mode</p>
          <p className="text-xs text-amber-700">This is how reviewers will see your ad. No data is recorded.</p>
        </div>
        <Button variant="outline" size="sm" onClick={resetPreview} className="text-xs h-7 border-amber-300 text-amber-700 hover:bg-amber-100">
          Reset
        </Button>
      </div>

      <div className="max-w-3xl mx-auto space-y-5">
        <div className="rounded-2xl overflow-hidden border border-black/[0.08] bg-black shadow-sm">
          <div
            className="relative aspect-video cursor-pointer"
            onMouseEnter={() => ad.assetType === "image" ? setIsPlaying(true)  : undefined}
            onMouseLeave={() => ad.assetType === "image" ? setIsPlaying(false) : undefined}
          >
            {ad.assetType === "image" ? (
              <img
                src={ad.assetUrl}
                alt={ad.title}
                className="absolute inset-0 w-full h-full object-contain"
              />
            ) : ad.assetType === "video" ? (
              <video
                src={ad.assetUrl}
                className="absolute inset-0 w-full h-full object-contain"
                controls
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
              />
            ) : ad.assetType === "vimeo" ? (
              <iframe
                ref={iframeRef}
                src={`https://player.vimeo.com/video/${ad.assetUrl}?api=1&player_id=vimeo-preview&autoplay=0&title=0&byline=0&portrait=0`}
                className="absolute inset-0 w-full h-full"
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
                onLoad={onVimeoLoad}
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white/40 gap-3">
                <Play size={48} />
                <p className="text-sm">Hover to simulate watch time</p>
              </div>
            )}

            {ad.assetType === "image" && isPlaying && (
              <div className="absolute top-3 right-3 bg-black/60 text-white text-xs px-2 py-1 rounded-full">
                Simulating watch…
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="flex-1">
            <h1 className="text-[22px] font-semibold text-[#1d1d1f] leading-snug">{ad.title}</h1>
            {ad.description && <p className="text-[14px] text-[#6e6e73] mt-2 leading-relaxed">{ad.description}</p>}
          </div>
          <div className="flex gap-2 shrink-0 flex-wrap">
            <div className="flex items-center gap-1.5 bg-[#f5f5f7] rounded-full px-4 py-2">
              <Star size={14} className="fill-amber-400 text-amber-400" />
              <span className="text-[14px] font-bold text-[#1d1d1f]">+{ad.pointReward} pts</span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-black/[0.08] bg-white p-6 space-y-6">
          <div className="space-y-2">
            <div className="flex justify-between text-[13px] font-medium">
              <span className={watchRequirementMet ? "text-[#0071e3]" : "text-[#1d1d1f]"}>
                {watchRequirementMet
                  ? <span className="flex items-center gap-1.5"><CheckCircle2 size={14} /> {ad.assetType === "image" ? "Ad viewed" : "Video watched"}</span>
                  : ad.assetType === "image"
                    ? "View the image (hover to simulate)"
                    : "Watch the video"}
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
                  ) : q.questionType === "multiple_choice" ? (
                    <RadioGroup value={answers[q.id] || ""} onValueChange={val => handleAnswer(q.id, val)} className="space-y-2">
                      {(q.options ?? []).map(opt => (
                        <div
                          key={opt}
                          className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                            answers[q.id] === opt ? "border-[#0071e3] bg-[#0071e3]/[0.04]" : "border-black/[0.1] hover:border-black/20"
                          }`}
                          onClick={() => handleAnswer(q.id, opt)}
                        >
                          <RadioGroupItem value={opt} id={`preview-${q.id}-${opt}`} />
                          <Label htmlFor={`preview-${q.id}-${opt}`} className="font-normal cursor-pointer text-[14px]">{opt}</Label>
                        </div>
                      ))}
                    </RadioGroup>
                  ) : q.questionType === "yes_no" ? (
                    <RadioGroup value={answers[q.id] || ""} onValueChange={val => handleAnswer(q.id, val)} className="space-y-2">
                      {(q.options?.length ? q.options : ["Yes", "No"]).map(opt => (
                        <div
                          key={opt}
                          className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                            answers[q.id] === opt ? "border-[#0071e3] bg-[#0071e3]/[0.04]" : "border-black/[0.1] hover:border-black/20"
                          }`}
                          onClick={() => handleAnswer(q.id, opt)}
                        >
                          <RadioGroupItem value={opt} id={`preview-${q.id}-${opt}`} />
                          <Label htmlFor={`preview-${q.id}-${opt}`} className="font-normal cursor-pointer text-[14px]">{opt}</Label>
                        </div>
                      ))}
                    </RadioGroup>
                  ) : q.questionType === "rating" ? (
                    <div className="flex gap-2">
                      {[1, 2, 3, 4, 5].map(r => (
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
                  ) : q.questionType === "emoji" && q.options?.length ? (
                    <div className="flex flex-wrap gap-2">
                      {q.options.map(opt => (
                        <button
                          key={opt}
                          onClick={() => handleAnswer(q.id, opt)}
                          className={`px-4 py-2 rounded-xl border text-[14px] font-medium transition-all ${
                            answers[q.id] === opt
                              ? "border-[#0071e3] bg-[#0071e3]/[0.06] text-[#0071e3]"
                              : "border-black/[0.12] text-[#1d1d1f] hover:border-[#0071e3]"
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}

          <div className="pt-2">
            <button
              className={`w-full h-12 rounded-xl font-semibold text-[15px] transition-all ${
                watchRequirementMet && allAnswered
                  ? "bg-[#0071e3] hover:bg-[#0077ed] text-white"
                  : "bg-[#f5f5f7] text-[#6e6e73] cursor-not-allowed"
              }`}
              disabled
            >
              {!watchRequirementMet
                ? `Watch ${Math.max(0, ad.minWatchSeconds - watchSeconds)}s more to unlock`
                : !allAnswered
                  ? "Answer all questions to submit"
                  : "Submit Review & Earn (Preview)"}
            </button>
            {watchRequirementMet && allAnswered && (
              <p className="text-center text-xs text-muted-foreground mt-2">Submit is disabled in preview mode — no data will be recorded.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
