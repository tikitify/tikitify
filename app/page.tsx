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

function formatDateTime(date: Date) {
  const time = date.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const day = date.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
  });

  return { time, day };
}

export default function Home() {
  const [market, setMarket] = useState<Market>("spain");
  const [trends, setTrends] = useState<Trend[]>([]);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date());
    }, 60000);

    return () => clearInterval(interval);
  }, []);

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

  const dateTime = formatDateTime(now);

  return (
    <main className="min-h-screen bg-black text-white px-3 py-3">
      <header className="grid grid-cols-3 items-center mb-3">
        <div className="flex items-center justify-start gap-2">
          <button
            aria-label="Global trends"
            onClick={() => setMarket("global")}
            className={`flex h-10 w-10 items-center justify-center rounded-full border text-lg transition ${
              market === "global"
                ? "border-white bg-white text-black"
                : "border-zinc-700 bg-zinc-950 text-white"
            }`}
          >
            🌍
          </button>

          <button
            aria-label="Spain trends"
            onClick={() => setMarket("spain")}
            className={`flex h-10 w-10 items-center justify-center rounded-full border text-lg transition ${
              market === "spain"
                ? "border-white bg-white text-black"
                : "border-zinc-700 bg-zinc-950 text-white"
            }`}
          >
            🇪🇸
          </button>
        </div>

        <div className="flex justify-center">
          <img
            src="/logo.png"
            alt="Tikitify"
            className="h-16 w-auto"
          />
        </div>

        <div className="flex justify-end">
  <div className="rounded-full border border-zinc-800 bg-zinc-950 px-5 py-2 text-sm font-semibold tracking-wide text-white">
    {dateTime.day.toUpperCase()}
  </div>
</div>
      </header>

      <div className="flex gap-4 overflow-x-auto pb-3">
        {trends.map((trend) => {
          const embedUrl = getTikTokEmbedUrl(trend.tiktok_url);

          return (
            <div
              key={trend.id}
              className="flex min-w-[280px] max-w-[280px] flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950"
            >
              <div className="h-[370px] bg-black">
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

              <div className="flex min-h-[210px] flex-1 flex-col p-3">
                <h2 className="text-base font-bold leading-none">
                  #{trend.position}
                </h2>

                <p className="mt-2 truncate text-[11px] text-zinc-300">
                  ♪ {trend.audio}
                </p>

                <p className="mt-1 min-h-[16px] truncate text-[11px] text-zinc-500">
                  {trend.author_username ? `@${trend.author_username}` : ""}
                </p>

                <div className="mt-2 text-[11px] font-medium text-zinc-300">
                  👁 {formatNumber(trend.views)}
                </div>

                <p className="mt-2 min-h-[34px] line-clamp-2 text-[11px] leading-snug text-zinc-500">
                  {trend.hashtags || "No hashtags"}
                </p>

                <div className="mt-2">
                  <button
                    onClick={() => copyHashtags(trend.hashtags)}
                    className="w-full rounded-lg bg-white py-1.5 text-xs font-semibold text-black"
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
            </div>
          );
        })}
      </div>
    </main>
  );
}