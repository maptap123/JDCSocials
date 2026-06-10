"use client";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlatformIcon } from "@/components/platform-icon";
import { PLATFORM_CONFIG } from "@/lib/platforms";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Info,
  KeyRound,
  RefreshCw,
  Rocket,
  Wrench,
  XCircle,
  Zap,
} from "lucide-react";
import type { Platform } from "@/types/database";

const PLATFORMS: Platform[] = ["facebook", "instagram", "linkedin", "houzz"];
const ZAPIER_PLATFORMS: Exclude<Platform, "houzz">[] = ["facebook", "instagram", "linkedin"];

const PLATFORM_NOTES: Record<Platform, { mode: "auto" | "manual"; note: string }> = {
  facebook:  { mode: "auto",   note: "Posts to your Facebook Page automatically via Zapier" },
  instagram: { mode: "auto",   note: "Publishes photo posts via Zapier — requires an image" },
  linkedin:  { mode: "auto",   note: "Posts to your LinkedIn page automatically via Zapier" },
  houzz:     { mode: "manual", note: "No public API — compose here, then post manually on Houzz" },
};

const STEPS = [
  {
    icon: Zap,
    title: "Create a Zapier MCP Server",
    body: (
      <>
        <p className="text-sm text-gray-600 mb-2">
          Go to{" "}
          <a href="https://mcp.zapier.com" target="_blank" rel="noreferrer" className="text-indigo-600 underline inline-flex items-center gap-1">
            mcp.zapier.com <ExternalLink className="h-3 w-3" />
          </a>{" "}
          and sign in with your Zapier account.
        </p>
        <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600">
          <li>Click <strong>+ New MCP Server</strong></li>
          <li>Choose <strong>Other</strong> as the client</li>
          <li>Name it (e.g. <em>JDC Socials</em>)</li>
        </ol>
      </>
    ),
  },
  {
    icon: Wrench,
    title: "Add Posting Tools",
    body: (
      <>
        <p className="text-sm text-gray-600 mb-2">
          In your server&apos;s <strong>Tools</strong> tab, add these actions and connect each account when prompted:
        </p>
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
          <li><strong>Facebook Pages</strong> → Create Page Post <em>and</em> Create Page Photo</li>
          <li><strong>Instagram for Business</strong> → Publish Photo</li>
          <li><strong>LinkedIn</strong> → Create Company Update (or Create Share Update for a personal profile)</li>
        </ul>
        <p className="text-sm text-gray-600 mt-2">
          When configuring each tool, <strong>select your business Page</strong> in the page/account field and leave the
          text fields set to <strong>&quot;Have AI guess values&quot;</strong>.
        </p>
      </>
    ),
  },
  {
    icon: KeyRound,
    title: "Copy the Server URL into the App",
    body: (
      <>
        <p className="text-sm text-gray-600 mb-2">
          In the server&apos;s <strong>Connect</strong> tab, copy the <strong>Server URL</strong> (Streamable HTTP). Then:
        </p>
        <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600">
          <li>In Vercel: <strong>Project → Settings → Environment Variables</strong>, add <code className="bg-gray-100 px-1 py-0.5 rounded text-xs font-mono">ZAPIER_MCP_URL</code> with that URL</li>
          <li>For local dev, add the same line to <code className="bg-gray-100 px-1 py-0.5 rounded text-xs font-mono">.env.local</code></li>
          <li>Redeploy the app</li>
        </ol>
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5 mt-2">
          Treat the URL like a password — anyone who has it can post as you.
        </p>
      </>
    ),
  },
  {
    icon: Rocket,
    title: "Verify & Go",
    body: (
      <p className="text-sm text-gray-600">
        Refresh the connection status above — it should turn green with all three platforms covered. Then schedule a
        test post a couple of minutes out from the <strong>Compose</strong> tab and watch it publish.
      </p>
    ),
  },
];

interface ZapierStatus {
  configured: boolean;
  connected: boolean;
  error?: string;
  tools: string[];
  coverage: Record<Exclude<Platform, "houzz">, string | null>;
}

export default function SettingsPage() {
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const [status, setStatus] = useState<ZapierStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const supabase = createClient();

  const checkStatus = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch("/api/zapier/status");
      if (!res.ok) throw new Error(`Status check failed (${res.status})`);
      setStatus((await res.json()) as ZapierStatus);
    } catch (err) {
      setStatus({
        configured: true,
        connected: false,
        error: err instanceof Error ? err.message : "Status check failed",
        tools: [],
        coverage: { facebook: null, instagram: null, linkedin: null },
      });
    }
    setChecking(false);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUser({ email: data.user.email ?? undefined });
    });
    checkStatus();
  }, [supabase, checkStatus]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    toast({ title: "Signed out" });
    window.location.href = "/login";
  }

  const allCovered =
    status?.connected && ZAPIER_PLATFORMS.every((p) => status.coverage[p]);

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your account and Zapier connection</p>
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

      {/* Zapier connection status */}
      <h2 className="text-base font-semibold text-gray-900 mb-4">Zapier Connection</h2>
      <Card className="mb-8">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-orange-500" />
            <CardTitle className="text-base">Posting Engine</CardTitle>
          </div>
          <Button variant="outline" size="sm" onClick={checkStatus} disabled={checking}>
            <RefreshCw className={`h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} />
            {checking ? "Checking…" : "Refresh"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {checking && !status ? (
            <p className="text-sm text-gray-500">Checking your Zapier connection…</p>
          ) : !status?.configured ? (
            <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800">Not configured yet</p>
                <p className="text-sm text-amber-700 mt-0.5">
                  Add your Zapier MCP server URL as the <code className="bg-amber-100 px-1 py-0.5 rounded text-xs font-mono">ZAPIER_MCP_URL</code>{" "}
                  environment variable, then redeploy. Follow the steps below.
                </p>
              </div>
            </div>
          ) : !status.connected ? (
            <div className="flex gap-3 rounded-lg border border-red-200 bg-red-50 p-3">
              <XCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-800">Can&apos;t reach your Zapier MCP server</p>
                <p className="text-sm text-red-700 mt-0.5 break-all">{status.error}</p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex gap-3 rounded-lg border border-green-200 bg-green-50 p-3">
                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                <p className="text-sm text-green-800">
                  Connected — {status.tools.length} tool{status.tools.length === 1 ? "" : "s"} available on your Zapier MCP server.
                  {!allCovered && " Some platforms still need a posting tool (see below)."}
                </p>
              </div>
              <div className="space-y-2">
                {ZAPIER_PLATFORMS.map((p) => {
                  const cfg = PLATFORM_CONFIG[p];
                  const tool = status.coverage[p];
                  return (
                    <div key={p} className="flex items-center gap-3 rounded-lg border border-gray-100 px-3 py-2">
                      <div className={`p-1.5 rounded-lg ${cfg.bgColor} border ${cfg.borderColor}`}>
                        <PlatformIcon platform={p} className={`h-4 w-4 ${cfg.color}`} />
                      </div>
                      <span className="text-sm font-medium text-gray-900">{cfg.label}</span>
                      {tool ? (
                        <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-green-700">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Ready <span className="text-gray-400 font-mono">({tool})</span>
                        </span>
                      ) : (
                        <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-red-600">
                          <XCircle className="h-3.5 w-3.5" />
                          No posting tool found — add one in Zapier
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Setup steps */}
      <h2 className="text-base font-semibold text-gray-900 mb-4">Zapier Setup</h2>
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
                        {note.mode === "auto" ? "Auto" : "Manual"}
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
              <strong>How it works:</strong> Every minute, a scheduler checks for due posts and sends them to your
              Zapier MCP server, which publishes through each platform&apos;s official API. Page targeting (which
              Facebook Page or LinkedIn company to post as) is configured on the Zapier side when you add each tool. No
              browser extension, no fragile screen automation.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
