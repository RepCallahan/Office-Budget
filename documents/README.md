# Office Documents — setup

A free, private Trello Power-Up. It adds an **Office Documents** button to the board header. It opens a full-screen window where staff find office documents and memos (kept on Google Drive), click **Open**, and sign the ones that need a signature.

Version: `20261128a`

## Setup (about 5 minutes)

1. **Upload to GitHub.** Unzip. You get one folder named `documents`. Open the **RepCallahan/Office-Budget** repository > **Add file > Upload files**, drag the whole `documents` folder in, and click **Commit changes**. (Your other apps are not touched.) Wait 1–2 minutes, then check that https://repcallahan.github.io/Office-Budget/documents/index.html?v=20261128a opens.
2. **Create the Power-Up.** Go to https://trello.com/power-ups/admin and click **New**. Name it **Office Documents**, pick your workspace, and for **Iframe connector URL** paste:
   `https://repcallahan.github.io/Office-Budget/documents/index.html?v=20261128a`
3. **Turn on the capability.** Open the **Capabilities** tab, turn on **board-buttons** only, and save.
4. **Add it to the board.** Open the office board > **Power-Ups > Custom** > **Add** Office Documents. Click **Office Documents** in the board header.
5. **Calvin opens it first.** Because his Trello name contains "Callahan", he is automatically set as the document admin on first open. (If it does not, go to Settings > **Make me the document admin**.)

## How to get a Google Drive link

1. Open the file in Google Drive. Click **Share**.
2. Under **General access**, choose **Anyone in the organization** or **Anyone with the link**.
3. Click **Copy link**, then paste it into **Add document** in the app.

## Using it

- **Add / edit / delete:** anyone on the board can. Paste any https link. Deleting asks you to confirm.
- **Staff must sign:** check this box and staff see a **Sign** button. They read "I have received, read, and understand this document.", type their full name, and sign. Each person sees only their own status ("You signed on ...").
- **Signatures are locked.** Staff cannot undo or redo a signature. Only the admin can delete a document that has signatures.
- **Only the admin sees who signed**, who has not yet, and the history of older versions.
- **Document updated (about once a year):** the admin edits the document and checks **Mark as updated: everyone must sign again**. The version number goes up, everyone is asked to sign again, and the old signatures stay in the admin-only history.

## Storage

Titles, links, and signatures are stored in the board's Power-Up data, which holds roughly 4,000 characters. When that fills up (Settings shows a meter and a red warning at 80%), add a card named exactly:

**Document Storage 1 – Don't delete (document data)**

Then **Document Storage 2 – Don't delete (document data)**, and so on. Each one adds about 4,000 more characters.

**Important:** Power-Ups cannot see cards that are in an **archived** list. Keep the storage cards in a normal **open** list. You can collapse the list so it stays out of the way. Never archive the list or the cards, and never delete them. If the app says a storage card is missing, restore it from the board menu > **Archived items**.

## Privacy note

Staff do not see each other's signatures in the app. That is hidden from view, not encrypted: Trello Power-Up data can technically be read by anyone with board access using Trello's API.

## Updating later

Replace the changed files in the `documents/` folder of the repository, change the version tag (`20261128a`) in `index.html`, `documents.html`, `js/docs.js`, and in the Power-Up's Iframe connector URL, and commit.
