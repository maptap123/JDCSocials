"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlatformIcon } from "@/components/platform-icon";
import { PLATFORM_CONFIG, ALL_PLATFORMS } from "@/lib/platforms";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { format, subDays, eachDayOfInterval } from "date-fns";
import { TrendingUp, Calendar, CheckCircle, Clock } from "lucide-react";
import type { Platform, PostStatus } from "@/types/database";

interface Post {
  id: string;
  platforms: Platform[];
  status: PostStatus;
  created_at: string;
  scheduled_at: string | null;
  published_at: string | null;
}

export default function AnalyticsPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("posts")
        .select("id, platforms, status, created_at, scheduled_at, published_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });
      setPosts(data ?? []);
      setLoading(false);
    }
    load();
  }, [supabase]);

  const total = posts.length;
  const published = posts.filter((p) => p.status === "published").length;
  const scheduled = posts.filter((p) => p.status === "scheduled").length;
  const drafts = posts.filter((p) => p.status === "draft").length;

  const last30 = eachDayOfInterval({ start: subDays(new Date(), 29), end: new Date() });
  const activityData = last30.map((day) => ({
    date: format(day, "MMM d"),
    posts: posts.filter((p) => {
      const d = p.published_at ?? p.scheduled_at ?? p.created_at;
      return format(new Date(d), "yyyy-MM-dd") === format(day, "yyyy-MM-dd");
    }).length,
  }));

  const platformCounts = ALL_PLATFORMS.map((p) => ({
    name: PLATFORM_CONFIG[p].label,
    value: posts.filter((post) => post.platforms.includes(p)).length,
    platform: p,
  })).filter((p) => p.value > 0);

  const PIE_COLORS = ["#6366f1", "#ec4899", "#0ea5e9", "#22c55e"];

  if (loading) {
    return (
      <div className="p-8 max-w-6xl mx-auto">
        <div className="h-8 w-48 bg-gray-100 rounded animate-pulse mb-8" />
        <div className="grid grid-cols-4 gap-4 mb-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="text-sm text-gray-500 mt-1">Overview of your posting activity</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Total Posts", value: total, icon: TrendingUp, color: "text-indigo-600" },
          { label: "Published", value: published, icon: CheckCircle, color: "text-green-600" },
          { label: "Scheduled", value: scheduled, icon: Clock, color: "text-yellow-600" },
          { label: "Drafts", value: drafts, icon: Calendar, color: "text-gray-600" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">{label}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
                </div>
                <Icon className={`h-8 w-8 ${color} opacity-80`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Posts Over Last 30 Days</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={activityData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval={4} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }} />
                  <Bar dataKey="posts" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Posts by Platform</CardTitle>
          </CardHeader>
          <CardContent>
            {platformCounts.length === 0 ? (
              <div className="flex items-center justify-center h-[220px] text-gray-400 text-sm">
                No data yet
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={150}>
                  <PieChart>
                    <Pie data={platformCounts} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" paddingAngle={3}>
                      {platformCounts.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb" }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2 mt-2">
                  {platformCounts.map((p, i) => (
                    <div key={p.platform} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <PlatformIcon platform={p.platform} className={`h-3.5 w-3.5 ${PLATFORM_CONFIG[p.platform].color}`} />
                        <span className="text-sm text-gray-600">{p.name}</span>
                      </div>
                      <Badge variant="secondary">{p.value}</Badge>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Platform Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {ALL_PLATFORMS.map((p) => {
              const count = posts.filter((post) => post.platforms.includes(p)).length;
              const cfg = PLATFORM_CONFIG[p];
              return (
                <div key={p} className={`rounded-xl p-4 ${cfg.bgColor} border ${cfg.borderColor}`}>
                  <PlatformIcon platform={p} className={`h-6 w-6 ${cfg.color} mb-3`} />
                  <p className="text-2xl font-bold text-gray-900">{count}</p>
                  <p className="text-sm text-gray-600">{cfg.label}</p>
                  {p === "houzz" && <p className="text-xs text-gray-400 mt-1">API coming soon</p>}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
