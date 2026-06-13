"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Trend = {
  id: number;
  position: number;
  audio: string;
  hashtags: string;
  image_url: string;
  video_url: string | null;
  views: number | null;
  likes: number | null;
  shares: number | null;
  comments: number | null;
  tiktok_url: string | null;
  author_username: string | null;
};

export default function Home() {
  const [trends, setTrends] = useState<Trend[]>([]);

  useEffect(() => {
    async function loadTrends() {
      const { data, error } = await supabase
        .from("trends")
        .select("*")
        .order("position", { ascending: true });

      if (error) {
        console.error(error);
        return;
      }

      setTrends(data || []);
    }

    loadTrends();
  }, []);

  async function copyHashtags(hashtags: string) {
    await navigator.clipboard.writeText(hashtags || "");
    alert("Hashtags copied!");
  }

  function formatNumber(value: number | null) {
    if (!value) return "-";

    if (value >= 1000000) return (value / 1000000).toFixed(1) + "M";
    if (value >= 1000) return (value / 1000).toFixed(1) + "K";

    return value.toString();
  }

  return (
    <main className="min-h-screen bg-black text-white px-5 py-5">
      <div className="flex justify-center mb-5">
        <img
          src="/logo.png"
          alt="Tikitify"
          className="h-24 md:h-28 w-auto"
        />
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {trends.map((trend) => (
          <div
            key={trend.id}
            className="min-w-[260px] max-w-[260px] bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden"
          >
            <div className="relative">
              {trend.video_url ? (
                <video
                  src={trend.video_url}
                  poster={trend.image_url}
                  controls
                  playsInline
                  preload="metadata"
                  className="aspect-[9/14] w-full object-cover bg-black"
                />
              ) : (
                <img
                  src={trend.image_url}
                  alt={trend.audio}
                  className="aspect-[9/14] w-full object-cover"
                />
              )}

              <div className="absolute top-3 left-3 rounded-xl bg-violet-600 px-3 py-1 text-sm font-bold shadow-lg">
                {trend.position}
              </div>
            </div>

            <div className="p-3">
              <h2 className="text-lg font-bold leading-none">
                #{trend.position}
              </h2>

              <p className="mt-2 text-xs text-zinc-300 truncate">
                ♪ {trend.audio}
              </p>

              {trend.author_username && (
                <p className="mt-1 text-xs text-zinc-500 truncate">
                  @{trend.author_username}
                </p>
              )}

              <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-zinc-300">
                <span>◉ {formatNumber(trend.views)}</span>
                <span>♥ {formatNumber(trend.likes)}</span>
                <span>↗ {formatNumber(trend.shares)}</span>
                <span>○ {formatNumber(trend.comments)}</span>
              </div>

              <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-zinc-500">
                {trend.hashtags || "No hashtags"}
              </p>

              <button
                onClick={() => copyHashtags(trend.hashtags)}
                className="mt-3 w-full rounded-lg bg-white py-2 text-sm font-semibold text-black"
              >
                Copy hashtags
              </button>

              {trend.tiktok_url && (
                <a
                  href={trend.tiktok_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 block rounded-lg border border-zinc-700 py-2 text-center text-sm text-white"
                >
                  Open TikTok
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}