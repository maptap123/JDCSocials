"use client";
import { useState, useEffect } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
} from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PlatformIcon } from "@/components/platform-icon";
import { PLATFORM_CONFIG } from "@/lib/platforms";
import { ChevronLeft, ChevronRight, PenSquare, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import type { Platform, PostStatus } from "@/types/database";

interface Post {
  id: string;
  content: string;
  platforms: Platform[];
  status: PostStatus;
  scheduled_at: string | null;
  published_at: string | null;
}

const statusColors: Record<PostStatus, string> = {
  draft: "bg-gray-400",
  scheduled: "bg-yellow-400",
  published: "bg-green-500",
  failed: "bg-red-500",
};

export default function CalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [posts, setPosts] = useState<Post[]>([]);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const supabase = createClient();

  useEffect(() => {
    async function loadPosts() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const from = startOfMonth(currentMonth).toISOString();
      const to = endOfMonth(currentMonth).toISOString();
      const { data } = await supabase
        .from("posts")
        .select("id, content, platforms, status, scheduled_at, published_at")
        .eq("user_id", user.id)
        .or(`scheduled_at.gte.${from},published_at.gte.${from}`)
        .or(`scheduled_at.lte.${to},published_at.lte.${to}`);
      setPosts(data ?? []);
    }
    loadPosts();
  }, [currentMonth, supabase]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart);
  const calEnd = endOfWeek(monthEnd);
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  function getPostsForDay(day: Date) {
    return posts.filter((p) => {
      const date = p.scheduled_at ?? p.published_at;
      return date && isSameDay(new Date(date), day);
    });
  }

  const selectedDayPosts = selectedDay ? getPostsForDay(selectedDay) : [];

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Calendar</h1>
          <p className="text-sm text-gray-500 mt-1">View and manage your scheduled posts</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/compose">
            <PenSquare className="h-4 w-4" />
            Create Post
          </Link>
        </Button>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-gray-900">
                  {format(currentMonth, "MMMM yyyy")}
                </h2>
                <div className="flex gap-1">
                  <Button variant="outline" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setCurrentMonth(new Date())}>
                    Today
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-7 mb-2">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <div key={d} className="text-center text-xs font-medium text-gray-400 py-2">{d}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 border-l border-t border-gray-100">
                {days.map((day) => {
                  const dayPosts = getPostsForDay(day);
                  const isToday = isSameDay(day, new Date());
                  const isSelected = selectedDay && isSameDay(day, selectedDay);
                  const inMonth = isSameMonth(day, currentMonth);

                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => setSelectedDay(isSameDay(day, selectedDay!) ? null : day)}
                      className={cn(
                        "min-h-[80px] p-1.5 border-r border-b border-gray-100 text-left transition-colors",
                        !inMonth && "bg-gray-50",
                        isSelected && "bg-indigo-50",
                        inMonth && !isSelected && "hover:bg-gray-50"
                      )}
                    >
                      <span className={cn(
                        "inline-flex items-center justify-center h-6 w-6 rounded-full text-sm mb-1",
                        isToday ? "bg-indigo-600 text-white font-semibold" : inMonth ? "text-gray-900" : "text-gray-300"
                      )}>
                        {format(day, "d")}
                      </span>
                      <div className="space-y-0.5">
                        {dayPosts.slice(0, 3).map((p) => (
                          <div key={p.id} className="flex items-center gap-1">
                            <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", statusColors[p.status])} />
                            <span className="text-xs text-gray-600 truncate">{p.content.slice(0, 20)}</span>
                          </div>
                        ))}
                        {dayPosts.length > 3 && (
                          <span className="text-xs text-gray-400">+{dayPosts.length - 3} more</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          <div className="mb-4 flex gap-3">
            {(["scheduled", "published", "draft", "failed"] as PostStatus[]).map((s) => (
              <div key={s} className="flex items-center gap-1.5">
                <span className={cn("h-2 w-2 rounded-full", statusColors[s])} />
                <span className="text-xs text-gray-500 capitalize">{s}</span>
              </div>
            ))}
          </div>

          {selectedDay ? (
            <Card>
              <CardContent className="p-4">
                <h3 className="font-semibold text-gray-900 mb-3">
                  {format(selectedDay, "MMMM d, yyyy")}
                </h3>
                {selectedDayPosts.length === 0 ? (
                  <div className="text-center py-6">
                    <p className="text-sm text-gray-500 mb-3">No posts this day</p>
                    <Button size="sm" asChild>
                      <Link href="/dashboard/compose">Schedule a post</Link>
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedDayPosts.map((post) => (
                      <div key={post.id} className="rounded-lg border border-gray-100 p-3">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <Badge variant={post.status === "published" ? "success" : post.status === "failed" ? "destructive" : post.status === "scheduled" ? "warning" : "secondary"}>
                            {post.status}
                          </Badge>
                          <div className="flex items-center gap-1">
                            {(post.scheduled_at ?? post.published_at) && (
                              <span className="text-xs text-gray-400">
                                {format(new Date((post.scheduled_at ?? post.published_at)!), "h:mm a")}
                              </span>
                            )}
                            <Button variant="ghost" size="icon" className="h-6 w-6" asChild>
                              <Link href={`/dashboard/compose/${post.id}`}>
                                <Pencil className="h-3 w-3" />
                              </Link>
                            </Button>
                          </div>
                        </div>
                        <p className="text-sm text-gray-700 line-clamp-3">{post.content}</p>
                        <div className="flex gap-1 mt-2">
                          {post.platforms.map((p) => (
                            <PlatformIcon key={p} platform={p} className={`h-4 w-4 ${PLATFORM_CONFIG[p].color}`} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-6 text-center">
                <p className="text-sm text-gray-500">Click a day to see its posts</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
