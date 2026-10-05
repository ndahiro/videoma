"use client";

import { useState, useEffect } from "react";
import { useListVideos, useSearchVideos, type Video } from "@/lib/hooks/use-video-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/page-header";
import { Search, Loader2, Film, Clock } from "lucide-react";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const f = Math.floor((seconds % 1) * 24);
  return `${m.toString().padStart(2, "0")}:${s
    .toString()
    .padStart(2, "0")}:${f.toString().padStart(2, "0")}`;
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedVideo, setSelectedVideo] = useState<string>("");
  // Keep polling while any reel is still indexing so the input activates
  // on its own once embedding completes.
  const { data: videos, isLoading: videosLoading } = useListVideos((query) =>
    query.state.data?.some(
      (v) =>
        (v.embedding_status ?? v.status) === "pending" ||
        (v.embedding_status ?? v.status) === "processing",
    )
      ? 2000
      : false,
  );

  const searchMutation = useSearchVideos();

  useEffect(() => {
    if (videos && videos.length > 0 && !selectedVideo) {
      const readyVideo = videos.find((v) => v.embedding_status === "complete");
      if (readyVideo) {
        setSelectedVideo(readyVideo.id);
      } else {
        setSelectedVideo(videos[0].id);
      }
    }
  }, [videos, selectedVideo]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || !selectedVideo) return;
    setSearchQuery(query);
    searchMutation.mutate({
      video_id: selectedVideo,
      query: query.trim(),
      top_k: 20,
    });
  };

  const results = searchMutation.data?.results || [];
  const isLoading = searchMutation.isPending;
  const error = searchMutation.error;

  const selectedVideoData = videos?.find((v) => v.id === selectedVideo);
  const isReady = selectedVideoData?.embedding_status === "complete";

  return (
    <div>
      <PageHeader
        index="03"
        title="Semantic search"
        description="Search across a reel's keyframes using natural language. Find the moment — not just the file."
        meta="Search"
        loading={isLoading}
      />

      {/* Video selector */}
      <section className="px-8 pt-6 pb-4 border-b border-border">
        <label className="eyebrow block mb-2">Search in reel</label>
        {videosLoading ? (
          <Skeleton className="h-12 w-80 bg-secondary" />
        ) : (
          <select
            value={selectedVideo}
            onChange={(e) => setSelectedVideo(e.target.value)}
            className="w-full max-w-md px-3 py-2 bg-background border border-border text-foreground font-mono text-sm focus:outline-none focus:border-primary"
          >
            {videos?.length === 0 && (
              <option value="" disabled>
                No videos uploaded
              </option>
            )}
            {videos?.map((video) => (
              <option key={video.id} value={video.id}>
                {video.name} — {video.embedding_status === "complete" ? "Indexed" : video.embedding_status}
              </option>
            ))}
          </select>
        )}
        {!isReady && selectedVideo && (
          <p className="mt-2 text-xs text-muted-foreground">
            This reel needs to be indexed before search is available.
          </p>
        )}
      </section>

      {/* Search bar */}
      <section className="px-8 pt-8">
        <form onSubmit={handleSearch} className="flex gap-3 items-stretch">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-primary" strokeWidth={1.75} />
            <Input
              placeholder="Describe a moment…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-11 h-12 text-base font-mono"
              disabled={isLoading || !isReady}
            />
          </div>
          <Button type="submit" disabled={!query.trim() || isLoading || !isReady} className="h-12 px-6">
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Searching
              </>
            ) : (
              "Run search"
            )}
          </Button>
        </form>

        {error && (
          <div className="mt-6 p-4 border border-destructive/30 bg-destructive/5 text-destructive text-sm">
            {error instanceof Error ? error.message : "Something went wrong"}
          </div>
        )}

        {searchMutation.data && !isLoading && (
          <div className="flex items-center gap-6 mt-5 text-xs">
            <span className="eyebrow">
              {results.length} match{results.length !== 1 ? "es" : ""}
            </span>
            <span className="timecode text-muted-foreground">
              query · &ldquo;{searchQuery}&rdquo;
            </span>
            {searchMutation.data.elapsed_ms != null && (
              <span className="timecode text-muted-foreground">
                {searchMutation.data.elapsed_ms} ms
              </span>
            )}
            <span className="hr-hairline flex-1" />
          </div>
        )}
      </section>

      {/* Loading */}
      {isLoading && (
        <section className="px-8 mt-8 space-y-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-28 bg-secondary" />
          ))}
        </section>
      )}

      {/* Results */}
      {searchMutation.data && !isLoading && (
        <section className="px-8 mt-8 pb-10 space-y-3">
          {results.length === 0 ? (
            <EmptyState
              title="No matches"
              body="Try a different phrasing or check that the reel is fully indexed."
            />
          ) : (
            results.map((hit, index) => (
              <article
                key={index}
                className="group relative border border-card-border bg-card hover:border-primary/50 transition-colors"
              >
                <div className="flex items-stretch">
                  <div className="flex flex-col items-center justify-center gap-2 px-5 border-r border-border bg-background/40 w-20 shrink-0">
                    <span className="timecode text-[10px] text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span
                      className="font-serif text-2xl text-primary tracking-editorial"
                      style={{ fontFeatureSettings: '"tnum"' }}
                    >
                      {(hit.score * 100).toFixed(0)}
                    </span>
                    <span className="eyebrow">Score</span>
                  </div>

                  <div className="flex-1 min-w-0 p-5 flex gap-5">
                    {hit.thumbnail_url && (
                      <div className="relative shrink-0 w-32 h-20 overflow-hidden border border-border">
                        <img src={hit.thumbnail_url} alt={hit.video_name} className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0 space-y-2.5">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="font-serif text-lg tracking-editorial text-foreground truncate">
                          {hit.video_name}
                        </h3>
                        <span className="eyebrow">{hit.video_id.slice(0, 8)}</span>
                      </div>
                      {hit.description && (
                        <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
                          {hit.description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 pt-1">
                        {hit.timestamp_start != null && (
                          <span className="flex items-center gap-1.5 timecode text-[11px] text-primary">
                            <Clock className="w-3 h-3" strokeWidth={1.75} />
                            {formatTime(hit.timestamp_start)} —{" "}
                            {formatTime(hit.timestamp_end ?? 0)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            ))
          )}
        </section>
      )}

      {/* Empty initial state */}
      {!searchMutation.data && !isLoading && !searchQuery && (
        <section className="px-8 mt-12">
          <EmptyState
            title="Ready when you are"
            body="Semantic search uses natural language to find the exact moments in your reels."
          />
        </section>
      )}
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="border border-dashed border-border px-8 py-16 text-center">
      <div className="inline-flex w-10 h-10 items-center justify-center border border-border mb-4">
        <Film className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
      </div>
      <h3 className="font-serif text-lg tracking-editorial">{title}</h3>
      <p className="mt-2 text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
        {body}
      </p>
    </div>
  );
}
