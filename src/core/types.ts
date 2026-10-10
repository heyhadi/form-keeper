/** What we persist for a single field, keyed by its field key. */
export type FieldValue =
  | { kind: 'text'; value: string }
  | { kind: 'checkbox'; checked: boolean }
  | { kind: 'radio'; value: string | null }
  | { kind: 'multi'; values: string[] }
  /** A custom control that is not a real form field. Stored as what the user sees: option labels. */
  | { kind: 'widget'; widget: string; labels: string[] };

export type FieldKind = FieldValue['kind'];

export type SavedFields = Record<string, FieldValue>;

export type FormControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

/** A logical field on the page. A radio group is one field backed by several inputs. */
export type Field =
  | { kind: 'text'; key: string; el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement }
  | { kind: 'checkbox'; key: string; el: HTMLInputElement }
  | { kind: 'radio'; key: string; els: HTMLInputElement[] }
  | { kind: 'multi'; key: string; el: HTMLSelectElement }
  | { kind: 'widget'; key: string; el: HTMLElement; adapter: WidgetAdapter };

export type WriteOutcome = 'restored' | 'unchanged' | 'no-option' | 'rejected' | 'disabled';

/** Teaches form-keeper to read and drive one family of custom controls. */
export interface WidgetAdapter {
  id: string;
  /** Widget roots under `root`. Roots that overlap an earlier adapter's are dropped. */
  find(root: ParentNode): HTMLElement[];
  /** What the user currently sees selected or typed. Empty when nothing is. */
  read(widget: HTMLElement): string[];
  write(widget: HTMLElement, labels: string[]): Promise<WriteOutcome>;
  /** The element that carries the field's accessible name, when it isn't the root. */
  anchor?(widget: HTMLElement): HTMLElement;
}

export type SkipReason = 'disabled' | 'readonly' | 'kind-mismatch' | 'no-option' | 'rejected';

export interface RestoreReport {
  /** Keys whose value we changed. */
  restored: string[];
  /** Keys that already held the saved value. */
  unchanged: string[];
  /** Keys present on the page that we could not (or chose not to) set. */
  skipped: { key: string; reason: SkipReason }[];
  /** Saved keys with no matching field on the page. */
  missing: string[];
}
