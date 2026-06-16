import { NextResponse } from "next/server";

export const runtime = "nodejs";

const searches = [
  // España
  { keywords: ["trend españa"], location: "ES" },
  { keywords: ["viral españa"], location: "ES" },
  { keywords: ["humor españa"], location: "ES" },
  { keywords: ["comedia españa"], location: "ES" },
  { keywords: ["fútbol españa"], location: "ES" },
  { keywords: ["parati"], location: "ES" },
  { keywords: ["memes españa"], location: "ES" },
  { keywords: ["video españa"], location: "ES" },
  { keywords: ["foryou españa"], location: "ES" },
  { keywords: ["streamers españa"], location: "ES" },
  { keywords: ["música españa"], location: "ES" },
  { keywords: ["baile españa"], location: "ES" },
  { keywords: ["DIY españa"], location: "ES" },
  { keywords: ["noticias españa"], location: "ES" },
  { keywords: ["aesthetic españa"], location: "ES" },
  { keywords: ["dance españa"], location: "ES" },
  { keywords: ["2026 españa"], location: "ES" },
  { keywords: ["tips españa"], location: "ES" },
  { keywords: ["tendencia españa"], location: "ES" },
  { keywords: ["españa tiktok"], location: "ES" },

  // Global
  { keywords: ["viral"], location: "US" },
  { keywords: ["trending"], location: "US" },
  { keywords: ["fyp"], location: "US" },
  { keywords: ["funny"], location: "US" },
  { keywords: ["gaming"], location: "US" },
  { keywords: ["sports"], location: "US" },
  { keywords: ["music"], location: "US" },
  { keywords: ["memes"], location: "US" },
  { keywords: ["news"], location: "US" },
  { keywords: ["technology"], location: "US" },
  { keywords: ["ai"], location: "US" },
  { keywords: ["mrbeast"], location: "US" },
  { keywords: ["youtube"], location: "US" },
  { keywords: ["football"], location: "US" },
  { keywords: ["nba"], location: "US" },
  { keywords: ["movies"], location: "US" },
  { keywords: ["anime"], location: "US" },
  { keywords: ["streamers"], location: "US" },
  { keywords: ["podcast"], location: "US" },
  { keywords: ["celebrities"], location: "US" },
];

export async function GET() {
  const token = process.env.APIFY_TOKEN;

  if (!token) {
    return NextResponse.json(
      { error: "Missing APIFY_TOKEN" },
      { status: 500 }
    );
  }

  const results = [];

  for (const search of searches) {
    const response = await fetch(
      `https://api.apify.com/v2/actors/apidojo~tiktok-scraper/runs?token=${token}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dateRange: "THIS_WEEK",
          includeSearchKeywords: true,
          keywords: search.keywords,
          location: search.location,
          maxItems: 200,
          sortType: "MOST_LIKED",
        }),
      }
    );

    const data = await response.json();
    results.push(data);
  }

  return NextResponse.json({
    ok: true,
    launched: results.length,
    searches: searches.length,
  });
}