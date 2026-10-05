"use client";

import Link from "next/link";
import { useGetStats, useListVideos, useListJobs, JobStatus, VideoStatus } from "@/lib/hooks/use-video-api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/page-header";
import { Film, Search, Clock, AlertTriangle, ArrowUpRight } from "lucide-react";

interface KPIProps {
  label: string;
  value: string | number;
  hint?: string;
  loading?: boolean;
  tone?: "default" | "ok" | "warn" | "err";
  index: string;
}

function KPI({ label, value, hint, loading, tone = "default", index }: KPIProps) {
  const accent =
    tone === "ok"
      ? "text-ok"
      : tone === "warn"
        ? "text-warn"
        : tone === "err"
          ? "text-err"
          : "text-foreground";
  return (
    <div className="relative flex-1 px-7 py-6 border-r border-border last:border-r-0">
      <div className="flex items-start justify-between mb-6">
        <span className="timecode text-[11px] text-muted-foreground">{index}</span>
        <span className="eyebrow">{label}</span>
      </div>
      <div className="flex items-end gap-3">
        {loading ? (
          <Skeleton className="h-10 w-24 bg-secondary" />
        ) : (
          <span
            className={`font-serif text-[44px] leading-none tracking-editorial ${accent}`}
          >
            {value}
          </span>
        )}
      </div>
      {hint && (
        <p className="mt-3 text-xs text-muted-foreground leading-relaxed max-w-[200px]">
          {hint}
        </p>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = useGetStats();
  const { data: videos, isLoading: videosLoading } = useListVideos((query) =>
    query.state.data?.some(
      (v) =>
        (v.embedding_status ?? v.status) === "pending" ||
        (v.embedding_status ?? v.status) === "processing",
    )
      ? 2000
      : false,
  );
  const { data: jobs, isLoading: jobsLoading } = useListJobs((query) =>
    query.state.data && query.state.data.length > 0 ? 2000 : false,
  );

  const isLoading = statsLoading || videosLoading || jobsLoading;
  const recentVideos = videos?.slice(0, 5) || [];
  const recentJobs = jobs?.slice(0, 5) || [];

  return (
    <div>
      <PageHeader
        index="01"
        title="Overview"
        description="The state of your video library and the work moving through the pipeline right now."
        meta="Dashboard"
        loading={isLoading}
        actions={
          <Button asChild className="gap-2">
            <Link href="/videos">
              <Film className="w-4 h-4" strokeWidth={1.75} />
              Manage videos
            </Link>
          </Button>
        }
      />

      {/* KPI Tape */}
      <section className="px-8 mt-8">
        <div className="border border-card-border bg-card">
          <div className="px-7 py-4 hr-hairline border-b border-border flex items-center justify-between">
            <span className="eyebrow">Library tape</span>
            <span className="timecode text-[10px] text-muted-foreground">
              LIVE · refreshed on open
            </span>
          </div>
          <div className="flex divide-x divide-border">
            <KPI
              index="01"
              label="Total reels"
              value={stats?.total_videos ?? 0}
              hint={`${stats?.ready_videos ?? 0} ready · ${stats?.processing_videos ?? 0} processing`}
              loading={isLoading}
            />
            <KPI
              index="02"
              label="Searchable"
              value={stats?.ready_videos ?? 0}
              hint="Indexed and available for retrieval"
              loading={isLoading}
              tone="ok"
            />
            <KPI
              index="03"
              label="Active jobs"
              value={stats?.active_jobs ?? 0}
              hint="Embedding, transcription, summarization"
              loading={isLoading}
              tone="warn"
            />
            <KPI
              index="04"
              label="Errors"
              value={stats?.error_videos ?? 0}
              hint="Reels that need attention"
              loading={isLoading}
              tone={(stats?.error_videos ?? 0) > 0 ? "err" : "default"}
            />
          </div>
        </div>
      </section>

      {/* Two-column editorial section */}
      <section className="px-8 mt-8 pb-10 grid gap-6 lg:grid-cols-2">
        {/* Recent reels */}
        <Card>
          <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-border">
            <div className="flex items-center gap-2.5">
              <Film className="w-3.5 h-3.5 text-primary" strokeWidth={1.75} />
              <h2 className="font-serif text-base tracking-editorial">
                Recent reels
              </h2>
            </div>
            <Link
              href="/videos"
              className="group flex items-center gap-1 text-[11px] timecode uppercase text-muted-foreground hover:text-foreground transition-colors"
            >
              All reels
              <ArrowUpRight
                className="w-3 h-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform"
                strokeWidth={2}
              />
            </Link>
          </div>
          <CardContent className="pt-0 px-0">
            {videosLoading ? (
              <div className="p-6 space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-10 bg-secondary" />
                ))}
              </div>
            ) : recentVideos.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <span className="eyebrow block mb-2">Empty reel</span>
                <p className="text-sm text-muted-foreground">
                  Upload or ingest videos to start building your library.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {recentVideos.map((video, i) => (
                  <li
                    key={video.id}
                    className="flex items-center gap-4 px-6 py-3 hover:bg-secondary/40 transition-colors"
                  >
                    <span className="timecode text-[10px] text-muted-foreground w-6">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span
                      className={`w-1.5 h-1.5 shrink-0 rounded-full ${
                        video.status === VideoStatus.ready
                          ? "bg-ok"
                          : video.status === VideoStatus.processing
                            ? "bg-warn"
                            : video.status === VideoStatus.error
                              ? "bg-err"
                              : "bg-muted-foreground"
                      }`}
                    />
                    <span className="flex-1 text-sm truncate text-foreground">
                      {video.name}
                    </span>
                    <span className="timecode text-[11px] text-muted-foreground">
                      {video.duration_seconds
                        ? `${Math.round(video.duration_seconds / 60)}m`
                        : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Active jobs */}
        <Card>
          <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-border">
            <div className="flex items-center gap-2.5">
              <Clock className="w-3.5 h-3.5 text-primary" strokeWidth={1.75} />
              <h2 className="font-serif text-base tracking-editorial">
                Active jobs
              </h2>
              {(stats?.active_jobs ?? 0) > 0 && <span className="rec-dot" />}
            </div>
            <span className="timecode text-[10px] text-muted-foreground uppercase">
              {recentJobs.length} recent
            </span>
          </div>
          <CardContent className="pt-0 px-0">
            {jobsLoading ? (
              <div className="p-6 space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-10 bg-secondary" />
                ))}
              </div>
            ) : recentJobs.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <span className="eyebrow block mb-2">Idle</span>
                <p className="text-sm text-muted-foreground">
                  No jobs running. The pipeline is quiet.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {recentJobs.map((job, i) => (
                  <li
                    key={job.id}
                    className="flex items-center gap-4 px-6 py-3 hover:bg-secondary/40 transition-colors"
                  >
                    <span className="timecode text-[10px] text-muted-foreground w-6">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span
                      className={`w-1.5 h-1.5 shrink-0 rounded-full ${
                        job.status === JobStatus.done
                          ? "bg-ok"
                          : job.status === JobStatus.running
                            ? "bg-warn rec-dot"
                            : job.status === JobStatus.error
                              ? "bg-err"
                              : "bg-muted-foreground"
                      }`}
                    />
                    <span className="flex-1 text-sm truncate text-foreground">
                      {job.video_name || job.video_id.slice(0, 8)}
                    </span>
                    {job.status === JobStatus.running && (
                      <span className="timecode text-[10px] text-muted-foreground">
                        {job.progress ?? 0}%
                      </span>
                    )}
                    <span className="timecode text-[10px] uppercase text-muted-foreground tracking-[0.12em]">
                      {job.status === JobStatus.queued ? "queued" : job.type}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
