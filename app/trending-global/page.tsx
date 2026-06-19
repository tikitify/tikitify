import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import HomeClient, { type Trend } from "../HomeClient";

export const metadata: Metadata = {
  title: "Global TikTok Trends Today | Tikitify",
  description:
    "Discover today's viral TikTok trends worldwide, updated automatically.",
  alternates: {
    canonical: "/trending-global",
  },
};

export const dynamic = "force-dynamic";

async function getTrends(): Promise<Trend[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data, error } = await supabase
    .from("trends")
    .select("*")
    .eq("market", "global")
    .order("position", { ascending: true });

  if (error) {
    console.error(error.message);
    return [];
  }

  return data || [];
}

export default async function TrendingGlobalPage() {
  const trends = await getTrends();

  return <HomeClient initialMarket="global" initialTrends={trends} />;
}
