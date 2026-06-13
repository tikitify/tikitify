"use client";

import { useEffect, useRef, useState } from "react";
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

function TrendVideo({ trend }: { trend: Trend }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [started, setStarted] = useState(false);

  async function startVideo() {
    setStarted(true);

    setTimeout(async () => {
      if (videoRef.current) {
        try {
          videoRef.current.controls = true;
          await videoRef.current.play();
        } catch (error) {
          console.error(error);
        }
      }
    }, 50);
  }

  if (!trend.video_url) {
    return (
      <div className="aspect-[9/12] w-full bg-black flex items-center justify-center text-zinc-500 text-xs">
        No video
      </div>
    );
  }

  return (
    <div className="relative aspect-[9/12] w-full bg-black">
      <video
        ref={videoRef}
        src={trend.video_url}
        playsInline
        preload="auto"
        muted={!started}
        controls={started}
        className="h-full w-full object-cover bg-black"
      />

      {!started && (
        <button
          onClick={startVideo}
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/10"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-black/70 text-2xl text-white">
            ▶
          </div>
        </button>
      )}
    </div>
  );
}

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
    <main className="min-h-screen bg-black text-white px-4 py-4">
      <div className="flex justify-center mb-3">
        <img
          src="/logo.png"
          alt="Tikitify"
          className="h-20 md:h-20 w-auto"
        />
      </div>

      <div className="flex gap-4 overflow-x-auto pb-3">
        {trends.map((trend) => (
          <div
            key={trend.id}
            className="min-w-[230px] max-w-[230px] bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden"
          >
            <TrendVideo trend={trend} />

            <div className="p-3">
              <h2 className="text-base font-bold leading-none">
                #{trend.position}
              </h2>

              <p className="mt-2 text-[11px] text-zinc-300 truncate">
                ♪ {trend.audio}
              </p>

              {trend.author_username && (
                <p className="mt-1 text-[11px] text-zinc-500 truncate">
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
        ))}
      </div>
    </main>
  );
}