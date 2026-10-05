import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { videosTable } from "./videos";

export const qaHistoryTable = pgTable(
  "qa_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    videoId: uuid("video_id")
      .notNull()
      .references(() => videosTable.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    answer: text("answer"),
    sources: jsonb("sources"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    videoIdx: index("qa_history_video_id_idx").on(table.videoId),
  }),
);

export type QaHistory = typeof qaHistoryTable.$inferSelect;
export type InsertQaHistory = typeof qaHistoryTable.$inferInsert;
