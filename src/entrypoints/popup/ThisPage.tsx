import { useState } from 'react';
import { DEV_HOST_MATCHES, type RestoreReport } from '@/core';
import { removeRecipe, setPaused } from '@/storage';
import { askTab, enableAllSites, enableSite } from './api';
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

  async function restore() {
    const report = await askTab(tabId, { type: 'restoreNow' });
    if (!report) return;
    const n = report.restored.length;
    setNotice(n ? `Restored ${n} field${n === 1 ? '' : 's'}.` : 'Everything already matches.');
    await onChange();
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
          <h2>Saved fields{count > 0 && <span className="count">{count}</span>}</h2>
          {data.record && <span className="muted small">{timeAgo(data.record.savedAt)}</span>}
        </div>
        {count === 0 ? (
          <p className="muted pad-x empty">
            Nothing saved yet. Start typing in a form, or fill it from another page in <em>Saved pages</em>.
          </p>
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
          Restore now
        </button>
        <button className="btn" disabled={count === 0} onClick={clear}>
          Clear this page
        </button>
      </section>

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
