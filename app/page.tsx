"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Market = "global" | "spain";

type Trend = {
  id: number;
  position: number;
  market: Market;
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

function getTikTokEmbedUrl(url: string | null) {
  if (!url) return null;

  const match = url.match(/\/video\/(\d+)/);

  if (!match) return null;

  return `https://www.tiktok.com/player/v1/${match[1]}`;
}

export default function Home() {
  const [market, setMarket] = useState<Market>("global");
  const [trends, setTrends] = useState<Trend[]>([]);

  useEffect(() => {
    async function loadTrends() {
      const { data, error } = await supabase
        .from("trends")
        .select("*")
        .eq("market", market)
        .order("position", { ascending: true });

      if (error) {
        console.error(error);
        return;
      }

      setTrends(data || []);
    }

    loadTrends();
  }, [market]);

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
    <main className="min-h-screen bg-black text-white px-4 py-4">
      <div className="flex justify-center mb-3">
        <img
          src="/logo.png"
          alt="Tikitify"
          className="h-20 md:h-20 w-auto"
        />
      </div>

      <div className="mb-5 flex justify-center gap-3">
        <button
          onClick={() => setMarket("global")}
          className={`rounded-full px-5 py-2 text-sm font-semibold ${
            market === "global"
              ? "bg-white text-black"
              : "bg-zinc-900 text-white border border-zinc-700"
          }`}
        >
          🌍 Global
        </button>

        <button
          onClick={() => setMarket("spain")}
          className={`rounded-full px-5 py-2 text-sm font-semibold ${
            market === "spain"
              ? "bg-white text-black"
              : "bg-zinc-900 text-white border border-zinc-700"
          }`}
        >
          🇪🇸 España
        </button>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-3">
        {trends.map((trend) => {
          const embedUrl = getTikTokEmbedUrl(trend.tiktok_url);

          return (
            <div
              key={trend.id}
              className="min-w-[320px] max-w-[320px] bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden"
            >
              <div className="aspect-[9/16] bg-black">
                {embedUrl ? (
                  <iframe
                    src={embedUrl}
                    allow="autoplay; encrypted-media; fullscreen"
                    allowFullScreen
                    className="h-full w-full border-0"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm text-zinc-500">
                    Video unavailable
                  </div>
                )}
              </div>

              <div className="p-3">
                <h2 className="text-base font-bold leading-none">
                  #{trend.position}
                </h2>

                <p className="mt-2 truncate text-[11px] text-zinc-300">
                  ♪ {trend.audio}
                </p>

                {trend.author_username && (
                  <p className="mt-1 truncate text-[11px] text-zinc-500">
                    @{trend.author_username}
                  </p>
                )}

                <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-zinc-300">
                  <span>◌ {formatNumber(trend.views)}</span>
                  <span>♡ {formatNumber(trend.likes)}</span>
                  <span>↗ {formatNumber(trend.shares)}</span>
                  <span>▢ {formatNumber(trend.comments)}</span>
                </div>

                <p className="mt-2 line-clamp-2 text-[11px] leading-snug text-zinc-500">
                  {trend.hashtags || "No hashtags"}
                </p>

                <button
                  onClick={() => copyHashtags(trend.hashtags)}
                  className="mt-3 w-full rounded-lg bg-white py-1.5 text-xs font-semibold text-black"
                >
                  Copy hashtags
                </button>

                {trend.tiktok_url && (
                  <a
                    href={trend.tiktok_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 block rounded-lg border border-zinc-700 py-1.5 text-center text-xs text-white"
                  >
                    Open TikTok
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}