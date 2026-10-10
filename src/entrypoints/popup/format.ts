import type { FieldValue } from '@/core';

export interface FieldLabel {
  name: string;
  /** The form it belongs to, when there is one. */
  scope?: string;
}

/** Turns a field key such as `form#signup name=tags value=a #2` into something readable. */
export function labelForKey(key: string): FieldLabel {
  const space = key.indexOf(' ');
  const scope = key.slice(0, space);
  let identity = key.slice(space + 1);
  let suffix = '';
  const dup = / (#\d+)$/.exec(identity);
  if (dup) {
    suffix = ` ${dup[1]}`;
    identity = identity.slice(0, dup.index);
  }

  let name: string;
  const checkbox = /^name=(.*) value=(.*)$/.exec(identity);
  if (checkbox) name = `${checkbox[1]} (${checkbox[2]})`;
  else if (identity.startsWith('name=')) name = identity.slice(5);
  else if (identity.startsWith('radio=')) name = identity.slice(6);
  else if (identity.startsWith('id=')) name = `#${identity.slice(3)}`;
  else if (identity.startsWith('label=')) name = identity.slice(6);
  else if (identity.startsWith('widget=')) name = identity.slice(7);
  else if (identity.startsWith('widget id=')) name = `#${identity.slice(10)}`;
  else name = 'unnamed field';

  const formScope = scope === 'page' ? undefined : scope.replace(/^form#/, '#').replace(/^form\[name=(.*)\]$/, '$1');
  return { name: name + suffix, scope: formScope };
}

const MAX_PREVIEW = 48;

/** Short, single-line preview of a saved value. `empty` marks values worth dimming. */
export function previewValue(value: FieldValue): { text: string; empty: boolean } {
  switch (value.kind) {
    case 'text': {
      const oneLine = value.value.replace(/\s+/g, ' ').trim();
      if (!oneLine) return { text: 'empty', empty: true };
      return { text: oneLine.length > MAX_PREVIEW ? `${oneLine.slice(0, MAX_PREVIEW - 1)}…` : oneLine, empty: false };
    }
    case 'checkbox':
      return { text: value.checked ? 'checked' : 'unchecked', empty: !value.checked };
    case 'radio':
      return value.value === null ? { text: 'none', empty: true } : { text: value.value, empty: false };
    case 'multi':
      return value.values.length ? { text: value.values.join(', '), empty: false } : { text: 'none', empty: true };
    case 'widget':
      if (value.widget === 'toggle') return { text: value.labels[0] === 'on' ? 'on' : 'off', empty: value.labels[0] !== 'on' };
      return value.labels.length ? { text: value.labels.join(', ').slice(0, MAX_PREVIEW), empty: false } : { text: 'none', empty: true };
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function timeAgo(then: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

/** `http://localhost:5173/users/1/edit` -> host `localhost:5173`, path `/users/1/edit`. */
export function splitPage(page: string): { host: string; path: string } {
  const url = new URL(page);
  return { host: url.host, path: url.pathname };
}

const REASONS: Record<string, string> = {
  'no-option': 'option not found in the list',
  rejected: 'the page did not accept the value',
  disabled: 'field is disabled',
  readonly: 'field is read-only',
  'kind-mismatch': 'the field changed type',
};

export function reasonText(reason: string): string {
  return REASONS[reason] ?? reason;
}
