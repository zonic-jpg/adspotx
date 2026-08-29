import { Link, useLocation } from "wouter";
import { useAuth } from "@earn/contexts/AuthContext";
import { Navbar } from "@earn/components/layout/Navbar";
import { useGetPublicVideos } from "@workspace/api-client-react";
import { ArrowRight, Play } from "lucide-react";

export default function Landing() {
  const { data: videoFeed } = useGetPublicVideos({ limit: 3 });
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const videos = videoFeed?.videos ?? [];
  const ctaHref = user?.role === "reviewer" ? "/dashboard" : "/register";

  const openAd = (id: string) => {
    if (user?.role === "reviewer") navigate(`/review/${id}`);
    else navigate("/register");
  };

  return (
    <div className="min-h-screen bg-[#f8f8f8] flex flex-col">
      <Navbar />

      <main className="flex-1 pt-[60px]">
        <section className="px-4 sm:px-8 py-12 sm:py-16">
          <div className="max-w-xl mx-auto text-center">
            <h1 className="text-3xl sm:text-4xl font-bold text-[#0f0f14] mb-3">
              Earn points reviewing ads
            </h1>
            <p className="text-[#6b7280] mb-8 leading-relaxed">
              Watch short brand videos, answer quick questions, and earn rewards.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href={ctaHref}>
                <span className="btn btn-green btn-lg cursor-pointer font-bold inline-flex items-center gap-2 w-full sm:w-auto justify-center">
                  {user ? "Go to dashboard" : "Create free account"}
                  <ArrowRight size={18} />
                </span>
              </Link>
              {!user && (
                <Link href="/login">
                  <span className="btn btn-outline-dark btn-lg cursor-pointer font-bold w-full sm:w-auto justify-center">
                    Sign in
                  </span>
                </Link>
              )}
            </div>
          </div>
        </section>

        {videos.length > 0 && (
          <section className="px-4 sm:px-8 pb-12">
            <div className="max-w-2xl mx-auto">
              <h2 className="text-sm font-semibold text-[#9ca3af] uppercase tracking-wide mb-4 text-center">
                Live campaigns
              </h2>
              <div className="space-y-3">
                {videos.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => openAd(v.id)}
                    className="w-full flex items-center gap-4 rounded-lg border border-black/10 bg-white p-4 text-left hover:border-[#f97316]/40 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-full bg-[#f97316]/10 flex items-center justify-center shrink-0">
                      <Play size={16} className="text-[#f97316]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[#0f0f14] truncate">{v.title}</p>
                      <p className="text-xs text-[#9ca3af]">{v.brandName} · +{v.pointReward} pts</p>
                    </div>
                    <ArrowRight size={16} className="text-[#9ca3af] shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="px-4 sm:px-8 py-10 border-t border-black/10 bg-white">
          <div className="max-w-md mx-auto text-center">
            <p className="text-sm text-[#6b7280] mb-4">Are you a brand or admin?</p>
            <a href="/brands/login" className="text-sm font-semibold text-[#f97316] hover:underline">
              Go to Brand Portal →
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}
