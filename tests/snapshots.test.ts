import { describe, expect, it } from 'vitest';
import { MAX_SNAPSHOT_AGE_MS, migrateRecord, pruneSnapshots, type Snapshot } from '../src/storage';
import type { SavedFields } from '../src/core/types';

describe('migrateRecord', () => {
  it('migrates v1 legacy records to v2 with working draft', () => {
    const v1 = {
      version: 1,
      savedAt: 1234567890,
      fields: {
        'page name=email': { kind: 'text', value: 'alice@example.com' },
      } as SavedFields,
    };

    const migrated = migrateRecord(v1);
    expect(migrated).toBeDefined();
    expect(migrated?.version).toBe(2);
    expect(migrated?.savedAt).toBe(1234567890);
    expect(migrated?.fields).toEqual(v1.fields);
    expect(migrated?.draft).toEqual({
      savedAt: 1234567890,
      fields: v1.fields,
    });
    expect(migrated?.snapshots).toEqual([]);
  });

  it('migrates unversioned legacy records', () => {
    const legacy = {
      savedAt: 11111,
      fields: {
        'page name=title': { kind: 'text', value: 'Draft' },
      } as SavedFields,
    };

    const migrated = migrateRecord(legacy);
    expect(migrated).toBeDefined();
    expect(migrated?.version).toBe(2);
    expect(migrated?.draft.fields).toEqual(legacy.fields);
    expect(migrated?.snapshots).toEqual([]);
  });

  it('normalizes existing v2 records', () => {
    const v2 = {
      version: 2,
      draft: {
        savedAt: 2000,
        fields: { 'page name=search': { kind: 'text', value: 'vitest' } },
      },
      snapshots: [
        {
          id: 's1',
          savedAt: 1000,
          fields: { 'page name=search': { kind: 'text', value: 'jest' } },
          pinned: true,
        },
      ],
    };

    const migrated = migrateRecord(v2);
    expect(migrated).toBeDefined();
    expect(migrated?.version).toBe(2);
    expect(migrated?.draft.savedAt).toBe(2000);
    expect(migrated?.fields).toEqual(v2.draft.fields);
    expect(migrated?.snapshots).toHaveLength(1);
    expect(migrated?.snapshots[0]?.pinned).toBe(true);
  });

  it('rejects invalid inputs', () => {
    expect(migrateRecord(null)).toBeUndefined();
    expect(migrateRecord(undefined)).toBeUndefined();
    expect(migrateRecord('invalid')).toBeUndefined();
    expect(migrateRecord({ version: 99 })).toBeUndefined();
  });
});

describe('pruneSnapshots', () => {
  const dummyFields: SavedFields = {
    'page name=x': { kind: 'text', value: 'val' },
  };

  it('always retains pinned snapshots', () => {
    const snapshots: Snapshot[] = [
      { id: 'p1', savedAt: 1000, fields: dummyFields, pinned: true },
      { id: 'p2', savedAt: 2000, fields: dummyFields, pinned: true },
      { id: 'p3', savedAt: 3000, fields: dummyFields, pinned: true },
    ];

    // Even with maxUnpinned = 1, all pinned are kept
    const pruned = pruneSnapshots(snapshots, 1);
    expect(pruned).toHaveLength(3);
    expect(pruned.map((s) => s.id)).toEqual(['p3', 'p2', 'p1']);
  });

  it('prunes unpinned snapshots exceeding max limit (keeps newest)', () => {
    const now = 100_000;
    const snapshots: Snapshot[] = [
      { id: 'u1', savedAt: now - 4000, fields: dummyFields },
      { id: 'u2', savedAt: now - 3000, fields: dummyFields },
      { id: 'u3', savedAt: now - 2000, fields: dummyFields },
      { id: 'u4', savedAt: now - 1000, fields: dummyFields },
      { id: 'p1', savedAt: now - 5000, fields: dummyFields, pinned: true },
    ];

    // Keep max 2 unpinned + all pinned
    const pruned = pruneSnapshots(snapshots, 2, now);
    expect(pruned).toHaveLength(3); // 2 unpinned (u4, u3) + 1 pinned (p1)
    expect(pruned.map((s) => s.id)).toEqual(['u4', 'u3', 'p1']);
  });

  it('prunes unpinned snapshots older than MAX_SNAPSHOT_AGE_MS', () => {
    const now = 1_000_000_000_000;
    const oldTime = now - MAX_SNAPSHOT_AGE_MS - 1000;
    const snapshots: Snapshot[] = [
      { id: 'recent', savedAt: now - 1000, fields: dummyFields },
      { id: 'old-unpinned', savedAt: oldTime, fields: dummyFields, pinned: false },
      { id: 'old-pinned', savedAt: oldTime, fields: dummyFields, pinned: true },
    ];

    const pruned = pruneSnapshots(snapshots, 10, now);
    expect(pruned.map((s) => s.id)).toEqual(['recent', 'old-pinned']);
  });
});
