"use client";
import { useState, useEffect, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Upload, Trash2, Copy, Image as ImageIcon, Film, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { MediaFileRow } from "@/types/database";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function MediaPage() {
  const [files, setFiles] = useState<MediaFileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const supabase = createClient();

  const loadFiles = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("media_files")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setFiles((data ?? []) as MediaFileRow[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    setUploading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    for (const file of acceptedFiles) {
      const path = `${user.id}/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("media").upload(path, file);
      if (error) {
        toast({ title: "Upload failed", description: error.message, variant: "destructive" });
        continue;
      }
      const { data: { publicUrl } } = supabase.storage.from("media").getPublicUrl(path);
      await supabase.from("media_files").insert({
        user_id: user.id,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type,
        storage_path: path,
        public_url: publicUrl,
      });
    }
    toast({ title: `${acceptedFiles.length} file(s) uploaded` });
    await loadFiles();
    setUploading(false);
  }, [supabase, loadFiles]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [], "video/*": [] },
    maxSize: 50 * 1024 * 1024,
  });

  async function deleteFile(file: MediaFileRow) {
    await supabase.storage.from("media").remove([file.storage_path]);
    await supabase.from("media_files").delete().eq("id", file.id);
    setFiles((prev) => prev.filter((f) => f.id !== file.id));
    if (selected === file.id) setSelected(null);
    toast({ title: "File deleted" });
  }

  function copyUrl(url: string) {
    navigator.clipboard.writeText(url);
    toast({ title: "URL copied to clipboard" });
  }

  const filtered = files.filter((f) =>
    f.file_name.toLowerCase().includes(search.toLowerCase())
  );

  const selectedFile = files.find((f) => f.id === selected);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Media Library</h1>
          <p className="text-sm text-gray-500 mt-1">{files.length} files · Upload images and videos</p>
        </div>
      </div>

      <div
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors mb-6",
          isDragActive ? "border-indigo-400 bg-indigo-50" : "border-gray-200 hover:border-gray-300 bg-white"
        )}
      >
        <input {...getInputProps()} />
        <Upload className="h-8 w-8 text-gray-400 mx-auto mb-3" />
        <p className="text-sm font-medium text-gray-700">
          {uploading ? "Uploading…" : "Drop files here or click to upload"}
        </p>
        <p className="text-xs text-gray-400 mt-1">Images and videos up to 50MB</p>
      </div>

      <div className="flex gap-4 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Search files…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          {loading ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="aspect-square rounded-lg bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <ImageIcon className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">{search ? "No files match your search" : "No media yet"}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {filtered.map((file) => (
                <button
                  key={file.id}
                  onClick={() => setSelected(file.id === selected ? null : file.id)}
                  className={cn(
                    "aspect-square rounded-lg overflow-hidden border-2 transition-all relative group bg-gray-100",
                    file.id === selected ? "border-indigo-500" : "border-transparent hover:border-gray-300"
                  )}
                >
                  {file.mime_type.startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={file.public_url} alt={file.file_name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <Film className="h-8 w-8 text-gray-400" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          {selectedFile ? (
            <Card>
              <CardContent className="p-4 space-y-4">
                <div className="aspect-video rounded-lg overflow-hidden bg-gray-100">
                  {selectedFile.mime_type.startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={selectedFile.public_url} alt={selectedFile.file_name} className="w-full h-full object-contain" />
                  ) : (
                    <video src={selectedFile.public_url} controls className="w-full h-full" />
                  )}
                </div>
                <div className="space-y-2 text-sm">
                  <p className="font-medium text-gray-900 truncate">{selectedFile.file_name}</p>
                  <div className="grid grid-cols-2 gap-1 text-gray-500">
                    <span>Size</span><span>{formatBytes(selectedFile.file_size)}</span>
                    <span>Type</span><span className="truncate">{selectedFile.mime_type}</span>
                    <span>Uploaded</span><span>{format(new Date(selectedFile.created_at), "MMM d, yyyy")}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => copyUrl(selectedFile.public_url)}>
                    <Copy className="h-3 w-3" />
                    Copy URL
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => deleteFile(selectedFile)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-sm text-gray-500">Select a file to view details</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
