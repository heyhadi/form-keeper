import { useState } from 'react';
import { Settings } from './Settings';
import { SavedPages } from './SavedPages';
import { ThisPage } from './ThisPage';
import { usePopupData, type PopupData } from './usePopupData';
import { formatBytes } from './format';
import { clearAllPages } from '@/storage';
import { askTab } from './api';

type View = 'page' | 'saved' | 'settings';

export function App() {
  const { data, refresh } = usePopupData();
  const [view, setView] = useState<View>('page');

  return (
    <main className="popup">
      <header className="header">
        {view === 'settings' ? (
          <button className="icon-btn" aria-label="Back" onClick={() => setView('page')}>
            ←
          </button>
        ) : (
          <img src="/icon/32.png" alt="" width={20} height={20} />
        )}
        <h1>{view === 'settings' ? 'Sites' : 'form-keeper'}</h1>
        {view !== 'settings' && <StatusPill data={data} />}
        {view !== 'settings' && (
          <button className="icon-btn" aria-label="Site settings" title="Where form-keeper runs" onClick={() => setView('settings')}>
            <GearIcon />
          </button>
        )}
      </header>

      {view === 'settings' ? (
        <Settings data={data} onChange={refresh} />
      ) : (
        <>
          <nav className="tabs" role="tablist">
            <button role="tab" aria-selected={view === 'page'} onClick={() => setView('page')}>
              This page
            </button>
            <button role="tab" aria-selected={view === 'saved'} onClick={() => setView('saved')}>
              Saved pages{data.pages.length > 0 && <span className="count">{data.pages.length}</span>}
            </button>
          </nav>
          {data.loading ? (
            <p className="muted pad">Checking this page…</p>
          ) : view === 'page' ? (
            <ThisPage data={data} onChange={refresh} />
          ) : (
            <SavedPages data={data} onChange={refresh} />
          )}
          <Footer data={data} onChange={refresh} />
        </>
      )}
    </main>
  );
}

function StatusPill({ data }: { data: PopupData }) {
  if (data.loading) return null;
  const state = !data.tab ? 'inactive' : data.tab.paused ? 'paused' : 'active';
  const label = { active: 'Active', paused: 'Paused', inactive: 'Inactive' }[state];
  return (
    <span className={`pill pill-${state}`}>
      <span className="dot" aria-hidden />
      {label}
    </span>
  );
}

function Footer({ data, onChange }: { data: PopupData; onChange: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  const count = data.pages.length;
  return (
    <footer className="footer pad-x">
      <span className="muted small">
        {count} page{count === 1 ? '' : 's'} saved · {formatBytes(data.bytes)}
      </span>
      {count > 0 && (
        <button
          className={confirming ? 'link danger' : 'link'}
          onBlur={() => setConfirming(false)}
          onClick={async () => {
            if (!confirming) return setConfirming(true);
            setConfirming(false);
            await clearAllPages();
            // Let the running page forget what it had loaded, so it isn't written back.
            if (data.tabId !== undefined && data.tab) await askTab(data.tabId, { type: 'clearPage' });
            await onChange();
          }}
        >
          {confirming ? 'Click again to clear all' : 'Clear all'}
        </button>
      )}
    </footer>
  );
}

function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
