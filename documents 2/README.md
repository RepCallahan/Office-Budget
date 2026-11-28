# Office Hub — setup

A free, private Trello Power-Up. It adds an **Office Hub** button to the board header. It opens a full-screen window where staff find office documents and memos (kept on Google Drive), click **Open**, and sign the ones that need a signature.

Version: `20261128b`

## Setup (about 5 minutes)

1. **Upload to GitHub.** Unzip. You get one folder named `documents`. Open the **RepCallahan/Office-Budget** repository > **Add file > Upload files**, drag the whole `documents` folder in, and click **Commit changes**. (Your other apps are not touched.) Wait 1–2 minutes, then check that https://repcallahan.github.io/Office-Budget/documents/index.html?v=20261128b opens.
2. **Create the Power-Up.** Go to https://trello.com/power-ups/admin and click **New**. Name it **Office Hub**, pick your workspace, and for **Iframe connector URL** paste:
   `https://repcallahan.github.io/Office-Budget/documents/index.html?v=20261128b`
3. **Turn on the capability.** Open the **Capabilities** tab, turn on **board-buttons** only, and save.
4. **Add it to the board.** Open the office board > **Power-Ups > Custom** > **Add** Office Hub. Click **Office Hub** in the board header.
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

## Alerts and bulletins

When someone opens the Trello board, a short on-screen Trello alert may appear (this is not a phone push or email):

- A new document that does not need a signature: **There's a new document**
- A new document that needs a signature: **There's a new document that needs your review and signature**
- Older documents still waiting for their signature: **You have N document(s) that need your review and signature**
- An unacknowledged Office Bulletin: the bulletin title (or a count, if there is more than one)

Document alerts show at most once per browser tab session, and not again after the person has signed. Bulletin alerts come back every time they open the board, until they click **Acknowledge**. Trello only allows one of these alerts at a time, so if a bulletin and a document alert both apply, the bulletin takes that slot. The board button still shows a count of everything that needs action, for example **Office Hub (2)**.

### Office Bulletins

The admin can click **+ Post bulletin** to post an announcement (title, message, and an optional link shown as **Click here**, for a Google Form or website). Each staff member sees a pop-up and a banner at the top of Office Hub until they click **Acknowledge**. The admin can see who acknowledged and when, and can edit or end a bulletin. Several bulletins can be active at once. Acks are hidden from staff in the app, but like signatures they are not encrypted.

## Storage

Titles, links, and signatures are stored in the board's Power-Up data, which holds roughly 4,000 characters. When that fills up (Settings shows a meter and a red warning at 80%), add a card named exactly:

**Document Storage 1 – Don't delete (document data)**

Then **Document Storage 2 – Don't delete (document data)**, and so on. Each one adds about 4,000 more characters.

**Important:** Power-Ups cannot see cards that are in an **archived** list. Keep the storage cards in a normal **open** list. You can collapse the list so it stays out of the way. Never archive the list or the cards, and never delete them. If the app says a storage card is missing, restore it from the board menu > **Archived items**.

## Privacy note

Staff do not see each other's signatures in the app. That is hidden from view, not encrypted: Trello Power-Up data can technically be read by anyone with board access using Trello's API.

## Updating later

Replace the changed files in the `documents/` folder of the repository, change the version tag (`20261128b`) in `index.html`, `documents.html`, `js/docs.js`, and in the Power-Up's Iframe connector URL, and commit.
