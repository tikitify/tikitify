"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
  extractHashtagNames,
  type Market,
  type Trend,
} from "../lib/hashtags";
import { getTikTokEmbedUrl } from "../lib/tiktok";

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

function getRankBadgeClass(position: number) {
  const baseClass =
    "flex h-7 w-7 items-center justify-center rounded-full border text-base font-black leading-none shadow-lg transition";

  if (position === 1) {
    return `${baseClass} border-[#C9A227] bg-[#C9A227] text-black`;
  }

  if (position === 2) {
    return `${baseClass} border-[#C0C0C0] bg-[#C0C0C0] text-black`;
  }

  if (position === 3) {
    return `${baseClass} border-[#B87333] bg-[#B87333] text-white`;
  }

  return "text-base font-bold leading-none";
}

function RevealTopCover({ rank }: { rank: number }) {
  const [revealed, setRevealed] = useState(false);
  const [dissolving, setDissolving] = useState(false);

  const color =
    rank === 1 ? "#C9A227" : rank === 2 ? "#C0C0C0" : "#B87333";

  const storageKey = `tikitify_reveal_top_${rank}`;
  const revealDuration = 30 * 60 * 1000;

  useEffect(() => {
    const savedUntil = localStorage.getItem(storageKey);

    if (!savedUntil) return;

    const savedUntilNumber = Number(savedUntil);

    if (Date.now() < savedUntilNumber) {
      setRevealed(true);
    } else {
      localStorage.removeItem(storageKey);
    }
  }, [storageKey]);

  function handleClick() {
    const revealUntil = Date.now() + revealDuration;

    localStorage.setItem(storageKey, String(revealUntil));

    setDissolving(true);

    setTimeout(() => {
      setRevealed(true);
    }, 900);
  }

  if (revealed) return null;

  return (
    <>
      <style jsx>{`
        @keyframes tap {
          0% {
            transform: translateY(0) scale(1);
            opacity: 0;
          }

          15% {
            opacity: 1;
          }

          40% {
            transform: translateY(10px) scale(0.9);
          }

          60% {
            transform: translateY(0) scale(1);
          }

          85% {
            opacity: 1;
          }

          100% {
            opacity: 0;
          }
        }

        @keyframes pulseTap {
          0% {
            transform: scale(0.5);
            opacity: 0;
          }

          30% {
            opacity: 1;
          }

          100% {
            transform: scale(2);
            opacity: 0;
          }
        }

        .animate-tap {
          animation: tap 2.5s infinite;
        }

        .tap-indicator {
          position: absolute;
          bottom: 95px;
          width: 60px;
          height: 60px;
          border: 2px solid currentColor;
          border-radius: 9999px;
          animation: pulseTap 2.5s infinite;
        }
      `}</style>

      <button
        type="button"
        onClick={handleClick}
        style={{
          boxShadow: `inset 0 0 0 3px ${color}`,
        }}
        className={`absolute inset-0 z-20 flex flex-col items-center justify-center rounded-2xl bg-black transition-all duration-[900ms] ${
          dissolving
            ? "opacity-0 blur-[14px] scale-[1.08]"
            : "opacity-100 blur-0 scale-100"
        }`}
      >
        <div
          className="text-3xl font-black uppercase tracking-widest"
          style={{ color }}
        >
          Top #{rank}
        </div>

        <div className="tap-indicator" style={{ color }} />

        <div
          className="absolute bottom-20 animate-tap text-6xl"
          style={{
            filter: "grayscale(1) brightness(5)",
          }}
        >
          👆
        </div>
      </button>
    </>
  );
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
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<(HTMLElement | null)[]>([]);
  const hasCenteredInitialCard = useRef(false);
  const [activeIndex, setActiveIndex] = useState(3);

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

  const uniqueTrends = Array.from(
    new Map(initialTrends.map((trend) => [trend.apify_id, trend])).values()
  );

  useEffect(() => {
    if (hasCenteredInitialCard.current) return;
    if (uniqueTrends.length < 4) return;
    if (window.innerWidth >= 640) return;

    hasCenteredInitialCard.current = true;

    setTimeout(() => {
      cardRefs.current[3]?.scrollIntoView({
        behavior: "auto",
        inline: "center",
        block: "nearest",
      });
    }, 100);
  }, [uniqueTrends.length]);

  function handleCarouselScroll() {
    const container = carouselRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const containerCenter = containerRect.left + containerRect.width / 2;

    let closestIndex = 0;
    let closestDistance = Infinity;

    cardRefs.current.forEach((card, index) => {
      if (!card) return;

      const cardRect = card.getBoundingClientRect();
      const cardCenter = cardRect.left + cardRect.width / 2;
      const distance = Math.abs(containerCenter - cardCenter);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });

    setActiveIndex(closestIndex);
  }

  function scrollToCard(index: number) {
    cardRefs.current[index]?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }

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

      <div
        ref={carouselRef}
        onScroll={handleCarouselScroll}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-3"
      >
        {uniqueTrends.length === 0 && (
          <div className="flex min-h-[420px] w-full items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-950 text-sm text-zinc-500">
            No videos found yet.
          </div>
        )}

        {uniqueTrends.map((trend, index) => {
          const embedUrl = getTikTokEmbedUrl(trend.tiktok_url);
          const hashtagNames = extractHashtagNames(trend.hashtags);

          return (
            <article
              key={trend.id || trend.apify_id}
              ref={(element) => {
                cardRefs.current[index] = element;
              }}
              className="relative flex min-w-[82vw] max-w-[82vw] snap-center flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 sm:min-w-[280px] sm:max-w-[280px]"
            >
              {trend.position <= 3 && (
                <RevealTopCover rank={trend.position} />
              )}

              <div className="h-[330px] bg-black">
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

              <div className="flex min-h-[180px] flex-1 flex-col p-3">
                <div className="flex items-center justify-between">
                  <Link
                    href={`/video/${trend.apify_id}`}
                    className={getRankBadgeClass(trend.position)}
                    aria-label={`Trend position ${trend.position}`}
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

                <div className="mt-2 h-[52px] overflow-hidden text-[11px] leading-snug text-zinc-500">
                  {hashtagNames.length > 0
                    ? hashtagNames.map((tag) => (
                        <span key={tag}>#{tag} </span>
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

      {uniqueTrends.length > 0 && (
        <div className="mt-1 flex justify-center gap-1.5 sm:hidden">
          {uniqueTrends.slice(0, 10).map((trend, index) => (
            <button
              key={trend.id || trend.apify_id}
              type="button"
              onClick={() => scrollToCard(index)}
              aria-label={`Go to Top ${index + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                activeIndex === index ? "w-5 bg-white" : "w-1.5 bg-white/35"
              }`}
            />
          ))}
        </div>
      )}
    </main>
  );
}