import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PenSquare, Clock, CheckCircle, AlertCircle, TrendingUp, Pencil } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { PlatformIcon } from "@/components/platform-icon";
import { PLATFORM_CONFIG } from "@/lib/platforms";
import type { Platform, PostStatus, PostRow, ConnectedAccountRow } from "@/types/database";

const statusConfig: Record<PostStatus, { label: string; variant: "default" | "secondary" | "success" | "destructive" | "warning" }> = {
  draft: { label: "Draft", variant: "secondary" },
  scheduled: { label: "Scheduled", variant: "warning" },
  published: { label: "Published", variant: "success" },
  failed: { label: "Failed", variant: "destructive" },
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: postsData } = await supabase
    .from("posts")
    .select("*")
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false })
    .limit(10);
  const posts = (postsData ?? []) as PostRow[];

  const { data: accountsData } = await supabase
    .from("connected_accounts")
    .select("platform, account_name, is_active")
    .eq("user_id", user!.id)
    .eq("is_active", true);
  const accounts = (accountsData ?? []) as Pick<ConnectedAccountRow, "platform" | "account_name" | "is_active">[];

  const stats = {
    total: posts.length,
    scheduled: posts.filter((p) => p.status === "scheduled").length,
    published: posts.filter((p) => p.status === "published").length,
    failed: posts.filter((p) => p.status === "failed").length,
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">{format(new Date(), "EEEE, MMMM d, yyyy")}</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/compose">
            <PenSquare className="h-4 w-4" />
            Create Post
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Total Posts", value: stats.total, icon: TrendingUp, color: "text-indigo-600" },
          { label: "Scheduled", value: stats.scheduled, icon: Clock, color: "text-yellow-600" },
          { label: "Published", value: stats.published, icon: CheckCircle, color: "text-green-600" },
          { label: "Failed", value: stats.failed, icon: AlertCircle, color: "text-red-600" },
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

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Recent Posts</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/dashboard/calendar">View all</Link>
              </Button>
            </CardHeader>
            <CardContent className="px-0">
              {posts.length === 0 ? (
                <div className="text-center py-12 px-6">
                  <PenSquare className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 text-sm">No posts yet</p>
                  <Button size="sm" className="mt-4" asChild>
                    <Link href="/dashboard/compose">Create your first post</Link>
                  </Button>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {posts.map((post) => {
                    const status = statusConfig[post.status];
                    return (
                      <div key={post.id} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-900 line-clamp-2">{post.content}</p>
                            <div className="flex items-center gap-2 mt-2">
                              <div className="flex gap-1">
                                {post.platforms.map((p) => (
                                  <PlatformIcon key={p} platform={p} className={`h-4 w-4 ${PLATFORM_CONFIG[p].color}`} />
                                ))}
                              </div>
                              {post.scheduled_at && (
                                <span className="text-xs text-gray-400">
                                  {format(new Date(post.scheduled_at), "MMM d, h:mm a")}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge variant={status.variant}>{status.label}</Badge>
                            <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                              <Link href={`/dashboard/compose/${post.id}`}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Link>
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Connected Accounts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {accounts.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-sm text-gray-500 mb-3">No accounts connected</p>
                  <Button size="sm" variant="outline" asChild>
                    <Link href="/dashboard/settings">Connect accounts</Link>
                  </Button>
                </div>
              ) : (
                <>
                  {accounts.map((acc) => (
                    <div key={acc.platform} className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${PLATFORM_CONFIG[acc.platform as Platform].bgColor}`}>
                        <PlatformIcon platform={acc.platform as Platform} className={`h-4 w-4 ${PLATFORM_CONFIG[acc.platform as Platform].color}`} />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{acc.account_name}</p>
                        <p className="text-xs text-gray-500 capitalize">{acc.platform}</p>
                      </div>
                      <div className="ml-auto h-2 w-2 rounded-full bg-green-500" />
                    </div>
                  ))}
                  <Button size="sm" variant="outline" className="w-full mt-2" asChild>
                    <Link href="/dashboard/settings">Manage accounts</Link>
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
