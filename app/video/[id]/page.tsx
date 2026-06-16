"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";

type Trend = {
  id: number;
  position: number;
  market: "global" | "spain";
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

function formatNumber(value: number | null) {
  if (!value) return "-";
  if (value >= 1000000) return (value / 1000000).toFixed(1) + "M";
  if (value >= 1000) return (value / 1000).toFixed(1) + "K";
  return value.toString();
}

export default function VideoPage({
  params,
}: {
  params: { id: string };
}) {
  const [trend, setTrend] = useState<Trend | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadTrend() {
      const { data, error } = await supabase
        .from("trends")
        .select("*")
        .eq("id", Number(params.id))
        .single();

      if (error) {
        console.error(error);
        setTrend(null);
        setLoading(false);
        return;
      }

      setTrend(data);
      setLoading(false);
    }

    loadTrend();
  }, [params.id]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        Loading video...
      </main>
    );
  }

  if (!trend) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black px-4 text-center text-white">
        <h1 className="text-2xl font-bold">Video not found</h1>
        <Link href="/" className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-black">
          Back to Tikitify
        </Link>
      </main>
    );
  }

  const embedUrl = getTikTokEmbedUrl(trend.tiktok_url);

  return (
    <main className="min-h-screen bg-black px-4 py-4 text-white">
      <header className="mb-4 flex items-center justify-between">
        <Link href="/" className="text-sm text-zinc-400">
          ← Back
        </Link>

        <img src="/logo.png" alt="Tikitify" className="h-12 w-auto" />

        <div className="w-10" />
      </header>

      <section className="mx-auto max-w-[420px] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
        <div className="h-[560px] bg-black">
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

        <div className="p-4">
          <h1 className="text-xl font-bold">
            TikTok Trend #{trend.position}
          </h1>

          <p className="mt-2 text-sm text-zinc-400">
            {trend.market === "spain" ? "Spain trend" : "Global trend"}
          </p>

          {trend.author_username && (
            <p className="mt-2 text-sm text-zinc-300">
              @{trend.author_username}
            </p>
          )}

          <div className="mt-3 text-sm font-medium text-zinc-300">
            👁 {formatNumber(trend.views)} views
          </div>

          <p className="mt-3 text-sm leading-relaxed text-zinc-500">
            {trend.hashtags || "No hashtags"}
          </p>

          {trend.tiktok_url && (
            <a
              href={trend.tiktok_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 block rounded-lg border border-zinc-700 py-2 text-center text-sm text-white"
            >
              Open on TikTok
            </a>
          )}
        </div>
      </section>
    </main>
  );
}