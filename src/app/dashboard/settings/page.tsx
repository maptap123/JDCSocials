"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlatformIcon } from "@/components/platform-icon";
import { PLATFORM_CONFIG } from "@/lib/platforms";
import { ExternalLink, Trash2, AlertCircle } from "lucide-react";
import type { Platform } from "@/types/database";

interface ConnectedAccount {
  id: string;
  platform: Platform;
  account_name: string;
  page_name: string | null;
  is_active: boolean;
  token_expires_at: string | null;
}

const PLATFORM_OAUTH_INFO: Record<Platform, { authUrl: string; docs: string; description: string; available: boolean }> = {
  facebook: {
    authUrl: "/api/auth/facebook",
    docs: "https://developers.facebook.com/docs/facebook-login",
    description: "Post to Facebook Pages and groups",
    available: true,
  },
  instagram: {
    authUrl: "/api/auth/instagram",
    docs: "https://developers.facebook.com/docs/instagram-api",
    description: "Post photos and videos to Instagram Business accounts",
    available: true,
  },
  linkedin: {
    authUrl: "/api/auth/linkedin",
    docs: "https://learn.microsoft.com/en-us/linkedin/marketing/",
    description: "Post to your LinkedIn Company Page",
    available: true,
  },
  houzz: {
    authUrl: "#",
    docs: "https://www.houzz.com",
    description: "Houzz does not currently offer a public posting API",
    available: false,
  },
};

export default function SettingsPage() {
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("connected_accounts")
        .select("id, platform, account_name, page_name, is_active, token_expires_at")
        .eq("user_id", user.id);
      setAccounts(data ?? []);
      setLoading(false);
    }
    load();
  }, [supabase]);

  async function disconnect(id: string, platform: Platform) {
    await supabase.from("connected_accounts").delete().eq("id", id);
    setAccounts((prev) => prev.filter((a) => a.id !== id));
    toast({ title: `${PLATFORM_CONFIG[platform].label} disconnected` });
  }

  function connect(platform: Platform) {
    const info = PLATFORM_OAUTH_INFO[platform];
    if (!info.available) return;
    window.location.href = info.authUrl;
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your connected social media accounts</p>
      </div>

      <div className="space-y-4">
        <h2 className="text-base font-semibold text-gray-900">Connected Accounts</h2>

        {(["facebook", "instagram", "linkedin", "houzz"] as Platform[]).map((platform) => {
          const cfg = PLATFORM_CONFIG[platform];
          const info = PLATFORM_OAUTH_INFO[platform];
          const connected = accounts.find((a) => a.platform === platform);

          return (
            <Card key={platform}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className={`p-2.5 rounded-xl ${cfg.bgColor} border ${cfg.borderColor} mt-0.5`}>
                      <PlatformIcon platform={platform} className={`h-5 w-5 ${cfg.color}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-gray-900">{cfg.label}</span>
                        {connected ? (
                          <Badge variant="success">Connected</Badge>
                        ) : !info.available ? (
                          <Badge variant="secondary">Coming Soon</Badge>
                        ) : null}
                      </div>
                      <p className="text-sm text-gray-500">{info.description}</p>
                      {connected && (
                        <p className="text-sm text-gray-700 mt-1">
                          <span className="font-medium">{connected.account_name}</span>
                          {connected.page_name && <span className="text-gray-500"> · {connected.page_name}</span>}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {!info.available ? (
                      <Button size="sm" variant="outline" disabled>
                        <AlertCircle className="h-4 w-4" />
                        No API
                      </Button>
                    ) : connected ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 border-red-200 hover:bg-red-50"
                        onClick={() => disconnect(connected.id, platform)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Disconnect
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => connect(platform)}>
                        Connect
                      </Button>
                    )}
                    {info.available && (
                      <Button size="sm" variant="ghost" asChild>
                        <a href={info.docs} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="mt-8 border-amber-200 bg-amber-50">
        <CardHeader>
          <CardTitle className="text-base text-amber-800">Setup Required</CardTitle>
          <CardDescription className="text-amber-700">
            To connect social media accounts, you need to create developer apps on each platform and add your credentials to <code className="bg-amber-100 px-1 py-0.5 rounded text-xs">.env.local</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-amber-700">
          <p><strong>Facebook & Instagram:</strong> Create an app at <a href="https://developers.facebook.com" className="underline" target="_blank" rel="noreferrer">developers.facebook.com</a> → add FACEBOOK_APP_ID and FACEBOOK_APP_SECRET</p>
          <p><strong>LinkedIn:</strong> Create an app at <a href="https://developer.linkedin.com" className="underline" target="_blank" rel="noreferrer">developer.linkedin.com</a> → add LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET</p>
        </CardContent>
      </Card>
    </div>
  );
}
