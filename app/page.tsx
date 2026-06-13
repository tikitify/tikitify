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
    await navigator.clipboard.writeText(hashtags);
    alert("Hashtags copied!");
  }

  function formatNumber(value: number | null) {
    if (!value) return "-";

    if (value >= 1000000) {
      return (value / 1000000).toFixed(1) + "M";
    }

    if (value >= 1000) {
      return (value / 1000).toFixed(1) + "K";
    }

    return value.toString();
  }

  return (
    <main className="min-h-screen bg-black text-white p-6">
<div className="flex justify-center mb-8">
  <img
    src="/logo.png"
    alt="Tikitify"
    className="h-32 w-auto"
  />
</div>

     

      <div className="flex gap-4 overflow-x-auto pb-4">
        {trends.map((trend) => (
          <div
            key={trend.id}
            className="min-w-[260px] bg-zinc-900 rounded-xl p-4"
          >
            {trend.video_url ? (
              <video
                src={trend.video_url}
                poster={trend.image_url}
                controls
                playsInline
                preload="metadata"
                className="aspect-[9/16] w-full object-cover rounded-lg mb-3 bg-black"
              />
            ) : (
              <img
                src={trend.image_url}
                alt={trend.audio}
                className="aspect-[9/16] w-full object-cover rounded-lg mb-3"
              />
            )}

            <h2 className="text-xl font-bold">#{trend.position}</h2>

            <p className="text-sm text-gray-300 mt-2">🎵 {trend.audio}</p>

            {trend.author_username && (
              <p className="text-xs text-gray-500 mt-1">
                @{trend.author_username}
              </p>
            )}

            <div className="grid grid-cols-2 gap-2 mt-4 text-xs">
              <div className="bg-zinc-800 rounded p-2">
                👀 {formatNumber(trend.views)}
              </div>

              <div className="bg-zinc-800 rounded p-2">
                ❤️ {formatNumber(trend.likes)}
              </div>

              <div className="bg-zinc-800 rounded p-2">
                🔁 {formatNumber(trend.shares)}
              </div>

              <div className="bg-zinc-800 rounded p-2">
                💬 {formatNumber(trend.comments)}
              </div>
            </div>

            <p className="text-sm text-gray-500 mt-4 break-words">
              {trend.hashtags || "No hashtags"}
            </p>

            <button
              onClick={() => copyHashtags(trend.hashtags)}
              className="mt-4 w-full rounded-lg bg-white text-black py-2 text-sm font-semibold"
            >
              Copy hashtags
            </button>

            {trend.tiktok_url && (
              <a
                href={trend.tiktok_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block mt-2 text-center rounded-lg border border-zinc-700 py-2 text-sm"
              >
                Open TikTok
              </a>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}