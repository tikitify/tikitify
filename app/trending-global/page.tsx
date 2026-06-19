import type { Metadata } from "next";
import HomeClient from "../HomeClient";
import { getTrendsByMarket } from "../../lib/trends";

export const metadata: Metadata = {
  title: "Global TikTok Trends Today | Tikitify",
  description:
    "Discover today's viral TikTok trends worldwide, updated automatically.",
  alternates: {
    canonical: "/trending-global",
  },
};

export const dynamic = "force-dynamic";

export default async function TrendingGlobalPage() {
  const trends = await getTrendsByMarket("global");

  return <HomeClient initialMarket="global" initialTrends={trends} />;
}
