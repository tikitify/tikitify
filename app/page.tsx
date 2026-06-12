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
        console.error("Error loading trends:", error);
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

  return (
    <main className="min-h-screen bg-black text-white p-6">
      <h1 className="text-4xl font-bold mb-2">Tikitify</h1>

      <p className="text-gray-400 mb-8">TikTok Trends Today</p>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {trends.map((trend) => (
          <div
            key={trend.id}
            className="min-w-[220px] bg-zinc-900 rounded-xl p-4"
          >
            <img
              src={trend.image_url}
              alt={trend.audio}
              className="aspect-[9/16] w-full object-cover rounded-lg mb-3"
            />

            <h2 className="text-xl font-bold">#{trend.position}</h2>

            <p className="text-sm text-gray-300 mt-2">🎵 {trend.audio}</p>

            <p className="text-sm text-gray-500 mt-1">{trend.hashtags}</p>

            <button
              onClick={() => copyHashtags(trend.hashtags)}
              className="mt-4 w-full rounded-lg bg-white text-black py-2 text-sm font-semibold"
            >
              Copy hashtags
            </button>
          </div>
        ))}
      </div>
    </main>
  );
}