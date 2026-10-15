import { useEffect, useMemo, useState } from 'react';
import {
  findPatternSiblings,
  groupPagesByPattern,
  patternOfPath,
} from '@/core';
import {
  clearPage,
  deleteSnapshot,
  loadRecord,
  togglePinSnapshot,
  type PageRecord,
  type Snapshot,
} from '@/storage';
import { FieldList } from '../popup/FieldList';
import { formatBytes, splitPage, timeAgo } from '../popup/format';
import { askTab, restoreFields, restoreFrom, takeSnapshot } from '../popup/api';
import { useSidePanelData } from './useSidePanelData';

type FilterScope = 'all' | 'site' | 'pinned';
type DetailTab = 'draft' | 'snapshots';

export function SidePanelApp() {
  const { data, refresh } = useSidePanelData();
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<FilterScope>('all');
  const [selectedPage, setSelectedPage] = useState<string>();
  const [selectedRecord, setSelectedRecord] = useState<PageRecord>();
  const [detailTab, setDetailTab] = useState<DetailTab>('draft');
  const [notice, setNotice] = useState<string>();
  const [openSnapshotId, setOpenSnapshotId] = useState<string>();

  const [groupByPattern, setGroupByPattern] = useState(false);

  const activePage = data.tabState?.page;
  const activeOrigin = data.tabState?.origin;
  const canFill = data.activeTab !== undefined && data.tabState !== undefined && !data.tabState.paused;

  // Set initial selected page to the active tab's page if saved, or first page
  useEffect(() => {
    if (!selectedPage) {
      if (activePage && data.pages.some((p) => p.page === activePage)) {
        setSelectedPage(activePage);
      } else if (data.pages.length > 0) {
        setSelectedPage(data.pages[0]?.page);
      }
    }
  }, [activePage, data.pages, selectedPage]);

  // Load record when selected page changes
  useEffect(() => {
    if (!selectedPage) {
      setSelectedRecord(undefined);
      return;
    }
    let cancelled = false;
    void loadRecord(selectedPage).then((rec) => {
      if (!cancelled) setSelectedRecord(rec);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedPage]);

  // Filtered pages based on search query and scope
  const filteredPages = useMemo(() => {
    let list = data.pages;
    if (scope === 'site' && activeOrigin) {
      list = list.filter((p) => p.page.startsWith(activeOrigin));
    } else if (scope === 'pinned') {
      list = list.filter((p) => p.pinnedCount > 0);
    }

    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((p) => p.page.toLowerCase().includes(q));
  }, [data.pages, scope, activeOrigin, query]);

  // Group pages by host
  const groupedPages = useMemo(() => {
    const groups = new Map<string, typeof filteredPages>();
    for (const page of filteredPages) {
      const { host } = splitPage(page.page);
      const arr = groups.get(host) ?? [];
      arr.push(page);
      groups.set(host, arr);
    }
    return Array.from(groups.entries());
  }, [filteredPages]);

  // Group pages by route pattern
  const patternGroups = useMemo(() => {
    return groupPagesByPattern(filteredPages, data.settings.patterns);
  }, [filteredPages, data.settings.patterns]);

  // Find pattern siblings for active tab if active page has no draft
  const activeTabSiblings = useMemo(() => {
    if (!activePage) return [];
    return findPatternSiblings(activePage, data.pages, data.settings.patterns);
  }, [activePage, data.pages, data.settings.patterns]);

  const activeHasSavedDraft = useMemo(() => {
    if (!activePage) return false;
    return data.pages.some((p) => p.page === activePage);
  }, [activePage, data.pages]);

  // Find pattern siblings for selected page
  const selectedSiblings = useMemo(() => {
    if (!selectedPage) return [];
    return findPatternSiblings(selectedPage, data.pages, data.settings.patterns);
  }, [selectedPage, data.pages, data.settings.patterns]);

  async function fillFromDraft(targetPage: string) {
    if (!data.activeTab?.id) return;
    const report = await restoreFrom(data.activeTab.id, targetPage);
    if (!report) {
      setNotice('Could not restore to current page.');
      return;
    }
    const matched = report.restored.length + report.unchanged.length;
    const total = matched + report.unmatched.length + report.skipped.length + report.missing.length;
    setNotice(`Restored ${matched} of ${total} fields into current tab.`);
    await refresh();
  }

  async function fillFromSnapshot(snap: Snapshot) {
    if (!data.activeTab?.id) return;
    const report = await restoreFields(data.activeTab.id, snap.fields);
    if (!report) {
      setNotice('Could not restore to current page.');
      return;
    }
    const matched = report.restored.length + report.unchanged.length;
    const total = matched + report.unmatched.length + report.skipped.length + report.missing.length;
    setNotice(`Restored ${matched} of ${total} fields from snapshot.`);
    await refresh();
  }

  async function removePage(page: string) {
    if (page === activePage && data.activeTab?.id !== undefined) {
      await askTab(data.activeTab.id, { type: 'clearPage' });
    } else {
      await clearPage(page);
    }
    if (selectedPage === page) {
      setSelectedPage(undefined);
    }
    setNotice('Removed saved page.');
    await refresh();
  }

  function renderCard(item: { page: string; savedAt: number; fieldCount: number; snapshotCount: number; pinnedCount: number }) {
    const { page, savedAt, fieldCount, snapshotCount, pinnedCount } = item;
    const { path } = splitPage(page);
    const isCurrent = page === activePage;
    const isSelected = page === selectedPage;
    return (
      <div
        key={page}
        className={`sidepanel-page-card${isSelected ? ' is-selected' : ''}`}
      >
        <div className="sidepanel-card-head">
          <div
            className="sidepanel-card-info"
            onClick={() => setSelectedPage(page)}
          >
            <div className="page-url">
              <span className="page-path">{path}</span>
              {isCurrent && <span className="tag">active tab</span>}
            </div>
            <span className="muted small">
              {fieldCount} field{fieldCount === 1 ? '' : 's'}
              {snapshotCount > 0 && ` · ${snapshotCount} snapshot${snapshotCount === 1 ? '' : 's'}`}
              {pinnedCount > 0 && ` (📌 ${pinnedCount})`} · {timeAgo(savedAt)}
            </span>
          </div>
          <div className="sidepanel-card-actions">
            {canFill && (
              <button
                className="btn btn-small"
                onClick={() => fillFromDraft(page)}
                title={`Fill active tab with values from ${path}`}
              >
                Fill
              </button>
            )}
            <button
              className="icon-btn"
              title="Delete page data"
              aria-label={`Delete ${page}`}
              onClick={() => removePage(page)}
            >
              ×
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <main className="sidepanel-app">
      <header className="sidepanel-header">
        <div className="sidepanel-brand">
          <img src="/icon/32.png" alt="" width={20} height={20} />
          <h1>form-keeper</h1>
        </div>
        <StatusPill state={!data.tabState ? 'inactive' : data.tabState.paused ? 'paused' : 'active'} />
      </header>

      <div className="sidepanel-content">
        {data.updateInfo?.available && (
          <div className="update-banner">
            <div className="update-banner-card">
              <div className="update-banner-text">
                <span className="update-sparkle" aria-hidden>✨</span>
                <span>
                  <strong>v{data.updateInfo.latestVersion}</strong> available
                </span>
              </div>
              <a
                href={data.updateInfo.releaseUrl}
                target="_blank"
                rel="noreferrer"
                className="btn btn-small btn-primary"
              >
                Update
              </a>
            </div>
          </div>
        )}

        {/* Active Tab Quick Action Banner */}
        {data.tabState && !data.tabState.paused && (
          <section className="active-tab-card">
            <div className="active-tab-header">
              <div className="active-tab-title">
                <span className="dot" style={{ width: 6, height: 6, background: 'var(--green)', borderRadius: '50%' }} />
                <span className="active-tab-path" title={data.tabState.page}>
                  {splitPage(data.tabState.page).path}
                </span>
                <span className="tag">active tab</span>
              </div>
              <span className="muted small">{splitPage(data.tabState.page).host}</span>
            </div>
            <div className="active-tab-actions">
              <button
                className="btn btn-primary btn-small"
                onClick={async () => {
                  if (!data.activeTab?.id) return;
                  const res = await askTab(data.activeTab.id, { type: 'restoreNow' });
                  if (res) {
                    const n = res.restored.length;
                    setNotice(n ? `Restored ${n} field${n === 1 ? '' : 's'}.` : 'Form already matches saved draft.');
                    await refresh();
                  }
                }}
              >
                Restore draft
              </button>
              <button
                className="btn btn-small"
                onClick={async () => {
                  if (!data.activeTab?.id) return;
                  const res = await takeSnapshot(data.activeTab.id);
                  if (res) {
                    setNotice('Saved new snapshot.');
                    await refresh();
                  } else {
                    setNotice('Form already matches latest snapshot.');
                  }
                }}
              >
                + Snapshot
              </button>
            </div>
            {!activeHasSavedDraft && activeTabSiblings.length > 0 && (
              <div style={{ marginTop: 8, padding: '8px 10px', background: 'var(--surface)', borderRadius: 6, border: '1px dashed var(--accent)', display: 'grid', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="tag">pattern match</span>
                  <span className="mono small">{patternOfPath(splitPage(activePage!).path, data.settings.patterns)}</span>
                </div>
                <div className="muted small">
                  Found saved form from <strong>{splitPage(activeTabSiblings[0]!.page).path}</strong> ({timeAgo(activeTabSiblings[0]!.savedAt)}).
                </div>
                <button
                  className="btn btn-small btn-primary"
                  onClick={() => fillFromDraft(activeTabSiblings[0]!.page)}
                >
                  Fill from sibling
                </button>
              </div>
            )}
          </section>
        )}

        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}

        {/* Search & Filter Toolbar */}
        <section className="search">
          <input
            type="search"
            placeholder="Search saved pages by URL..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Filter saved pages"
          />
        </section>

        <nav className="filter-row" aria-label="Page filters">
          <button
            className={`filter-btn${scope === 'all' ? ' is-active' : ''}`}
            onClick={() => setScope('all')}
          >
            All pages ({data.pages.length})
          </button>
          {activeOrigin && (
            <button
              className={`filter-btn${scope === 'site' ? ' is-active' : ''}`}
              onClick={() => setScope('site')}
            >
              This site
            </button>
          )}
          <button
            className={`filter-btn${scope === 'pinned' ? ' is-active' : ''}`}
            onClick={() => setScope('pinned')}
          >
            Pinned snapshots
          </button>
          <button
            className={`filter-btn${groupByPattern ? ' is-active' : ''}`}
            onClick={() => setGroupByPattern(!groupByPattern)}
            title="Group pages by generalized route pattern"
          >
            By pattern
          </button>
        </nav>

        {/* Browse Page List */}
        <section className="sidepanel-pages">
          {data.pages.length === 0 ? (
            <p className="muted pad empty">No saved pages yet. Forms on enabled hosts will show up here as you type.</p>
          ) : filteredPages.length === 0 ? (
            <p className="muted pad empty">No pages match "{query}".</p>
          ) : groupByPattern ? (
            patternGroups.map((group) => (
              <div key={group.pattern} className="sidepanel-group">
                <div className="sidepanel-group-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>
                    {group.displayPattern}{' '}
                    {group.isParameterized && <span className="tag-subtle">pattern</span>}
                  </span>
                  <span className="muted small" style={{ fontWeight: 'normal', textTransform: 'none' }}>
                    {group.host} · {group.pages.length}
                  </span>
                </div>
                {group.pages.map((p) => renderCard(p))}
              </div>
            ))
          ) : (
            groupedPages.map(([host, pages]) => (
              <div key={host} className="sidepanel-group">
                <span className="sidepanel-group-title">{host}</span>
                {pages.map((p) => renderCard(p))}
              </div>
            ))
          )}
        </section>

        {/* Preview & Inspection Section */}
        {selectedPage && selectedRecord && (
          <section className="preview-pane">
            <div className="preview-head">
              <div>
                <span className="label">Previewing</span>
                <span className="page-path" title={selectedPage}>
                  {splitPage(selectedPage).path}
                </span>
                <span className="muted small block">{splitPage(selectedPage).host}</span>
              </div>
              {canFill && (
                <button
                  className="btn btn-primary btn-small"
                  onClick={() => fillFromDraft(selectedPage)}
                >
                  Restore to tab
                </button>
              )}
            </div>

            {selectedSiblings.length > 0 && (
              <div style={{ padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                <span className="muted small" style={{ fontWeight: 600 }}>
                  Other pages matching pattern ({patternOfPath(splitPage(selectedPage).path, data.settings.patterns)}):
                </span>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                  {selectedSiblings.map((sib) => (
                    <button
                      key={sib.page}
                      type="button"
                      className="filter-btn"
                      onClick={() => setSelectedPage(sib.page)}
                      title={`Preview draft from ${sib.page}`}
                    >
                      {splitPage(sib.page).path}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="preview-subtabs" role="tablist">
              <button
                className={`preview-subtab${detailTab === 'draft' ? ' is-active' : ''}`}
                onClick={() => setDetailTab('draft')}
              >
                Working draft ({Object.keys(selectedRecord.draft?.fields ?? selectedRecord.fields).length})
              </button>
              <button
                className={`preview-subtab${detailTab === 'snapshots' ? ' is-active' : ''}`}
                onClick={() => setDetailTab('snapshots')}
              >
                Snapshots ({selectedRecord.snapshots?.length ?? 0})
              </button>
            </div>

            {detailTab === 'draft' ? (
              <FieldList fields={selectedRecord.draft?.fields ?? selectedRecord.fields} />
            ) : (
              <div className="snapshots">
                {selectedRecord.snapshots?.length === 0 ? (
                  <p className="muted small">No snapshots saved for this page yet.</p>
                ) : (
                  <ul className="snapshot-list">
                    {selectedRecord.snapshots.map((snap) => {
                      const isOpen = openSnapshotId === snap.id;
                      const count = Object.keys(snap.fields).length;
                      return (
                        <li key={snap.id} className={`snapshot-item${isOpen ? ' is-open' : ''}`}>
                          <div className="snapshot-row">
                            <button
                              className={`icon-btn pin-btn${snap.pinned ? ' is-pinned' : ''}`}
                              title={snap.pinned ? 'Pinned snapshot' : 'Pin snapshot'}
                              onClick={async (e) => {
                                e.stopPropagation();
                                await togglePinSnapshot(selectedPage, snap.id);
                                await refresh();
                              }}
                            >
                              <PinIcon filled={snap.pinned} />
                            </button>

                            <button
                              className="snapshot-main"
                              onClick={() => setOpenSnapshotId(isOpen ? undefined : snap.id)}
                            >
                              <span className="snapshot-title">
                                <span className="snapshot-label">
                                  {snap.label ?? (snap.trigger === 'submit' ? 'Submitted form' : 'Snapshot')}
                                </span>
                                {snap.trigger === 'submit' && <span className="tag-subtle">submit</span>}
                                {snap.trigger === 'restore' && <span className="tag-subtle">pre-restore</span>}
                              </span>
                              <span className="muted small">
                                {count} fields · {timeAgo(snap.savedAt)}
                              </span>
                            </button>

                            {canFill && (
                              <button
                                className="btn btn-small"
                                onClick={() => fillFromSnapshot(snap)}
                                title="Restore this snapshot into active tab"
                              >
                                Restore
                              </button>
                            )}

                            <button
                              className="icon-btn"
                              title="Delete snapshot"
                              onClick={async (e) => {
                                e.stopPropagation();
                                await deleteSnapshot(selectedPage, snap.id);
                                if (openSnapshotId === snap.id) setOpenSnapshotId(undefined);
                                await refresh();
                              }}
                            >
                              ×
                            </button>
                          </div>
                          {isOpen && <FieldList fields={snap.fields} />}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            <div className="preview-footer">
              <span className="muted small">Last saved {timeAgo(selectedRecord.savedAt)}</span>
              <button
                className="link"
                onClick={async () => {
                  await navigator.clipboard.writeText(JSON.stringify(selectedRecord, null, 2));
                  setNotice('Copied form data as JSON.');
                }}
              >
                Copy JSON
              </button>
            </div>
          </section>
        )}
      </div>

      <footer className="footer pad-x">
        <span className="muted small">
          {data.pages.length} page{data.pages.length === 1 ? '' : 's'} · {formatBytes(data.bytes)}
        </span>
      </footer>
    </main>
  );
}

function StatusPill({ state }: { state: 'active' | 'paused' | 'inactive' }) {
  const label = { active: 'Active', paused: 'Paused', inactive: 'Inactive' }[state];
  return (
    <span className={`pill pill-${state}`}>
      <span className="dot" aria-hidden />
      {label}
    </span>
  );
}

function PinIcon({ filled }: { filled?: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="12" y1="17" x2="12" y2="22" />
      <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a1 1 0 0 0 0-2H8a1 1 0 0 0 0 2h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
    </svg>
  );
}
