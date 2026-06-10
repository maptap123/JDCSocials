"use client";
import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useDropzone } from "react-dropzone";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlatformIcon } from "@/components/platform-icon";
import { PLATFORM_CONFIG, ALL_PLATFORMS } from "@/lib/platforms";
import type { Platform, MediaFileRow } from "@/types/database";
import { Upload, X, Calendar, Send, FileText, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface UploadedFile {
  id: string;
  name: string;
  url: string;
  type: string;
  path: string;
}

export default function ComposePage() {
  const router = useRouter();
  const supabase = createClient();

  const [content, setContent] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([]);
  const [scheduledAt, setScheduledAt] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const togglePlatform = (p: Platform) => {
    setSelectedPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  };

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      setUploading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      for (const file of acceptedFiles) {
        const path = `${user.id}/${Date.now()}-${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("media")
          .upload(path, file);

        if (uploadError) {
          toast({ title: "Upload failed", description: uploadError.message, variant: "destructive" });
          continue;
        }

        const { data: urlData } = supabase.storage.from("media").getPublicUrl(path);
        const publicUrl = urlData.publicUrl;

        const { data: mediaData } = await supabase.from("media_files").insert({
          user_id: user.id,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type,
          storage_path: path,
          public_url: publicUrl,
        }).select().single();
        const mediaRow = mediaData as MediaFileRow | null;

        if (mediaRow) {
          setUploadedFiles((prev) => [...prev, { id: mediaRow.id, name: file.name, url: publicUrl, type: file.type, path }]);
        }
      }
      setUploading(false);
    },
    [supabase]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [], "video/*": [] },
    maxFiles: 10,
    maxSize: 50 * 1024 * 1024,
  });

  function removeFile(id: string) {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== id));
  }

  async function handleSave(status: "draft" | "scheduled" | "published") {
    if (!content.trim()) {
      toast({ title: "Content required", description: "Please write something for your post.", variant: "destructive" });
      return;
    }
    if (selectedPlatforms.length === 0) {
      toast({ title: "Select a platform", description: "Choose at least one platform.", variant: "destructive" });
      return;
    }
    if (status === "scheduled" && !scheduledAt) {
      toast({ title: "Schedule time required", description: "Pick a date and time to schedule.", variant: "destructive" });
      return;
    }

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: inserted, error } = await supabase
      .from("posts")
      .insert({
        user_id: user.id,
        content,
        platforms: selectedPlatforms,
        // "Publish Now" saves as draft first, then publishes via Zapier below.
        status: status === "published" ? "draft" : status,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        media_urls: uploadedFiles.map((f) => f.url),
        platform_post_ids: {},
        error_message: null,
        published_at: null,
      })
      .select("id")
      .single();

    if (error || !inserted) {
      toast({ title: "Failed to save", description: error?.message, variant: "destructive" });
      setSaving(false);
      return;
    }

    if (status === "published") {
      const res = await fetch("/api/posts/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: inserted.id }),
      });
      const result = await res.json().catch(() => ({}));
      if (res.ok && result.anySuccess) {
        toast({
          title: "Post published!",
          description: result.errors?.length ? `Some platforms failed: ${result.errors.join("; ")}` : undefined,
        });
      } else {
        toast({
          title: "Publishing failed",
          description: result.error ?? result.errors?.join("; ") ?? "Check the Zapier connection in Settings.",
          variant: "destructive",
        });
      }
    } else {
      toast({ title: status === "draft" ? "Draft saved" : "Post scheduled!" });
    }
    router.push("/dashboard");
    setSaving(false);
  }

  const minDate = format(new Date(), "yyyy-MM-dd'T'HH:mm");
  const activePlatformLimits = selectedPlatforms.map((p) => PLATFORM_CONFIG[p].charLimit);
  const minLimit = activePlatformLimits.length > 0 ? Math.min(...activePlatformLimits) : Infinity;
  const overLimit = content.length > minLimit;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Create Post</h1>
        <p className="text-sm text-gray-500 mt-1">Compose and schedule your content</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Post Content</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Textarea
                  placeholder="What do you want to share today?"
                  className="min-h-[160px] text-base"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                />
                <div className="flex justify-end mt-1">
                  <span className={cn("text-xs", overLimit ? "text-red-500 font-medium" : "text-gray-400")}>
                    {content.length}{minLimit !== Infinity && `/${minLimit}`}
                  </span>
                </div>
              </div>

              <div>
                <Label className="mb-2 block">Media</Label>
                {uploadedFiles.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {uploadedFiles.map((f) => (
                      <div key={f.id} className="relative group rounded-lg overflow-hidden border border-gray-200 aspect-square bg-gray-100">
                        {f.type.startsWith("image/") ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={f.url} alt={f.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="flex items-center justify-center h-full">
                            <ImageIcon className="h-8 w-8 text-gray-400" />
                          </div>
                        )}
                        <button
                          onClick={() => removeFile(f.id)}
                          className="absolute top-1 right-1 h-6 w-6 bg-black/60 text-white rounded-full items-center justify-center hidden group-hover:flex"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div
                  {...getRootProps()}
                  className={cn(
                    "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
                    isDragActive ? "border-indigo-400 bg-indigo-50" : "border-gray-200 hover:border-gray-300"
                  )}
                >
                  <input {...getInputProps()} />
                  <Upload className="h-6 w-6 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">
                    {uploading ? "Uploading…" : "Drop images/videos here, or click to select"}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">Max 10 files, 50MB each</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Schedule
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Label className="mb-2 block">Publish date & time (leave blank to post immediately)</Label>
              <input
                type="datetime-local"
                min={minDate}
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="flex h-9 w-full rounded-lg border border-gray-300 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Platforms</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {ALL_PLATFORMS.map((p) => {
                const cfg = PLATFORM_CONFIG[p];
                const selected = selectedPlatforms.includes(p);
                return (
                  <button
                    key={p}
                    onClick={() => togglePlatform(p)}
                    className={cn(
                      "flex items-center gap-3 w-full px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors",
                      selected
                        ? `${cfg.bgColor} ${cfg.borderColor} ${cfg.color}`
                        : "border-gray-200 text-gray-600 hover:bg-gray-50"
                    )}
                  >
                    <PlatformIcon platform={p} className="h-4 w-4 shrink-0" />
                    <span>{cfg.label}</span>
                    {p === "houzz" && (
                      <Badge variant="secondary" className="ml-auto text-xs py-0">Soon</Badge>
                    )}
                    {selected && p !== "houzz" && (
                      <span className="ml-auto text-xs opacity-60">{cfg.charLimit.toLocaleString()} chars</span>
                    )}
                  </button>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6 space-y-3">
              <Button
                className="w-full"
                disabled={saving || overLimit}
                onClick={() => handleSave(scheduledAt ? "scheduled" : "published")}
              >
                <Send className="h-4 w-4" />
                {scheduledAt ? "Schedule Post" : "Publish Now"}
              </Button>
              <Button
                variant="outline"
                className="w-full"
                disabled={saving}
                onClick={() => handleSave("draft")}
              >
                <FileText className="h-4 w-4" />
                Save as Draft
              </Button>
            </CardContent>
          </Card>

          {selectedPlatforms.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Character limits</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {selectedPlatforms.map((p) => {
                  const limit = PLATFORM_CONFIG[p].charLimit;
                  const pct = Math.min((content.length / limit) * 100, 100);
                  const over = content.length > limit;
                  return (
                    <div key={p}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className={PLATFORM_CONFIG[p].color}>{PLATFORM_CONFIG[p].label}</span>
                        <span className={over ? "text-red-500" : "text-gray-500"}>
                          {content.length}/{limit}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all", over ? "bg-red-500" : "bg-indigo-500")}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
