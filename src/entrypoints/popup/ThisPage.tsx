import { useState } from 'react';
import { DEV_HOST_MATCHES, findPatternSiblings, patternOfPath, type RestoreReport, type Snapshot } from '@/core';
import { deleteSnapshot, removeRecipe, setPaused, togglePinSnapshot } from '@/storage';
import { askTab, enableAllSites, enableSite, restoreFields, restoreFrom, takeSnapshot } from './api';
import { FieldList } from './FieldList';
import { labelForKey, reasonText, splitPage, timeAgo } from './format';
import type { PopupData } from './usePopupData';

interface Props {
  data: PopupData;
  onChange: () => Promise<void>;
}

export function ThisPage({ data, onChange }: Props) {
  if (!data.tab) return <Inactive data={data} onChange={onChange} />;
  if (data.tab.paused) return <Paused data={data} onChange={onChange} />;
  return <Active data={data} onChange={onChange} />;
}

function Inactive({ data, onChange }: Props) {
  const [denied, setDenied] = useState(false);
  const hosts = DEV_HOST_MATCHES.map((m) => m.replace('*://', '').replace('/*', ''));
  const hostname = data.site ? new URL(data.site).hostname : undefined;

  async function enable(all: boolean) {
    const granted = all ? await enableAllSites(data.tabId) : await enableSite(data.site!, data.tabId);
    setDenied(!granted);
    await onChange();
  }

  return (
    <section className="pad stack">
      <p className="lead">Not running on this page.</p>
      <p className="muted">
        By default form-keeper only runs on development hosts, on any port:
      </p>
      <ul className="chips">
        {hosts.map((host) => (
          <li key={host}>{host}</li>
        ))}
      </ul>
      {hostname ? (
        <>
          <div className="actions-stack">
            <button className="btn btn-primary truncate" onClick={() => enable(false)} title={data.site}>
              Enable on {hostname}
            </button>
            <button className="btn" onClick={() => enable(true)}>
              Enable on all sites
            </button>
          </div>
          <p className="muted small">
            Chrome will ask for access. What you type is kept only in this browser; passwords, card
            numbers and hidden fields are never saved.
          </p>
          {denied && <p className="small danger-text">Access wasn't granted, so nothing changed.</p>}
        </>
      ) : (
        <p className="muted small">form-keeper can't run on browser pages like this one.</p>
      )}
    </section>
  );
}

function Paused({ data, onChange }: Props) {
  const { host } = splitPage(data.tab!.page);
  return (
    <section className="pad stack">
      <p className="lead">Paused on {host}.</p>
      <p className="muted">Nothing is saved or restored on this site until you resume. Saved forms are kept.</p>
      <button
        className="btn btn-primary"
        onClick={async () => {
          await setPaused(data.tab!.origin, false);
          await onChange();
        }}
      >
        Resume on {host}
      </button>
    </section>
  );
}

function RestoreSummary({ report }: { report?: RestoreReport }) {
  if (!report) return <p className="muted small summary">Restoring…</p>;
  const matched = report.restored.length + report.unchanged.length;
  const total = matched + report.missing.length + report.skipped.length;
  if (total === 0) return <p className="muted small summary">Nothing was saved for this page when it loaded.</p>;
  return (
    <p className="summary">
      <strong>{report.restored.length}</strong> restored · {matched} of {total} fields matched
      {report.missing.length > 0 && <span className="muted"> · {report.missing.length} not on page</span>}
    </p>
  );
}

function Active({ data, onChange }: Props) {
  const [notice, setNotice] = useState<string>();
  const tab = data.tab!;
  const tabId = data.tabId!;
  const { host, path } = splitPage(tab.page);
  const fields = data.record?.fields ?? {};
  const count = Object.keys(fields).length;
  const snapshots = data.record?.snapshots ?? [];
  const siblings = findPatternSiblings(tab.page, data.pages, data.settings.patterns);

  async function restore() {
    const report = await askTab(tabId, { type: 'restoreNow' });
    if (!report) return;
    const n = report.restored.length;
    setNotice(n ? `Restored ${n} field${n === 1 ? '' : 's'}.` : 'Everything already matches.');
    await onChange();
  }

  async function snapshot() {
    const res = await takeSnapshot(tabId);
    if (res) {
      setNotice('Snapshot saved.');
      await onChange();
    } else {
      setNotice('Form already matches latest snapshot.');
    }
  }

  async function clear() {
    await askTab(tabId, { type: 'clearPage' });
    setNotice('Cleared saved data for this page.');
    await onChange();
  }

  return (
    <>
      <section className="page pad">
        <div className="page-path" title={tab.page}>
          {path}
        </div>
        <div className="muted small">{host}</div>
        <RestoreSummary report={tab.report} />
      </section>

      <section className="fields">
        <div className="section-head pad-x">
          <h2>Working draft{count > 0 && <span className="count">{count}</span>}</h2>
          {data.record && <span className="muted small">{timeAgo(data.record.savedAt)}</span>}
        </div>
        {count === 0 ? (
          <>
            {siblings.length > 0 && (
              <div className="pattern-suggestion pad-x">
                <div className="pattern-suggestion-card">
                  <div className="pattern-suggestion-head">
                    <span className="tag">pattern match</span>
                    <span className="mono small">{patternOfPath(path, data.settings.patterns)}</span>
                  </div>
                  <p className="small muted">
                    Found saved form from <strong>{splitPage(siblings[0]!.page).path}</strong> ({timeAgo(siblings[0]!.savedAt)}).
                  </p>
                  <button
                    className="btn btn-small btn-primary"
                    onClick={async () => {
                      const rep = await restoreFrom(tabId, siblings[0]!.page);
                      if (rep) {
                        const matched = rep.restored.length + rep.unchanged.length;
                        setNotice(`Filled ${matched} fields from ${splitPage(siblings[0]!.page).path}.`);
                        await onChange();
                      }
                    }}
                  >
                    Fill from {splitPage(siblings[0]!.page).path}
                  </button>
                </div>
              </div>
            )}
            <p className="muted pad-x empty">
              Nothing saved yet. Start typing in a form, or fill it from another page in <em>Saved pages</em>.
            </p>
          </>
        ) : (
          <FieldList fields={fields} missing={new Set(tab.report?.missing)} />
        )}
      </section>

      {notice && (
        <p className="notice pad-x" role="status">
          {notice}
        </p>
      )}

      <Problems report={tab.report} />

      <section className="actions pad">
        <button className="btn btn-primary" disabled={count === 0} onClick={restore}>
          Restore draft
        </button>
        <button className="btn" disabled={count === 0} onClick={snapshot} title="Save a point-in-time snapshot of current form">
          Take snapshot
        </button>
        <button className="btn" disabled={count === 0 && snapshots.length === 0} onClick={clear}>
          Clear page
        </button>
      </section>

      <Snapshots snapshots={snapshots} page={tab.page} tabId={tabId} onChange={onChange} onNotice={setNotice} />

      <Taught data={data} onChange={onChange} />

      <label className="toggle pad-x">
        <input
          type="checkbox"
          checked={false}
          onChange={async () => {
            await setPaused(tab.origin, true);
            await onChange();
          }}
        />
        <span>Pause on {host}</span>
      </label>
    </>
  );
}

function Snapshots({
  snapshots,
  page,
  tabId,
  onChange,
  onNotice,
}: {
  snapshots: Snapshot[];
  page: string;
  tabId: number;
  onChange: () => Promise<void>;
  onNotice: (msg: string) => void;
}) {
  const [openId, setOpenId] = useState<string>();

  if (snapshots.length === 0) return null;

  return (
    <section className="snapshots pad-x">
      <div className="section-head">
        <h2>
          Snapshots <span className="count">{snapshots.length}</span>
        </h2>
      </div>
      <ul className="snapshot-list">
        {snapshots.map((snap) => {
          const isOpen = openId === snap.id;
          const count = Object.keys(snap.fields).length;
          return (
            <li key={snap.id} className={`snapshot-item${isOpen ? ' is-open' : ''}`}>
              <div className="snapshot-row">
                <button
                  className={`icon-btn pin-btn${snap.pinned ? ' is-pinned' : ''}`}
                  title={snap.pinned ? 'Pinned (never pruned). Click to unpin.' : 'Pin snapshot to prevent automatic retention pruning.'}
                  aria-label={snap.pinned ? 'Unpin snapshot' : 'Pin snapshot'}
                  onClick={async (e) => {
                    e.stopPropagation();
                    const nowPinned = await togglePinSnapshot(page, snap.id);
                    onNotice(nowPinned ? 'Pinned snapshot.' : 'Unpinned snapshot.');
                    await onChange();
                  }}
                >
                  <PinIcon filled={snap.pinned} />
                </button>

                <button
                  className="snapshot-main"
                  onClick={() => setOpenId(isOpen ? undefined : snap.id)}
                  aria-expanded={isOpen}
                  title="Click to view fields"
                >
                  <span className="snapshot-title">
                    <span className="snapshot-label">
                      {snap.label ?? (snap.trigger === 'submit' ? 'Submitted form' : 'Saved snapshot')}
                    </span>
                    {snap.trigger === 'submit' && <span className="tag-subtle">submit</span>}
                    {snap.trigger === 'restore' && <span className="tag-subtle">pre-restore</span>}
                  </span>
                  <span className="muted small">
                    {count} field{count === 1 ? '' : 's'} · {timeAgo(snap.savedAt)}
                  </span>
                </button>

                <button
                  className="btn btn-small"
                  title="Restore this snapshot into the form"
                  onClick={async () => {
                    const rep = await restoreFields(tabId, snap.fields);
                    if (rep) {
                      const n = rep.restored.length;
                      onNotice(n ? `Restored ${n} field${n === 1 ? '' : 's'} from snapshot.` : 'Form already matches this snapshot.');
                      await onChange();
                    }
                  }}
                >
                  Restore
                </button>

                <button
                  className="icon-btn"
                  title="Delete snapshot"
                  aria-label="Delete snapshot"
                  onClick={async (e) => {
                    e.stopPropagation();
                    await deleteSnapshot(page, snap.id);
                    if (openId === snap.id) setOpenId(undefined);
                    onNotice('Snapshot deleted.');
                    await onChange();
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
    </section>
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


/** Fields that were found on the page but could not be filled, and why. */
function Problems({ report }: { report?: RestoreReport }) {
  if (!report || report.skipped.length === 0) return null;
  return (
    <section className="problems pad-x" aria-label="Not restored">
      <h2 className="label">Couldn't restore {report.skipped.length}</h2>
      <ul>
        {report.skipped.map(({ key, reason }) => (
          <li key={key} title={key}>
            <span>{labelForKey(key).name}</span>
            <span className="muted small">{reasonText(reason)}</span>
          </li>
        ))}
      </ul>
      <p className="muted small">A control that is not a standard form field may need teaching, below.</p>
    </section>
  );
}

/** Teach mode entry point, and the controls already taught on this site. */
function Taught({ data, onChange }: Props) {
  const [copied, setCopied] = useState(false);
  async function copyDiagnostics() {
    const report = await askTab(data.tabId!, { type: 'diagnose' });
    if (!report) return;
    await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 4000);
  }
  async function teach() {
    await askTab(data.tabId!, { type: 'teach' });
    window.close(); // the popup would cover the page the user needs to click on
    // When the popup is a plain tab (tests), closing is a no-op; the banner is already up.
  }
  return (
    <section className="taught pad-x">
      <div className="teach-row">
        <button className="btn btn-small" onClick={teach} title="Use a control once and form-keeper learns to save and restore it">
          Teach a control
        </button>
        <span className="muted small">For custom dropdowns it doesn't recognise.</span>
      </div>
      <button className="link" onClick={copyDiagnostics} title="Copies a description of what form-keeper found on this page, to paste into a bug report">
        {copied ? 'Copied. Paste it into your bug report.' : 'Copy diagnostics'}
      </button>
      {data.recipes.length > 0 && (
        <ul className="recipe-list">
          {data.recipes.map((recipe) => (
            <li key={recipe.id}>
              <span>{recipe.label ?? `${recipe.tag} control`}</span>
              <button
                className="link"
                onClick={async () => {
                  await removeRecipe(data.tab!.origin, recipe.id);
                  await onChange();
                }}
              >
                Forget
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
