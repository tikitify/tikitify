import { NextResponse } from "next/server";

export const runtime = "nodejs";

const searches = [
  { keywords: ["funny"], location: "US" },
  { keywords: ["gaming"], location: "US" },
  { keywords: ["sports"], location: "US" },
  { keywords: ["music"], location: "US" },
  { keywords: ["viral"], location: "US" },

  { keywords: ["trend españa"], location: "ES" },
  { keywords: ["humor españa"], location: "ES" },
  { keywords: ["comedia españa"], location: "ES" },
  { keywords: ["fútbol españa"], location: "ES" },
  { keywords: ["streamers españa"], location: "ES" },
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
  });
}