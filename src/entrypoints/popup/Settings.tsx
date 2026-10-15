import { useState } from 'react';
import { browser } from 'wxt/browser';
import { DEV_HOST_MATCHES, type UpdateCheckResult } from '@/core';
import { checkUpdateWithCache, saveSettings } from '@/storage';
import { disableAllSites, disableSite, enableAllSites } from './api';
import type { PopupData } from './usePopupData';

export function Settings({ data, onChange }: { data: PopupData; onChange: () => Promise<void> }) {
  const [denied, setDenied] = useState(false);
  const [patternInput, setPatternInput] = useState('');
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | undefined>(data.updateInfo);
  const currentVersion = browser.runtime?.getManifest ? browser.runtime.getManifest().version : '0.5.0';
  const hosts = DEV_HOST_MATCHES.map((m) => m.replace('*://', '').replace('/*', ''));
  const { allSites, sites, saveFilesOnOtherSites } = data.settings;
  const patterns = data.settings.patterns ?? [];

  return (
    <section className="pad stack settings">
      <div className="stack-sm">
        <h2 className="label">Always on</h2>
        <ul className="chips">
          {hosts.map((host) => (
            <li key={host}>{host}</li>
          ))}
        </ul>
      </div>

      <label className="toggle row">
        <input
          type="checkbox"
          checked={allSites}
          onChange={async (e) => {
            if (e.target.checked) setDenied(!(await enableAllSites()));
            else await disableAllSites();
            await onChange();
          }}
        />
        <span>
          <strong>Run on all sites</strong>
          <span className="muted small block">Every http and https page. Chrome will ask for access.</span>
        </span>
      </label>
      {denied && <p className="small danger-text">Access wasn't granted, so nothing changed.</p>}

      <label className="toggle row">
        <input
          type="checkbox"
          checked={saveFilesOnOtherSites}
          onChange={async (e) => {
            await saveSettings({ ...data.settings, saveFilesOnOtherSites: e.target.checked });
            await onChange();
          }}
        />
        <span>
          <strong>Save attached files on other sites</strong>
          <span className="muted small block">
            Files you choose in an upload field are kept on this computer so they can be re-attached. Always on for development sites.
          </span>
        </span>
      </label>

      <div className="stack-sm">
        <h2 className="label">Custom URL patterns{patterns.length > 0 && <span className="count">{patterns.length}</span>}</h2>
        <p className="muted small">
          Numeric and UUID segments are automatically grouped as <code>:id</code>. Add custom route patterns to group parameterized paths.
        </p>
        <form
          className="row"
          style={{ gap: 6 }}
          onSubmit={async (e) => {
            e.preventDefault();
            const val = patternInput.trim();
            if (!val) return;
            const normalized = val.startsWith('/') ? val : `/${val}`;
            if (!patterns.includes(normalized)) {
              await saveSettings({ ...data.settings, patterns: [...patterns, normalized] });
              setPatternInput('');
              await onChange();
            }
          }}
        >
          <input
            type="text"
            placeholder="/orgs/:org/repos/:repo"
            value={patternInput}
            onChange={(e) => setPatternInput(e.target.value)}
            aria-label="Add custom route pattern"
            style={{ flex: 1 }}
          />
          <button type="submit" className="btn btn-small" disabled={!patternInput.trim()}>
            Add
          </button>
        </form>
        {patterns.length > 0 && (
          <ul className="site-list">
            {patterns.map((pat) => (
              <li key={pat}>
                <span className="mono">{pat}</span>
                <button
                  type="button"
                  className="link"
                  onClick={async () => {
                    await saveSettings({
                      ...data.settings,
                      patterns: patterns.filter((p) => p !== pat),
                    });
                    await onChange();
                  }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="stack-sm">
        <h2 className="label">Enabled sites{sites.length > 0 && <span className="count">{sites.length}</span>}</h2>
        {sites.length === 0 ? (
          <p className="muted small">None yet. Open a site and choose “Enable on …” in the popup.</p>
        ) : (
          <ul className="site-list">
            {sites.map((site) => (
              <li key={site}>
                <span className="mono">{site.replace(/^https?:\/\//, '')}</span>
                <span className="muted small">{site.startsWith('https') ? 'https' : 'http'}</span>
                <button
                  className="link"
                  onClick={async () => {
                    await disableSite(site);
                    await onChange();
                  }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="stack-sm">
        <h2 className="label">Version & Updates</h2>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span className="mono">v{currentVersion}</span>
            {updateResult?.available ? (
              <span className="small danger-text block" style={{ fontWeight: 600 }}>
                v{updateResult.latestVersion} is available!
              </span>
            ) : updateResult ? (
              <span className="muted small block">You are on the latest version.</span>
            ) : null}
          </div>
          <div className="row" style={{ gap: 6 }}>
            {updateResult?.available && (
              <a
                href={updateResult.releaseUrl}
                target="_blank"
                rel="noreferrer"
                className="btn btn-small btn-primary"
              >
                View release
              </a>
            )}
            <button
              type="button"
              className="btn btn-small"
              disabled={checkingUpdate}
              onClick={async () => {
                setCheckingUpdate(true);
                try {
                  const res = await checkUpdateWithCache(currentVersion, true);
                  setUpdateResult(res);
                  await onChange();
                } finally {
                  setCheckingUpdate(false);
                }
              }}
            >
              {checkingUpdate ? 'Checking…' : 'Check now'}
            </button>
          </div>
        </div>
      </div>

      <p className="muted small">
        Saved forms stay in this browser only. Passwords, card numbers, hidden fields and anything
        marked <code>data-form-keeper="off"</code> are never saved.
      </p>
    </section>
  );
}
