"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import {
  extractHashtagNames,
  getHashtagHref,
  type Market,
  type Trend,
} from "../lib/hashtags";

function getTikTokEmbedUrl(url: string | null) {
  if (!url) return null;
  const match = url.match(/\/video\/(\d+)/);
  if (!match) return null;
  return `https://www.tiktok.com/player/v1/${match[1]}`;
}

function formatDateTime(date: Date) {
  const day = date.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
  });

  return { day };
}

function formatNumber(value: number | null) {
  if (!value) return "-";
  if (value >= 1000000) return (value / 1000000).toFixed(1) + "M";
  if (value >= 1000) return (value / 1000).toFixed(1) + "K";
  return value.toString();
}

function EyeIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m15 17 5-5-5-5" />
      <path d="M4 18v-2a4 4 0 0 1 4-4h12" />
    </svg>
  );
}

export default function HomeClient({
  initialMarket,
  initialTrends,
  pageTitle,
}: {
  initialMarket?: Market;
  initialTrends: Trend[];
  pageTitle?: string;
}) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date());
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  async function copyHashtags(hashtags: string | null) {
    await navigator.clipboard.writeText(hashtags || "");
    alert("Hashtags copied!");
  }

  async function shareTrend(trend: Trend) {
    const shareUrl = `${window.location.origin}/video/${trend.apify_id}`;

    if (navigator.share) {
      await navigator.share({
        title: `Tikitify | #${trend.position}`,
        text: "TikTok Trends Today",
        url: shareUrl,
      });
      return;
    }

    await navigator.clipboard.writeText(shareUrl);
    alert("Link copied!");
  }

  const dateTime = formatDateTime(now);

  return (
    <main className="min-h-screen bg-black px-3 py-3 text-white">
      <header className="mb-3 grid grid-cols-3 items-center">
        <nav
          className="flex items-center justify-start gap-2"
          aria-label="Trend markets"
        >
          <Link
            href="/trending-global"
            aria-label="Global trends"
            className={`flex h-10 w-10 items-center justify-center rounded-full border text-lg transition ${
              initialMarket === "global"
                ? "border-white bg-white text-black"
                : "border-zinc-700 bg-zinc-950 text-white"
            }`}
          >
            {"\uD83C\uDF0D"}
          </Link>

          <Link
            href="/"
            aria-label="Spain trends"
            className={`flex h-10 w-10 items-center justify-center rounded-full border text-lg transition ${
              initialMarket === "spain"
                ? "border-white bg-white text-black"
                : "border-zinc-700 bg-zinc-950 text-white"
            }`}
          >
            {"\uD83C\uDDEA\uD83C\uDDF8"}
          </Link>
        </nav>

        <div className="flex justify-center">
          <Link href="/">
            <Image
              src="/logo.png"
              alt="Tikitify"
              width={160}
              height={80}
              priority
              className="h-16 w-auto cursor-pointer"
            />
          </Link>
        </div>

        <div className="flex justify-end">
          <div className="rounded-full border border-zinc-800 bg-zinc-950 px-5 py-2 text-sm font-semibold tracking-wide text-white">
            {dateTime.day.toUpperCase()}
          </div>
        </div>
      </header>

      <h1 className="sr-only">
        {pageTitle ||
          (initialMarket === "spain"
            ? "TikTok trends in Spain today"
            : "Global TikTok trends today")}
      </h1>

      {pageTitle && (
        <div className="mb-3 flex justify-center">
          <div className="rounded-full border border-zinc-800 bg-zinc-950 px-4 py-1.5 text-sm font-semibold text-zinc-200">
            {pageTitle}
          </div>
        </div>
      )}

      <div className="flex gap-4 overflow-x-auto pb-3">
        {initialTrends.length === 0 && (
          <div className="flex min-h-[420px] w-full items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-950 text-sm text-zinc-500">
            No videos found yet.
          </div>
        )}

        {initialTrends.map((trend) => {
          const embedUrl = getTikTokEmbedUrl(trend.tiktok_url);
          const hashtagNames = extractHashtagNames(trend.hashtags);

          return (
            <article
              key={trend.id || trend.apify_id}
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
                <div className="flex items-center justify-between">
                  <Link
                    href={`/video/${trend.apify_id}`}
                    className="text-base font-bold leading-none"
                  >
                    #{trend.position}
                  </Link>

                  <button
                    type="button"
                    onClick={() => shareTrend(trend)}
                    aria-label="Share video"
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-700 text-white transition hover:border-white"
                  >
                    <ShareIcon />
                  </button>
                </div>

                <p className="mt-2 truncate text-[11px] text-zinc-300">
                  {"\u266A"} {trend.audio || "Unknown audio"}
                </p>

                <p className="mt-1 min-h-[16px] truncate text-[11px] text-zinc-500">
                  {trend.author_username ? `@${trend.author_username}` : ""}
                </p>

                <div className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-zinc-300">
                  <EyeIcon />
                  {formatNumber(trend.views)}
                </div>

                <div className="mt-2 flex min-h-[34px] flex-wrap content-start gap-x-1.5 gap-y-0.5 overflow-hidden text-[11px] leading-snug text-zinc-500">
                  {hashtagNames.length > 0
                    ? hashtagNames.map((tag) => (
                        <Link
                          key={tag}
                          href={getHashtagHref(tag)}
                          className="transition hover:text-white"
                        >
                          #{tag}
                        </Link>
                      ))
                    : "No hashtags"}
                </div>

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
            </article>
          );
        })}
      </div>
    </main>
  );
}
