import { useState } from 'react';
import { DEV_HOST_MATCHES } from '@/core';
import { disableAllSites, disableSite, enableAllSites } from './api';
import type { PopupData } from './usePopupData';

export function Settings({ data, onChange }: { data: PopupData; onChange: () => Promise<void> }) {
  const [denied, setDenied] = useState(false);
  const hosts = DEV_HOST_MATCHES.map((m) => m.replace('*://', '').replace('/*', ''));
  const { allSites, sites } = data.settings;

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

      <p className="muted small">
        Saved forms stay in this browser only. Passwords, card numbers, hidden fields and anything
        marked <code>data-form-keeper="off"</code> are never saved.
      </p>
    </section>
  );
}
