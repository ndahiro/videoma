import { db } from "@workspace/db";
import {
  alertsTable,
  camerasTable,
  cameraRulesTable,
  contactRequestsTable,
  qaHistoryTable,
  stripeCustomersTable,
  stripeEventsTable,
  subscriptionsTable,
  usageEventsTable,
  usersTable,
  videosTable,
  videoEmbeddingsTable,
  videoJobsTable,
} from "@workspace/db/schema";
import type { Alert, Camera, CameraRule, VideoJob } from "@workspace/db/schema";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";

export {
  db,
  alertsTable,
  camerasTable,
  cameraRulesTable,
  usersTable,
  stripeCustomersTable,
  subscriptionsTable,
  stripeEventsTable,
  usageEventsTable,
  contactRequestsTable,
  videosTable,
  videoEmbeddingsTable,
  videoJobsTable,
  qaHistoryTable,
  and,
  desc,
  eq,
  gte,
  inArray,
  sql,
};
export type { Alert, Camera, CameraRule, VideoJob };

