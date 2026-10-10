# form-keeper

A Chrome extension for frontend developers: fill a form on your dev server, reload, and every
field comes back — including in React, Vue and Svelte apps where setting `input.value` is not
enough.

> **Status: milestone 2 of 7, plus custom controls.** Native fields and most UI-library widgets
> (dropdowns, date pickers, switches, rich text) are saved and restored in plain HTML, React,
> Vue and Svelte apps, including forms that render late and client-side routes. File inputs,
> snapshot history and the side panel are on the [roadmap](#roadmap).

## What it does today

- Runs on dev hosts out of the box: `localhost`, `127.0.0.1`, `*.localhost`, `*.local` (any
  port). Other sites can be enabled one by one, or all at once, from the popup; Chrome asks for
  access only then.
- Saves text-like inputs, textareas, checkboxes, radio groups, and single and multiple selects
  as you type (debounced 300 ms, flushed when the tab is hidden).
- Restores them when the page loads, and keeps filling fields as they appear for 10 seconds, so
  forms that render after data loads, options that load late and fields that get enabled later
  are all covered.
- Follows client-side navigation: each route of a single-page app is saved separately.
- Shows whether it is running: the toolbar icon is coloured with an **ON** badge (or the number
  of fields restored) on dev hosts, and grey everywhere else.
- Has a popup with two tabs. **This page** lists what is saved here, with **Restore now**,
  **Clear this page** and **Pause on this site**. **Saved pages** lists every saved URL: search,
  peek at the fields, delete, or **Fill here** to copy one page's values into the current form
  (matched by field name, so `/users/1/edit` can fill `/users/2/edit`, or a staging form your
  local one). The gear opens site settings.
- Never saves passwords, hidden inputs (CSRF tokens), file inputs, `autocomplete="cc-*"` fields,
  or anything inside `data-form-keeper="off"`.
- Stores everything in `chrome.storage.local`. Nothing leaves your machine. The only permission
  is `storage`.

## Try it

```sh
npm install
npm run dev        # opens Chrome with the extension loaded and hot-reloading
npm run fixtures   # test pages at http://localhost:5174 (HTML, React, Vue, Svelte, SPA)
```

Or `npm run build` and load `.output/chrome-mv3` as an unpacked extension.

## How it works

The core (`src/core`) is plain DOM code with no extension APIs, so it is unit-tested in jsdom.
The content script and storage layer are a thin wrapper around it.

**Field keys.** Saved values are matched back to fields by a key built from markup only:
`<form scope> <field identity>`, for example `form#signup name=email`. The scope is the form's
`id`, then `name`, then its index on the page (`page` if there is no form). The identity is the
field's `name`, then `id`, then its tag path. `name` wins because it is what the server receives,
so apps keep it stable; ids are often generated. Repeated keys get a `#2`, `#3` suffix.

**Restoring into frameworks.** React keeps its own copy of each controlled input's value. Writing
`el.value = x` updates that copy as well, so React treats the following `input` event as a
no-op and re-renders the old state. form-keeper calls the native `value` setter from the
element's prototype instead, then fires `input` and `change`. Checkboxes and radios are toggled
with a real `click()`, because React drives their `onChange` from `click`. A test in
`tests/react.test.tsx` shows the naive approach failing.

**No save loop.** Restoring fires the same events as typing. The session ignores events raised
during its own restore, and skips writes whose content matches what is already stored.

**Late and conditional fields.** A MutationObserver watches for added fields, added `<option>`s
and `disabled`/`readonly` changes, and retries only the fields still pending (bursts are batched
50 ms apart). It stops after 10 seconds, or as soon as you start typing, so it never overwrites
your input. Fields that are not on screen (another wizard step, a collapsed section) stay in
storage instead of being dropped.

**Single-page apps.** The current URL is checked on every edit and DOM change (plus `popstate`
and the Navigation API), so a client-side route change is noticed before the next keystroke is
saved. Fields are serialized when you type, not when the debounced write fires; otherwise a
quick navigation would save the next route's form under the previous URL.

**Custom controls (dropdowns, date pickers, switches, rich text).** These are not form fields,
so there is nothing to read a value from. Instead of one adapter per library, form-keeper works
in layers, and a control uses the first one that fits:

1. *Taught controls* (below), which always win over a guess.
2. *Standards*: ARIA `combobox`/`listbox`/`option` (react-select, Ant Design, MUI, Radix, Headless UI
   and anything else that follows the pattern), `role="switch"`/`checkbox`/`radiogroup`,
   segmented date fields (`role="spinbutton"` parts), and `contenteditable` rich text.
3. *Plain interaction*: the value saved is what the user sees (the option's label), restored the
   way a person would: open it, find the option, click it. Clicks are tried as pointer events,
   then as a keyboard Enter, because some libraries only react to one.

Field identity ignores anything that changes with the value (live regions, `aria-labelledby`
pointing back at the widget) and uses the visible label, so a key is the same before and after a
choice. A widget that still shows its first reading ("Choose…", "None") is treated as empty.

**Teaching a control.** For a control that follows no standard, open the popup, press **Teach a
control**, then use the control once on the page. form-keeper records how to find it (label,
position) and what to click to open it; after that, options are matched by their text alone, so it
works for any markup. Taught controls are listed in the popup and can be forgotten. The popup
also lists fields that could not be restored, with the reason.

**Debugging a widget.** Set `localStorage['form-keeper:debug'] = '1'` on the page and the console
logs what every widget attempt does.

**Filling from another page.** Values are re-keyed to the current page: exact key matches
first, then the first unclaimed field with the same name and kind, in DOM order. This looser
matching is only used when you ask for it; automatic restore stays exact, so it can never put a
value into the wrong form.

**Other sites.** Host access is an optional permission requested per site (or for all http/https
pages) from a click in the popup. The background worker registers the content script for the
granted sites at runtime with `chrome.scripting`, and the popup injects it into the open tab so
it starts without a reload. Revoking access in Chrome's own settings removes the site here too.

**Active/inactive state.** Only the content script knows it is running, so it reports to the
background worker, which paints that tab's icon and badge. The popup asks the content script
for its state; no answer means the page is not a dev host.

## Development

```sh
npm test           # unit tests (Vitest + jsdom), including a React controlled-form test
npm run e2e        # builds a test copy, then drives real Chromium with it loaded (Playwright)
npm run typecheck
node scripts/generate-icons.mjs   # regenerate the toolbar icons in public/
```

The e2e build goes to `.output-e2e` with all hosts pre-granted, because Playwright can't click
Chrome's permission prompt. Don't load that copy for daily use. The end-to-end tests open a fresh tab rather than reloading, so Chrome's own form restoration
can't make a test pass by accident.

## Roadmap

1. ~~Save and restore native fields~~
2. ~~Late-rendered forms, Vue/Svelte, SPA routes, active indicator and popup~~
3. File and image inputs, rebuilt with `DataTransfer`
4. Snapshot history: working draft → snapshots, dedupe, retention, pinning
5. Side panel UI (React): browse, search, preview, restore
6. URL pattern grouping (`/users/:id/edit`); cross-page fill already exists via **Fill here**
7. Demo, docs, Chrome Web Store

## Known limits (for now)

- Fields inside shadow DOM and iframes are not captured.
- Drag-and-drop uploaders and file inputs come in milestone 3.
- Widgets whose options load from a server only after typing (async search boxes) restore only
  if the option appears after the saved text is typed.
- Teach mode handles dropdown-style controls; teaching calendars or other multi-step pickers is
  not supported yet.
