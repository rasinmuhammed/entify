# Entify for Google Sheets

Finds rows that refer to the same person or company, and shows which fields
led to each decision.

A spreadsheet formula can tell you two cells are identical. It has nothing to
say about `Barbra` and `Barbara` sharing a phone number written two different
ways, and that is where real duplicate customers hide.

## What it does

Select nothing and press **Entify > Find duplicates**. The add-on reads the
sheet, sends it to your Entify backend, and paints each duplicate group in its
own colour with a label naming which row to keep.

The sidebar shows the arithmetic behind every group:

```
email        linda.singh215@yahoo.com
             linda.singh215@yahoo.com          +898.09x
phone        +50 466 968 6496
             50-466-968-6496                   +115.16x
address      617 Sunset Lane
             617 Sunset Ave                     +26.75x
first_name   Linda
             Lynda                               -3.4x
```

Green supports the match, red argues against it. A user about to delete a row
can see exactly what the decision rested on rather than being handed a score.

## Setup

The add-on is a thin client. Matching runs on the Entify backend, because
Apps Script cannot host DuckDB or Splink.

1. Start the backend:

   ```bash
   cd backend && uvicorn api:app --port 8000
   ```

2. In your spreadsheet, open **Extensions > Apps Script**.

3. Copy in `Code.gs` and `Sidebar.html`, and set the manifest
   (**Project Settings > Show appsscript.json**) to the contents of
   `appsscript.json`.

4. Reload the spreadsheet. An **Entify** menu appears.

5. If your backend is not on `http://localhost:8000`, set the URL under
   **Entify > Settings**. A locally running backend is only reachable from
   Apps Script if it is exposed to the internet, so for anything beyond local
   testing deploy the backend and point the add-on at it.

## Limits worth knowing

**Selections under about 50 rows are unreliable.** The model learns match
weights from the data itself, so a handful of rows gives expectation
maximisation nothing to work from. A six-row sheet with three obvious
duplicates returns nothing at all. The sidebar says so rather than reporting a
confident zero.

**Up to 50,000 rows per scan.** Past that the add-on refuses rather than
timing out in a sidebar. Use the Entify workspace for larger files.

**The whole sheet is scanned**, not the current selection. The first row is
treated as headers. Entirely empty rows are skipped, and trailing unnamed
columns are ignored.

**Results are written to the sheet.** A `Entify group` column is added and row
backgrounds are set. Both are removed by **Entify > Clear highlighting**, and
by the next scan.

## Listing on the Google Workspace Marketplace

Listing is free, but public listings are reviewed by Google and there are
prerequisites that have nothing to do with code:

1. **A standard Google Cloud project**, linked to the Apps Script project. The
   default project Apps Script creates cannot be used for publishing.
2. **A domain you own**, verified through Google Search Console. The homepage,
   privacy policy and terms of service must all live on it. Third-party URLs
   are not accepted, so a Notion page or a GitHub README will not do.
3. **A legal business name and physical business address**, published in the
   listing, plus a monitored support email address.
4. **A privacy policy that says where the data goes.** This add-on sends sheet
   contents to a backend over `script.external_request`, so the review will
   ask what happens to that data, how long it is kept, and who can see it.
   The answer has to be written down and true.

Before any of that, the add-on can be run as an unpublished deployment by you
and by named test users, with no review at all. That is the right way to
exercise it first.

## Scopes

The manifest requests the narrowest scopes that work:

- `spreadsheets.currentonly` reads and writes only the sheet the add-on is
  open in, not your whole Drive.
- `script.container.ui` shows the sidebar.
- `script.external_request` calls your backend.
