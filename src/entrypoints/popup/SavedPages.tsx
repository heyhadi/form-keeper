import { useMemo, useState } from 'react';
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
  const canFill = data.tab !== undefined && !data.tab.paused;
  const current = data.tab?.page;

  const pages = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? data.pages.filter((p) => p.page.toLowerCase().includes(q)) : data.pages;
  }, [data.pages, query]);

  async function toggle(page: string) {
    if (open === page) return setOpen(undefined);
    setOpen(page);
    setPreview(await loadRecord(page));
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

  return (
    <section className="saved">
      <div className="pad-x search">
        <input type="search" placeholder="Filter by URL" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Filter saved pages by URL" />
      </div>
      {notice && (
        <p className="notice pad-x" role="status">
          {notice}
        </p>
      )}
      {!canFill && <p className="muted small pad-x hint">Open an enabled page to fill it from one of these.</p>}
      <ul className="page-list">
        {pages.map(({ page, savedAt, fieldCount }) => {
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
                    {host} · {fieldCount} field{fieldCount === 1 ? '' : 's'} · {timeAgo(savedAt)}
                  </span>
                </button>
                {canFill && !isCurrent && (
                  <button className="btn btn-small" onClick={() => fill(page)} title={`Fill the current page with values from ${page}`}>
                    Fill here
                  </button>
                )}
                <button className="icon-btn" aria-label={`Delete saved data for ${page}`} title="Delete" onClick={() => remove(page)}>
                  ×
                </button>
              </div>
              {open === page && preview && <FieldList fields={preview.fields} />}
            </li>
          );
        })}
        {pages.length === 0 && <li className="muted pad-x">No URLs match “{query}”.</li>}
      </ul>
    </section>
  );
}
