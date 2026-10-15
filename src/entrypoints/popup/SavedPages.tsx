import { useMemo, useState } from 'react';
import { groupPagesByPattern } from '@/core';
import { clearPage, loadRecord, type PageRecord } from '@/storage';
import { askTab, restoreFrom } from './api';
import { FieldList } from './FieldList';
import { splitPage, timeAgo } from './format';
import type { PopupData } from './usePopupData';

interface Props {
  data: PopupData;
  onChange: () => Promise<void>;
}

/** Every saved URL: search, peek at its fields, fill the current page from it, or delete it. */
export function SavedPages({ data, onChange }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string>();
  const [preview, setPreview] = useState<PageRecord>();
  const [notice, setNotice] = useState<string>();
  const [groupByPattern, setGroupByPattern] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const canFill = data.tab !== undefined && !data.tab.paused;
  const current = data.tab?.page;

  const pages = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? data.pages.filter((p) => p.page.toLowerCase().includes(q)) : data.pages;
  }, [data.pages, query]);

  const patternGroups = useMemo(() => {
    return groupPagesByPattern(pages, data.settings.patterns);
  }, [pages, data.settings.patterns]);

  const parameterizedCount = useMemo(() => {
    return patternGroups.filter((g) => g.isParameterized).length;
  }, [patternGroups]);

  async function toggle(page: string) {
    if (open === page) return setOpen(undefined);
    setOpen(page);
    setPreview(await loadRecord(page));
  }

  function toggleGroup(pattern: string) {
    setCollapsedGroups((prev) => ({
      ...prev,
      [pattern]: !prev[pattern],
    }));
  }

  async function fill(page: string) {
    const report = await restoreFrom(data.tabId!, page);
    if (!report) return setNotice('Could not fill this page.');
    const matched = report.restored.length + report.unchanged.length;
    const total = matched + report.unmatched.length + report.skipped.length + report.missing.length;
    setNotice(`Filled ${matched} of ${total} fields from ${splitPage(page).path}.`);
    await onChange();
  }

  async function remove(page: string) {
    // Deleting the current page's data must also reset the running page, or it gets written back.
    if (page === current && data.tabId !== undefined) await askTab(data.tabId, { type: 'clearPage' });
    else await clearPage(page);
    if (open === page) setOpen(undefined);
    await onChange();
  }

  if (data.pages.length === 0) {
    return <p className="muted pad">No saved pages yet. Type in a form on an enabled site and it shows up here.</p>;
  }

  function renderPageItem(item: { page: string; savedAt: number; fieldCount: number; snapshotCount: number; pinnedCount: number }) {
    const { page, savedAt, fieldCount, snapshotCount, pinnedCount } = item;
    const { host, path } = splitPage(page);
    const isCurrent = page === current;
    return (
      <li key={page} className={open === page ? 'is-open' : undefined}>
        <div className="page-row">
          <button className="page-main" onClick={() => toggle(page)} aria-expanded={open === page} title={page}>
            <span className="page-url">
              <span className="page-path">{path}</span>
              {isCurrent && <span className="tag">this page</span>}
            </span>
            <span className="muted small">
              {host} · {fieldCount} field{fieldCount === 1 ? '' : 's'}
              {snapshotCount > 0 && ` · ${snapshotCount} snapshot${snapshotCount === 1 ? '' : 's'}`}
              {pinnedCount > 0 && ` (📌 ${pinnedCount})`} · {timeAgo(savedAt)}
            </span>
          </button>
          {canFill && !isCurrent && (
            <button className="btn btn-small" onClick={() => fill(page)} title={`Fill the current page with draft values from ${page}`}>
              Fill here
            </button>
          )}
          <button className="icon-btn" aria-label={`Delete saved data for ${page}`} title="Delete" onClick={() => remove(page)}>
            ×
          </button>
        </div>
        {open === page && preview && (
          <div className="saved-preview">
            <div className="pad-x" style={{ paddingTop: 4, paddingBottom: 4 }}>
              <span className="muted small" style={{ fontWeight: 600 }}>Working draft</span>
            </div>
            <FieldList fields={preview.draft?.fields ?? preview.fields} />
            {preview.snapshots && preview.snapshots.length > 0 && (
              <div className="saved-snapshots-preview pad-x" style={{ marginTop: 8 }}>
                <span className="muted small" style={{ fontWeight: 600 }}>
                  Saved snapshots ({preview.snapshots.length})
                </span>
                <ul className="snapshot-list" style={{ marginTop: 4 }}>
                  {preview.snapshots.map((snap) => (
                    <li key={snap.id} className="snapshot-item">
                      <div className="snapshot-row">
                        <span className="snapshot-main" style={{ cursor: 'default' }}>
                          <span className="snapshot-title">
                            <span className="snapshot-label">
                              {snap.pinned && '📌 '}
                              {snap.label ?? (snap.trigger === 'submit' ? 'Submitted form' : 'Snapshot')}
                            </span>
                          </span>
                          <span className="muted small">
                            {Object.keys(snap.fields).length} fields · {timeAgo(snap.savedAt)}
                          </span>
                        </span>
                        {canFill && (
                          <button
                            className="btn btn-small"
                            onClick={async () => {
                              const report = await askTab(data.tabId!, { type: 'restoreFields', fields: snap.fields });
                              if (report) {
                                const matched = report.restored.length + report.unchanged.length;
                                const total = matched + report.unmatched.length + report.skipped.length + report.missing.length;
                                setNotice(`Filled ${matched} of ${total} fields from snapshot.`);
                                await onChange();
                              }
                            }}
                            title="Fill the current page with this snapshot"
                          >
                            Fill here
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </li>
    );
  }

  return (
    <section className="saved">
      <div className="pad-x search">
        <input type="search" placeholder="Filter by URL" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Filter saved pages by URL" />
      </div>
      <div className="pad-x view-toggle-bar">
        <button
          type="button"
          className={`btn btn-small${!groupByPattern ? ' btn-primary' : ''}`}
          onClick={() => setGroupByPattern(false)}
        >
          Flat list
        </button>
        <button
          type="button"
          className={`btn btn-small${groupByPattern ? ' btn-primary' : ''}`}
          onClick={() => setGroupByPattern(true)}
          title="Group URLs by generalized pattern (/users/:id/edit)"
        >
          Group by pattern{parameterizedCount > 0 ? ` (${patternGroups.length})` : ''}
        </button>
      </div>
      {notice && (
        <p className="notice pad-x" role="status">
          {notice}
        </p>
      )}
      {!canFill && <p className="muted small pad-x hint">Open an enabled page to fill it from one of these.</p>}

      {groupByPattern ? (
        <div className="pad-x pattern-groups-container">
          {patternGroups.map((group) => {
            const isCollapsed = collapsedGroups[group.pattern] ?? false;
            return (
              <div key={group.pattern} className="pattern-group-card">
                <button
                  type="button"
                  className="pattern-group-header"
                  onClick={() => toggleGroup(group.pattern)}
                  aria-expanded={!isCollapsed}
                >
                  <div style={{ minWidth: 0, overflow: 'hidden' }}>
                    <div className="pattern-group-title truncate">
                      {group.displayPattern}{' '}
                      {group.isParameterized && <span className="tag-subtle">pattern</span>}
                    </div>
                    <div className="muted small truncate">
                      {group.host} · {group.pages.length} page{group.pages.length === 1 ? '' : 's'} · {group.totalFieldCount} fields
                      {group.totalSnapshotCount > 0 && ` · ${group.totalSnapshotCount} snapshots`}
                      {group.pinnedCount > 0 && ` (📌 ${group.pinnedCount})`}
                    </div>
                  </div>
                  <span className="muted small" style={{ marginLeft: 8 }}>{isCollapsed ? '▶' : '▼'}</span>
                </button>
                {!isCollapsed && (
                  <ul className="page-list" style={{ borderTop: 'none' }}>
                    {group.pages.map((p) => renderPageItem(p))}
                  </ul>
                )}
              </div>
            );
          })}
          {patternGroups.length === 0 && <p className="muted pad-x">No URLs match “{query}”.</p>}
        </div>
      ) : (
        <ul className="page-list">
          {pages.map((p) => renderPageItem(p))}
          {pages.length === 0 && <li className="muted pad-x">No URLs match “{query}”.</li>}
        </ul>
      )}
    </section>
  );
}
