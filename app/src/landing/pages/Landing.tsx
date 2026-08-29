import React, { useState } from "react";
import { Navbar } from "@landing/components/Navbar";
import { Footer } from "@landing/components/Footer";
import { HeroVideo } from "@landing/components/HeroVideo";
import { Button } from "@landing/components/ui/button";
import { Card, CardContent } from "@landing/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@landing/components/ui/dialog";
import {
  PlayCircle,
  Users,
  Zap,
  ShieldCheck,
  Target,
  X,
  Trophy,
  BarChart3,
  MessageSquare,
  Eye,
} from "lucide-react";
import { RoleEntry, RegisterCTAs } from "../../components/RoleEntry";
import {
  useGetPublicStats,
  getGetPublicStatsQueryKey,
  useGetPublicVideos,
  getGetPublicVideosQueryKey,
  useGetPublicPackages,
  getGetPublicPackagesQueryKey,
  type PublicVideoItem,
} from "@workspace/api-client-react";

type PublicVideo = PublicVideoItem;

const REVIEWER_BENEFITS = [
  {
    icon: Zap,
    title: "Earn points",
    body: "Get rewarded for every ad you watch and review — points add up fast.",
  },
  {
    icon: Trophy,
    title: "Gamified attention",
    body: "Climb the weekly leaderboard and compete with other reviewers.",
  },
  {
    icon: PlayCircle,
    title: "Simple and quick",
    body: "Watch a short ad, answer a few questions, and move on.",
  },
] as const;

const BRAND_BENEFITS = [
  {
    icon: Eye,
    title: "Verified engagement",
    body: "Pay for real views — reviewers must watch the full ad before reviewing.",
  },
  {
    icon: BarChart3,
    title: "Campaign analytics",
    body: "Track impressions, completion rates, and review scores in one dashboard.",
  },
  {
    icon: MessageSquare,
    title: "Custom questions",
    body: "Ask what you need to know and get honest, structured feedback.",
  },
] as const;

export default function Landing() {
  const { data: stats } = useGetPublicStats({ query: { queryKey: getGetPublicStatsQueryKey() } });
  const { data: videos } = useGetPublicVideos(
    { limit: 6 },
    { query: { queryKey: getGetPublicVideosQueryKey({ limit: 6 }) } },
  );
  const [lightboxLoaded, setLightboxLoaded] = useState(false);
  const { data: packages } = useGetPublicPackages({ query: { queryKey: getGetPublicPackagesQueryKey() } });
  const [selectedVideo, setSelectedVideo] = useState<PublicVideo | null>(null);

  const getEmbedUrl = (video: PublicVideo) =>
    `https://player.vimeo.com/video/${video.vimeoId}?autoplay=1&title=0&byline=0&portrait=0&dnt=1`;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background text-foreground">
      <Navbar />

      <main className="flex-1">
        {/* Hero — copy + video + primary CTA */}
        <section className="border-b border-border">
          <div className="container mx-auto px-4 sm:px-6 py-12 sm:py-16 lg:py-20">
            <div className="grid gap-10 lg:grid-cols-2 lg:gap-14 lg:items-center">
              <div className="order-2 lg:order-1 relative z-10">
                <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-foreground mb-4">
                  Watch ads. Share feedback. Get paid.
                </h1>
                <p className="text-lg text-muted-foreground leading-relaxed max-w-lg">
                  AdSpot connects Nigerian brands with real people. Reviewers earn rewards.
                  Brands get verified engagement and honest answers.
                </p>

                <div className="mt-8">
                  <a href="/earn/register" className="inline-flex w-full sm:w-auto" data-testid="landing-start-earning-hero">
                    <Button
                      size="lg"
                      className="w-full sm:w-auto min-h-14 px-10 text-lg font-bold shadow-lg hover:shadow-xl transition-shadow"
                    >
                      Start earning
                    </Button>
                  </a>
                  <p className="mt-4 text-sm text-muted-foreground">
                    Already have an account?{" "}
                    <a href="/earn/login" className="font-semibold text-primary hover:underline">
                      Sign in
                    </a>
                    {" · "}
                    <a href="/brands/register" className="font-medium text-foreground hover:underline">
                      Register as brand
                    </a>
                  </p>
                </div>

                <div className="mt-10 pt-8 border-t border-border">
                  <p className="text-sm font-medium text-muted-foreground mb-4">Sign in to your account</p>
                  <RoleEntry />
                </div>
              </div>

              <div className="order-1 lg:order-2">
                <HeroVideo />
                <p className="mt-3 text-center text-xs text-muted-foreground">
                  Sample advert — reviewers watch, answer questions, and earn points.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Audience benefits */}
        <section id="benefits" className="border-b border-border bg-muted/20 py-14 sm:py-20">
          <div className="container mx-auto px-4 sm:px-6">
            <div className="text-center mb-10">
              <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-3">
                Built for reviewers and brands
              </h2>
              <p className="text-muted-foreground max-w-xl mx-auto">
                Whether you want to earn or advertise, AdSpot gives you what you need.
              </p>
            </div>

            <div className="grid gap-8 md:grid-cols-2 max-w-5xl mx-auto">
              <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    <PlayCircle size={20} />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-foreground">For reviewers</h3>
                    <p className="text-sm text-muted-foreground">Turn your attention into rewards</p>
                  </div>
                </div>
                <ul className="space-y-4">
                  {REVIEWER_BENEFITS.map(({ icon: Icon, title, body }) => (
                    <li key={title} className="flex gap-3">
                      <Icon size={18} className="text-primary shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-foreground">{title}</p>
                        <p className="text-sm text-muted-foreground leading-relaxed mt-0.5">{body}</p>
                      </div>
                    </li>
                  ))}
                </ul>
                <a href="/earn/register" className="inline-block mt-6">
                  <Button className="w-full sm:w-auto font-semibold">Register as Reviewer</Button>
                </a>
              </div>

              <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    <BarChart3 size={20} />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-foreground">For brands</h3>
                    <p className="text-sm text-muted-foreground">Real views, real feedback</p>
                  </div>
                </div>
                <ul className="space-y-4">
                  {BRAND_BENEFITS.map(({ icon: Icon, title, body }) => (
                    <li key={title} className="flex gap-3">
                      <Icon size={18} className="text-primary shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-foreground">{title}</p>
                        <p className="text-sm text-muted-foreground leading-relaxed mt-0.5">{body}</p>
                      </div>
                    </li>
                  ))}
                </ul>
                <a href="/brands/register" className="inline-block mt-6">
                  <Button variant="outline" className="w-full sm:w-auto font-semibold">
                    Register as Brand
                  </Button>
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="border-b border-border bg-muted/30 py-10">
          <div className="container mx-auto px-4 sm:px-6">
            <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
              {[
                { icon: Users, value: stats?.totalReviewers, label: "Reviewers" },
                { icon: PlayCircle, value: stats?.totalAdsCompleted, label: "Reviews done" },
                { icon: Zap, value: stats?.totalPointsAwarded, label: "Points earned" },
                { icon: ShieldCheck, value: stats?.totalBrands, label: "Brands" },
              ].map(({ icon: Icon, value, label }) => (
                <div key={label} className="text-center">
                  <div className="mb-2 flex justify-center">
                    <Icon size={22} className="text-primary" />
                  </div>
                  <p className="text-2xl sm:text-3xl font-bold text-foreground">
                    {value?.toLocaleString() ?? "—"}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="py-14 sm:py-20">
          <div className="container mx-auto px-4 sm:px-6">
            <div className="text-center mb-10">
              <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-3">How it works</h2>
              <p className="text-muted-foreground max-w-lg mx-auto">Three simple steps for reviewers.</p>
            </div>

            <div className="grid gap-6 md:grid-cols-3 max-w-4xl mx-auto">
              {[
                { step: "1", title: "Watch", body: "A brand video plays. Watch the full ad — no skipping." },
                { step: "2", title: "Answer", body: "Answer a few quick questions about what you saw." },
                { step: "3", title: "Earn", body: "Points go to your account. Climb the weekly leaderboard." },
              ].map(({ step, title, body }) => (
                <div key={step} className="rounded-xl border border-border bg-card p-6">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold mb-4">
                    {step}
                  </span>
                  <h3 className="text-xl font-semibold text-foreground mb-2">{title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Live campaigns — carousel only when videos exist */}
        <section className="py-14 border-t border-border bg-muted/20">
          <div className="container mx-auto px-4 sm:px-6">
            <div className="mb-8">
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-foreground">Live campaigns</h2>
              <p className="text-muted-foreground mt-1">Sign up to review and earn points.</p>
            </div>

            {videos?.videos && videos.videos.length > 0 ? (
              <>
              <div className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory -mx-4 px-4 sm:mx-0 sm:px-0">
                {videos.videos.map((video) => (
                  <button
                    key={video.id}
                    onClick={() => setSelectedVideo(video)}
                    className="group flex-none w-[260px] sm:w-[280px] snap-start rounded-lg border border-border bg-card overflow-hidden text-left hover:border-primary/40 transition-colors"
                  >
                    <div className="aspect-video bg-zinc-900 relative">
                      <img
                        src={`https://vumbnail.com/${video.vimeoId}.jpg`}
                        alt={video.title}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
                        <PlayCircle size={36} className="text-white" />
                      </div>
                    </div>
                    <div className="p-3">
                      <p className="text-xs text-muted-foreground">{video.brandName}</p>
                      <p className="text-sm font-medium text-foreground line-clamp-1 mt-0.5">{video.title}</p>
                      <p className="text-xs text-primary font-semibold mt-1">+{video.pointReward} pts</p>
                    </div>
                  </button>
                ))}
              </div>

              <Dialog
                open={!!selectedVideo}
                onOpenChange={(open) => {
                  if (!open) {
                    setSelectedVideo(null);
                    setLightboxLoaded(false);
                  }
                }}
              >
                <DialogContent className="max-w-3xl w-full p-0 overflow-hidden">
                  <DialogTitle className="sr-only">{selectedVideo?.title}</DialogTitle>
                  <div className="flex items-center justify-between px-4 py-3 border-b">
                    <div>
                      <p className="font-medium">{selectedVideo?.title}</p>
                      <p className="text-xs text-muted-foreground">{selectedVideo?.brandName}</p>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedVideo(null);
                        setLightboxLoaded(false);
                      }}
                      className="p-1 rounded hover:bg-muted"
                    >
                      <X size={18} />
                    </button>
                  </div>
                  <div className="aspect-video bg-black relative">
                    {selectedVideo && (
                      <iframe
                        key={selectedVideo.id}
                        src={getEmbedUrl(selectedVideo)}
                        title={selectedVideo.title}
                        className={`absolute inset-0 w-full h-full ${lightboxLoaded ? "opacity-100" : "opacity-0"}`}
                        allow="autoplay; fullscreen"
                        allowFullScreen
                        onLoad={() => setLightboxLoaded(true)}
                      />
                    )}
                    {!lightboxLoaded && (
                      <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
                        Loading…
                      </div>
                    )}
                  </div>
                  <div className="p-4 text-center">
                    <a href="/earn/register">
                      <Button>Sign up to earn points</Button>
                    </a>
                  </div>
                </DialogContent>
              </Dialog>
              </>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6 rounded-lg border border-dashed border-border">
                No live campaigns right now — register to be notified when new ads go live.
              </p>
            )}
          </div>
        </section>

        {/* Pricing for brands */}
        <section id="pricing" className="py-14 sm:py-20 border-t border-border">
          <div className="container mx-auto px-4 sm:px-6">
            <div className="text-center mb-10">
              <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-3">For brands</h2>
              <p className="text-muted-foreground max-w-lg mx-auto">
                Pay for real views and feedback — not empty impressions.
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-3 max-w-4xl mx-auto">
              {packages?.packages?.map((pkg) => {
                const priceNaira = Number(pkg.price) / 100;
                return (
                  <Card key={pkg.id} className={pkg.featured ? "border-primary border-2" : ""}>
                    <CardContent className="p-6">
                      <h3 className="text-lg font-semibold">{pkg.name}</h3>
                      <p className="text-sm text-muted-foreground mt-1 mb-4">{pkg.description}</p>
                      <p className="text-3xl font-bold">₦{priceNaira.toLocaleString()}</p>
                      <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                        <li className="flex items-center gap-2">
                          <Target size={14} className="text-primary shrink-0" />
                          {pkg.adSlots} campaign slot{pkg.adSlots > 1 ? "s" : ""}
                        </li>
                        <li className="flex items-center gap-2">
                          <Users size={14} className="text-primary shrink-0" />
                          Up to {pkg.maxImpressions.toLocaleString()} views
                        </li>
                      </ul>
                      <a href="/brands/register" className="block mt-6">
                        <Button className="w-full" variant={pkg.featured ? "default" : "outline"}>
                          Get started
                        </Button>
                      </a>
                    </CardContent>
                  </Card>
                );
              }) ?? (
                <p className="col-span-3 text-center text-muted-foreground">Loading packages…</p>
              )}
            </div>
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="py-14 border-t border-border bg-muted/30">
          <div className="container mx-auto px-4 sm:px-6 text-center">
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-foreground mb-3">
              Ready to get started?
            </h2>
            <p className="text-muted-foreground mb-8 max-w-md mx-auto">
              Create a free account in minutes — choose reviewer or brand.
            </p>
            <RegisterCTAs className="justify-center" size="lg" />
            <p className="mt-8 text-sm text-muted-foreground mb-4">Already registered? Sign in</p>
            <RoleEntry variant="buttons" className="justify-center" />
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
