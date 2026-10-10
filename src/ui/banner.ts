/**
 * A small floating banner for teach mode, in a shadow root so the page's own CSS can't touch it
 * and ours can't leak out.
 */
export interface Banner {
  host: HTMLElement;
  /** Replace the text, optionally with a Cancel button. */
  show(message: string, options?: { cancel?: () => void; tone?: 'info' | 'ok' | 'error' }): void;
  remove(): void;
}

const STYLE = `
  .bar { all: initial; position: fixed; top: 12px; left: 50%; transform: translateX(-50%); z-index: 2147483647;
    display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-radius: 10px;
    font: 13px/1.4 system-ui, -apple-system, 'Segoe UI', sans-serif; color: #fff; background: #3730a3;
    box-shadow: 0 6px 24px rgba(0,0,0,.35); max-width: min(560px, calc(100vw - 24px)); }
  .bar.ok { background: #15803d; } .bar.error { background: #b91c1c; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: #fff; flex: none; }
  .info .dot { animation: pulse 1.2s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: .25; } }
  button { all: unset; cursor: pointer; padding: 3px 10px; border-radius: 6px; background: rgba(255,255,255,.2); font-weight: 600; }
  button:hover { background: rgba(255,255,255,.32); }
  button:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
`;

export function createBanner(doc: Document): Banner {
  const host = doc.createElement('form-keeper-banner');
  const shadow = host.attachShadow({ mode: 'open' });
  const style = doc.createElement('style');
  style.textContent = STYLE;
  const bar = doc.createElement('div');
  bar.setAttribute('role', 'status');
  shadow.append(style, bar);
  doc.documentElement.append(host);

  return {
    host,
    show(message, { cancel, tone = 'info' } = {}) {
      bar.className = `bar ${tone}`;
      bar.replaceChildren();
      const dot = doc.createElement('span');
      dot.className = 'dot';
      const text = doc.createElement('span');
      text.textContent = message;
      bar.append(dot, text);
      if (cancel) {
        const button = doc.createElement('button');
        button.textContent = 'Cancel';
        button.addEventListener('click', cancel);
        bar.append(button);
      }
    },
    remove: () => host.remove(),
  };
}
