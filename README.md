<p align="center">
  <img src="docs/images/icon.png" width="84" alt="form-keeper icon">
</p>

<h1 align="center">form-keeper</h1>

<p align="center">
  <strong>Reload without losing your forms.</strong><br>
  A Chrome extension that saves what you type in a form and puts it back after a refresh,
  including in React, Vue and Svelte apps, and including custom dropdowns and date pickers.
</p>

<p align="center">
  <a href="https://heyhadi.github.io/form-keeper/">Website</a> ·
  <a href="INSTALL.md">Install</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#development">Development</a>
</p>

![form-keeper restoring a form after a reload](docs/images/1-restores-your-form.png)

## Install

**Chrome Web Store:** coming soon. Until then it takes about a minute to install by hand, and
[INSTALL.md](INSTALL.md) walks through it step by step with no technical knowledge needed:

1. [Download the latest zip](https://github.com/heyhadi/form-keeper/releases/latest/download/form-keeper-chrome.zip) and unzip it.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and choose the unzipped folder.

Works in Chrome, Edge, Brave and other Chromium browsers.

## What it does

|  |  |
|---|---|
| **Saves as you type, restores on load.** Text, textareas, checkboxes, radios, selects, and attached files and images. Forms that render late, and client-side routes, are covered. | **Works with your framework.** Restored values reach React, Vue and Svelte state, not just the screen. |
| **Dropdowns and date pickers too.** react-select, Ant Design, MUI, Radix, Headless UI, react-datepicker and anything that follows the standard patterns. | **Teach it anything else.** Use an unusual control once and form-keeper learns how to save and restore it. |

![Dropdowns and date pickers restored](docs/images/2-dropdowns-and-pickers.png)

- **Runs on dev hosts out of the box** (`localhost`, `127.0.0.1`, `*.localhost`, `*.local`, any
  port). Any other site is opt-in from the popup: Chrome asks for access, and only then.
- **Shows whether it is running.** The toolbar icon is coloured with an **ON** badge (or the
  number of fields restored) where it is active, and grey everywhere else.
- **Popup with two tabs.** *This page* lists what is saved, with **Restore now**, **Clear this
  page** and **Pause on this site**. *Saved pages* lists every saved URL, with search, a peek at
  the fields, delete, and **Fill here** to copy one page's values into the form you are on.
- **Tells you what it could not restore,** and why.
- **Remembers files.** Pick a profile photo or a document, reload, and it is attached again with
  its preview. Always on for dev sites; on other sites it is a separate opt-in. Files over 8 MB
  are remembered by name only.
- **Private.** Everything stays in `chrome.storage.local`. Nothing is sent anywhere. Passwords,
  hidden inputs (CSRF tokens), `autocomplete="cc-*"` fields and anything inside
  `data-form-keeper="off"` are never saved. See the [privacy policy](docs/privacy.html).

![Reuse a form on any other page](docs/images/3-fill-from-another-page.png)

### Teach mode

![Teaching a custom control](docs/images/4-teach-any-control.png)

For a control that follows no standard, open the popup, press **Teach a control**, then use the
control once on the page. form-keeper records how to find it and what to click to open it, and
from then on matches options by their text alone, so it works with any markup. Taught controls
are listed in the popup and can be forgotten.

### Permissions

| Permission | Why |
|---|---|
| `storage`, `unlimitedStorage` | Keep saved forms, and the files you attach, in your browser. |
| Content script on `localhost`, `127.0.0.1`, `*.localhost`, `*.local` | Read and fill form fields on development sites. |
| `activeTab` | Learn the address of the tab you open the popup on, to offer "Enable on this site". |
| `scripting` | Start on a site the moment you enable it, without a reload. |
| Optional: `http://*/*`, `https://*/*` | Only requested when you enable a site (or all sites) from the popup. |

![Private, local, only where you say](docs/images/5-private-by-design.png)

## How it works

The core (`src/core`) is plain DOM code with no extension APIs, so it is unit-tested in jsdom.
The content script, background worker, storage layer and React popup are thin wrappers around it.

**Field keys.** Saved values are matched back to fields by a key built from markup only:
`<form scope> <field identity>`, for example `form#signup name=email`. The scope is the form's
`id`, then `name`, then its index on the page (`page` if there is no form). The identity is the
field's `name`, then its `id` (unless a library generated it), then its visible label, then its
tag path. `name` wins because it is what the server receives, so apps keep it stable.

**Restoring into frameworks.** React keeps its own copy of each controlled input's value. Writing
`el.value = x` updates that copy as well, so React treats the following `input` event as a
no-op and re-renders the old state. form-keeper calls the native `value` setter from the
element's prototype instead, then fires `input` and `change`. Checkboxes and radios are toggled
with a real `click()`, because React drives their `onChange` from `click`. A test in
`tests/react.test.tsx` shows the naive approach failing.

**No save loop.** Restoring fires the same events as typing. The keeper ignores events raised
during its own restore, and skips writes whose content matches what is already stored.

**Late and conditional fields.** A MutationObserver watches for added fields, added `<option>`s
and `disabled`/`readonly` changes, and retries only the fields still pending. Fields that depend on others (a dropdown disabled until
another is set, whose options load from a server afterwards) give the page no signal when they
become ready, so pending fields are also retried on a back-off timer. It stops after 15 seconds, or
as soon as you start typing, so it never overwrites your input. Fields that are not
on screen (another wizard step, a collapsed section) stay in storage instead of being dropped.

**Matching the saved choice to a menu option.** Menus rarely print a choice exactly as the control
showed it. Comparison goes from strict to loose: exact, then ignoring case, accents, spaces and
punctuation (`Trust & Safety ,` equals `trust safety`), then prefix and containment in both
directions (a menu entry with a count, or a control that appended one). Among several loose hits
the least embellished wins, and nothing is chosen when it would be a guess.

**You always win.** After a reload form-keeper may spend several seconds filling dependent fields. A
real person's interaction with a field ends that at once, aborts any dropdown it is driving, and is
saved normally; form-keeper tells its own events apart from yours by tracking its own synchronous
dispatches (the `change` a scripted checkbox `click()` causes is flagged trusted by the browser, so
`isTrusted` alone is not enough). A save requested while it is mid-restore is deferred, not dropped.

**Reading never depends on scroll position.** A dropdown scrolled above the window is still showing
its value. Visibility checks that exist to ignore closed popups parked at negative coordinates must
not be applied when reading what a control shows, otherwise every control you scroll past reads as
empty and the next save overwrites its stored value. Reading ignores position and opacity; only
popup detection uses them.

**Speed.** Restoring seven dropdowns dropped from about 7.0 s to about 4.8 s from navigation start in
an A/B run on the same page, of which roughly 2.4 s is that page's own loading. Per-dropdown
overhead went from about 650 ms to about 200 ms: shorter settle times, no waits for popups that
are already excluded, one "what is on screen" snapshot instead of two, `aria-expanded` trusted
when a control reports it, text scanning that skips big containers (so a 4,000-element page no
longer doubles the time), and start-up at `DOMContentLoaded` instead of `load`. `e2e/perf.spec.ts`
prints the timings.

**Reading animated controls.** Selected text often fades in after a pick. Reading what a control
shows ignores opacity, otherwise a choice looks empty for the first few hundred milliseconds and
the empty value gets saved.

**Forms that reset themselves.** Many apps re-initialise a form when their data arrives (Formik
`enableReinitialize`, a refetched record), wiping what was just restored. After a successful
restore form-keeper keeps checking for 8 seconds and puts back anything that reverted. The guard
ends the moment a real person touches the page (events the extension dispatches itself are not
trusted, so they never count), so it never overrides your own choices.

**Single-page apps.** The current URL is checked on every edit and DOM change (plus `popstate`
and the Navigation API). Fields are serialized when you type, not when the debounced write
fires; otherwise a quick navigation would save the next route's form under the previous URL.

**Custom controls.** These are not form fields, so there is nothing to read a value from.
Instead of one adapter per library, form-keeper works in layers and a control uses the first one
that fits:

1. *Taught controls*, which always win over a guess.
2. *Standards*: ARIA `combobox`/`listbox`/`option`, `role="switch"`/`checkbox`/`radiogroup`,
   segmented date fields (`role="spinbutton"` parts) and `contenteditable` rich text. Rows of
   highlighted buttons ("chips", segmented controls) are read from `aria-pressed`, `data-state`, a
   class such as `active`, or the buttons whose classes differ from the rest; a group only counts
   when it has a label or sits in a form and is not navigation, pagination or a toolbar.
3. *Plain interaction*: the value saved is what the user sees (the option's label), restored the
   way a person would: open it, find the option, click it. Clicks are tried as pointer events,
   then as a keyboard Enter, because some libraries (Radix, for one) only react to the latter.

A field's identity must not depend on its current value. Ant Design inserts a live region with
the chosen option next to the control, and MUI points `aria-labelledby` back at the value; both
would change the key after a choice. Names are taken from the visible label and anything that
echoes the value is ignored. A widget that still shows its first reading ("Choose…", "None") is
treated as empty.

**Filling from another page.** Values are re-keyed to the current page: exact key matches
first, then the first unclaimed field with the same name and kind, in DOM order. This looser
matching is only used when you ask for it, so automatic restore can never put a value into the
wrong form.

**Other sites.** Host access is an optional permission requested per site from a click in the
popup. The background worker registers the content script for the granted sites at runtime with
`chrome.scripting`, and the popup injects it into the open tab so it starts without a reload.
Revoking access in Chrome's own settings removes the site here too.

**File inputs.** Pages can't set a file input's value, but a script can assign `input.files` from a
`DataTransfer`, which is how drag-and-drop works. form-keeper reads the bytes when a file is
chosen (base64, in `chrome.storage.local`), rebuilds real `File` objects later, assigns them and
fires `change`. The app then builds its previews as if the user had just picked the files. Hidden
inputs behind a styled button work the same way. Limits: 8 MB per file, 20 MB per page; over that
a file is remembered by name only and the popup says so. If storage runs out, the form is kept and
only the files are dropped.

**Finding the option to click.** Libraries rarely agree on option markup. form-keeper uses ARIA
`option` elements when they exist and otherwise falls back to "whatever short text newly appeared
after opening the control", ignoring screen-reader live regions. svelte-select, whose items are
plain `list-item` elements with no role and no recognisable class, works this way with no special
case.

**Older libraries.** Detection does not rely on one marker. A control counts as a dropdown if it has
the ARIA `combobox` role, an `aria-haspopup="listbox"`, an `aria-autocomplete="list"` input, or
react-select's `react-select-N-input` id, so react-select 1 to 4, which predate the ARIA roles, work
too. Value elements are recognised both by react-select's own class names and by custom
`classNamePrefix` variants.

**Debugging a widget.** The popup's **Copy diagnostics** button copies a report of what form-keeper
found on the page: every field and how it was read, the dropdown-looking elements nothing
recognised, and the trimmed markup of each widget (typed values blanked). It is meant for pasting
into a bug report. For a step-by-step trace, set `localStorage['form-keeper:debug'] = '1'` on the
page and the console logs what every widget attempt does.

## Development

```sh
npm install
npm run dev          # opens Chrome with the extension loaded and hot-reloading
npm run fixtures     # test pages at http://localhost:5174: plain HTML, React, Vue, Svelte,
                     # SPA, real UI libraries, and deliberately non-standard controls
npm test             # unit tests (Vitest + jsdom)
npm run e2e          # builds a test copy and drives real Chromium with it loaded (Playwright)
npm run typecheck
npm run zip          # production package for the Chrome Web Store / GitHub release
```

- The e2e build goes to `.output-e2e` with all hosts pre-granted, because Playwright can't click
  Chrome's permission prompt. Don't load that copy for daily use.
- The end-to-end tests open a fresh tab rather than reloading, so Chrome's own form restoration
  can't make a test pass by accident.
- `node scripts/generate-icons.mjs` redraws the toolbar icons; `node scripts/store-assets.mjs`
  regenerates the store screenshots from the real extension (after `FK_E2E=1 npx wxt build`).
- Store listing text, permission justifications and the publishing checklist are in
  [store/LISTING.md](store/LISTING.md).

## Roadmap

1. ~~Save and restore native fields~~
2. ~~Late-rendered forms, Vue/Svelte, SPA routes, active indicator, popup, custom controls~~
3. ~~File and image inputs, rebuilt with `DataTransfer`~~
4. Snapshot history: working draft, snapshots, dedupe, retention, pinning
5. Side panel UI: browse, search, preview, restore
6. URL pattern grouping (`/users/:id/edit`)
7. Chrome Web Store listing

## Known limits

- Fields inside shadow DOM and iframes are not captured.
- Drop zones with no `<input type="file">` behind them (rare) are not captured; the common ones
  (react-dropzone and similar) keep a hidden input and work.
- There is no total storage cap yet; old pages and their files are removed from the popup
  (**Clear all**). Automatic retention arrives with the history milestone.
- Search boxes that load options from a server only restore if the option appears after the saved
  text is typed.
- Teach mode handles dropdown-style controls; calendars and other multi-step pickers are not
  supported yet.
- A group of buttons with no label and outside any form is deliberately ignored, because clicking
  it on restore could trigger actions.

## License

[MIT](LICENSE) © Munawirul Hadi
