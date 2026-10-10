import type { StoredFile } from './types';

/**
 * File inputs. The browser never lets a page set a file input's value, but it does let a script
 * assign `input.files` from a `DataTransfer`, which is how drag-and-drop works. So we keep the
 * bytes of what the user chose and rebuild the files later, then fire `change` so the app
 * regenerates its previews exactly as if the user had just picked them.
 */

/** Bigger files are remembered by name only. */
export const MAX_FILE_BYTES = 8 * 1024 * 1024;
/** Per page; the rest are remembered by name only. */
export const MAX_PAGE_BYTES = 20 * 1024 * 1024;

let enabled = true;

/** Off on sites where the user has not opted in to saving files; see the site settings. */
export function setFilesEnabled(on: boolean): void {
  enabled = on;
}
export const filesEnabled = () => enabled;

/** Contents by identity of the file, so a re-chosen file is not read twice. */
const bytes = new Map<string, string>();
const MAX_CACHED = 64;

const signature = (f: { name: string; size: number; type: string; lastModified: number }) => `${f.name}|${f.size}|${f.type}|${f.lastModified}`;

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',', 2)[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Read the chosen files so a later (synchronous) serialize can include them. */
export async function captureFiles(input: HTMLInputElement): Promise<void> {
  let budget = MAX_PAGE_BYTES;
  for (const file of Array.from(input.files ?? [])) {
    const sig = signature(file);
    // Same limits as `describeFiles`, so we never read bytes that would be dropped anyway.
    if (file.size > MAX_FILE_BYTES || file.size > budget) continue;
    budget -= file.size;
    if (bytes.has(sig)) continue;
    try {
      bytes.set(sig, await readBase64(file));
    } catch {
      // an unreadable file (deleted since it was picked) is simply not remembered
    }
    if (bytes.size > MAX_CACHED) bytes.delete(bytes.keys().next().value!);
  }
}

/** What to store for the files currently in the input. */
export function describeFiles(input: HTMLInputElement): StoredFile[] {
  let budget = MAX_PAGE_BYTES;
  const out: StoredFile[] = [];
  for (const file of Array.from(input.files ?? [])) {
    const meta = { name: file.name, type: file.type, size: file.size, lastModified: file.lastModified };
    if (file.size > MAX_FILE_BYTES) out.push({ ...meta, skipped: 'too-large' });
    else if (file.size > budget) out.push({ ...meta, skipped: 'budget' });
    else {
      const data = bytes.get(signature(file));
      if (data === undefined) continue; // still being read; the caller waits for captureFiles first
      budget -= file.size;
      out.push({ ...meta, data });
    }
  }
  return out;
}

export const sameFiles = (input: HTMLInputElement, stored: StoredFile[]): boolean => {
  const have = Array.from(input.files ?? []);
  return have.length === stored.length && have.every((f, i) => signature(f) === signature(stored[i]!));
};

function toFile(stored: StoredFile): File {
  const raw = atob(stored.data!);
  const buffer = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buffer[i] = raw.charCodeAt(i);
  return new File([buffer], stored.name, { type: stored.type, lastModified: stored.lastModified });
}

/** Attach stored files to the input. Returns false when the browser refuses. */
export function attachFiles(input: HTMLInputElement, stored: StoredFile[]): boolean {
  const usable = stored.filter((f) => f.data !== undefined);
  const transfer = new DataTransfer();
  for (const file of input.multiple ? usable : usable.slice(0, 1)) {
    transfer.items.add(toFile(file));
    bytes.set(signature(file), file.data!); // so the next save keeps them
  }
  input.files = transfer.files;
  return input.files?.length === transfer.files.length;
}
