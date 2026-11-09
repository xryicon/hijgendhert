import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const bingoEvents = sqliteTable('bingo_events', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  status: text('status').notNull().default('draft'),
  visibility: text('visibility').notNull().default('private'),
  startsAt: text('starts_at').notNull(),
  endsAt: text('ends_at').notNull(),
  state: text('state').notNull(),
  version: integer('version').notNull().default(1),
  ownerId: text('owner_id').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, table => [index('bingo_events_status_updated').on(table.status, table.updatedAt)]);
