import { db } from './db';
import type { ActivityEntry, ActivitySource } from '../types';

export async function recordActivity(entry: {
  projectId?: string;
  blockId?: string;
  source?: ActivitySource;
  action: string;
  summary: string;
}): Promise<void> {
  const activity: ActivityEntry = {
    id: `activity-${crypto.randomUUID()}`,
    source: entry.source ?? 'user',
    createdAt: Date.now(),
    ...entry
  };
  await db.activities.add(activity);
}
