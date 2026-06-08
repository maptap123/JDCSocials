"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlatformIcon } from "@/components/platform-icon";
import { PLATFORM_CONFIG } from "@/lib/platforms";
import { CheckCircle2, Download, LogIn, Globe, Info } from "lucide-react";
import type { Platform } from "@/types/database";

const PLATFORMS: Platform[] = ["facebook", "instagram", "linkedin", "houzz"];

const PLATFORM_NOTES: Record<Platform, { mode: "auto" | "clipboard"; note: string }> = {
  facebook:  { mode: "auto",      note: "Posts automatically via your logged-in session" },
  instagram: { mode: "clipboard", note: "Caption is copied to clipboard — you paste it after selecting your image" },
  linkedin:  { mode: "auto",      note: "Posts automatically via your logged-in session" },
  houzz:     { mode: "clipboard", note: "Content is copied to clipboard — paste it into Houzz manually" },
};

const STEPS = [
  {
    icon: Download,
    title: "Install the Chrome Extension",
    body: (
      <>
        <p className="text-sm text-gray-600 mb-3">
          The extension lives in the <code className="bg-gray-100 px-1 py-0.5 rounded text-xs font-mono">extension/</code> folder of this project. Load it in Chrome:
        </p>
        <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600">
          <li>Open Chrome and go to <code className="bg-gray-100 px-1 py-0.5 rounded text-xs font-mono">chrome://extensions</code></li>
          <li>Enable <strong>Developer mode</strong> (top-right toggle)</li>
          <li>Click <strong>Load unpacked</strong></li>
          <li>Select the <code className="bg-gray-100 px-1 py-0.5 rounded text-xs font-mono">extension/</code> folder from the project</li>
          <li>The <strong>JDC Socials Publisher</strong> icon appears in your toolbar</li>
        </ol>
      </>
    ),
  },
  {
    icon: LogIn,
    title: "Sign in to the Extension",
    body: (
      <p className="text-sm text-gray-600">
        Click the extension icon in Chrome and sign in with your <strong>JDC Socials</strong> email and password — the same credentials you use to log in here. The extension syncs with your scheduled posts automatically.
      </p>
    ),
  },
  {
    icon: Globe,
    title: "Stay Logged in to Each Platform",
    body: (
      <p className="text-sm text-gray-600">
        The extension posts using your existing browser sessions. Make sure you are already logged in to <strong>Facebook</strong>, <strong>Instagram</strong>, <strong>LinkedIn</strong>, and <strong>Houzz</strong> in the same Chrome profile. No developer accounts needed.
      </p>
    ),
  },
  {
    icon: CheckCircle2,
    title: "Schedule Posts from the Dashboard",
    body: (
      <p className="text-sm text-gray-600">
        Create and schedule posts from the <strong>Compose</strong> tab. The extension checks every minute and auto-publishes anything that is due. You can also trigger an immediate publish by clicking <strong>Check &amp; Publish Now</strong> in the extension popup.
      </p>
    ),
  },
];

export default function SettingsPage() {
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUser({ email: data.user.email ?? undefined });
    });
  }, [supabase]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    toast({ title: "Signed out" });
    window.location.href = "/login";
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your account and Chrome extension</p>
      </div>

      {/* Account card */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-900">{user?.email ?? "—"}</p>
            <p className="text-xs text-gray-500 mt-0.5">JDC Socials account</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleSignOut}>
            Sign out
          </Button>
        </CardContent>
      </Card>

      {/* Extension setup */}
      <h2 className="text-base font-semibold text-gray-900 mb-4">Chrome Extension Setup</h2>
      <div className="space-y-4 mb-8">
        {STEPS.map((step, i) => (
          <Card key={i}>
            <CardContent className="p-5">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center mt-0.5">
                  <step.icon className="h-4 w-4 text-indigo-600" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                      Step {i + 1}
                    </span>
                    <span className="font-semibold text-gray-900 text-sm">{step.title}</span>
                  </div>
                  {step.body}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Platform status */}
      <h2 className="text-base font-semibold text-gray-900 mb-4">Platform Posting Modes</h2>
      <div className="space-y-3 mb-8">
        {PLATFORMS.map((platform) => {
          const cfg = PLATFORM_CONFIG[platform];
          const note = PLATFORM_NOTES[platform];
          return (
            <Card key={platform}>
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className={`p-2 rounded-xl ${cfg.bgColor} border ${cfg.borderColor}`}>
                    <PlatformIcon platform={platform} className={`h-4 w-4 ${cfg.color}`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-semibold text-gray-900 text-sm">{cfg.label}</span>
                      <Badge variant={note.mode === "auto" ? "success" : "secondary"}>
                        {note.mode === "auto" ? "Auto" : "Clipboard"}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-500">{note.note}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Info note */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="p-4">
          <div className="flex gap-3">
            <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
            <p className="text-sm text-blue-700">
              <strong>How it works:</strong> The extension opens each social platform in a background tab,
              pastes your content into the post composer, and clicks Post — all using your existing logged-in
              browser session. No developer API keys or app registrations required.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
