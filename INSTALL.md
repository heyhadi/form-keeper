# Install form-keeper

form-keeper saves what you type in a web form and puts it back after you reload the page. No
account, nothing to configure, and nothing leaves your computer.

> It will be on the Chrome Web Store soon, where installing is a single click. Until then, these
> steps take about a minute. It works in **Chrome, Edge, Brave** and other Chromium browsers.

## 1. Download

[**Download form-keeper (zip)**](https://github.com/heyhadi/form-keeper/releases/latest/download/form-keeper-chrome.zip)

## 2. Unzip

- **Mac:** double-click the zip file.
- **Windows:** right-click it, choose **Extract All…**, then **Extract**.

You get a folder called `form-keeper-chrome`. **Put it somewhere you won't delete**, for example
your Documents folder. The browser reads the extension from this folder, so if the folder goes,
the extension goes with it.

## 3. Open the extensions page

Copy this into the address bar and press Enter:

```
chrome://extensions
```

(In Edge use `edge://extensions`. In Brave use `brave://extensions`.)

## 4. Turn on Developer mode

Switch on **Developer mode**, at the top right of the page. This is only needed to load an
extension from a folder; it does not change anything else.

## 5. Load the extension

1. Click **Load unpacked** (top left).
2. Choose the `form-keeper-chrome` folder you unzipped. It is the one that contains a file
   called `manifest.json`.
3. Click **Select** (Mac) or **Select Folder** (Windows).

form-keeper now appears in your list.

## 6. Pin it (recommended)

Click the puzzle-piece icon in the toolbar, then the pin next to **form-keeper**. The icon is
grey when it is not running on the page you are on, and turns purple with a green badge when it is.

## Using it

- It works on **development sites** straight away (`localhost`, `127.0.0.1`, `*.local`).
- On any **other site**, click the icon and press **Enable on this site**. Your browser asks for
  permission once.
- Fill in a form, reload the page, and your values come back. Click the icon any time to see what
  is saved, restore it again, or clear it.
- A dropdown that doesn't come back? Click the icon, press **Teach a control**, then use that
  dropdown once. It will work from then on.

## Updating

Download the newer zip, replace the old `form-keeper-chrome` folder with the new one (same
location), then on `chrome://extensions` click the circular arrow on form-keeper's card.

## Problems

| What you see | What to do |
|---|---|
| "Manifest file is missing or unreadable" | You chose the wrong folder. Pick the one that contains `manifest.json` (not the zip, and not a folder inside it). |
| No **Load unpacked** button | Turn on **Developer mode** (step 4). |
| A message about developer mode extensions when the browser starts (Windows) | Dismiss it. The Chrome Web Store version won't show it. |
| The icon is grey | form-keeper is not running on this page. Click it and choose **Enable on this site**. |
| It stopped after you moved or deleted the folder | Load the folder again from its new location (step 5). |

## Uninstall

`chrome://extensions` → **Remove** on form-keeper's card. Saved forms are removed with it.
