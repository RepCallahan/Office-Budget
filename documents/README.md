# Office Hub — setup

A free, private Trello Power-Up. It adds an **Office Hub** button to the board header. It opens a full-screen window where staff find office documents and memos (kept on Google Drive), click **Open**, and sign the ones that need a signature.

Version: `20261128d`

## Google storage

Documents, signatures, and announcements now live in Google, inside the **Office Budget Email** Apps Script, instead of only on Trello.

This version needs a small update to that script so it also accepts Office Hub:

1. Open the existing Office Budget Email project in [script.google.com](https://script.google.com).
2. Replace the code with `/workspace/Office-Budget-Email-v3-Hub.txt` (or the copy you were sent). Email behavior is unchanged.
3. Deploy it as a **new version of the same deployment** (Deploy → Manage deployments → the existing Web app → Edit → Version: New version → Deploy). Do not create a new deployment, or the link would change.
4. Open Office Budget once on this computer (so Office Hub can pick up the script link), then open Office Hub. The move happens automatically, with no buttons. If Settings still says data is on Trello, paste the same Apps Script link (the Webhook URL from Office Budget’s Settings) under **Google storage** and click **Save link**.

After the move, Settings shows “Documents, signatures, and announcements are stored in Google.” The Trello copy stays on the board as a hidden backup. Do not delete Document Storage cards yet. If the move fails, a red banner explains why and Office Hub keeps working on Trello.

With Google storage, announcement history is kept in full (up to about 300,000 characters). The old 12-item message shortening only applies while data is still on Trello.

## Setup (about 5 minutes)

1. **Upload to GitHub.** Unzip. You get one folder named `documents`. Open the **RepCallahan/Office-Budget** repository > **Add file > Upload files**, drag the whole `documents` folder in, and click **Commit changes**. (Your other apps are not touched.) Wait 1–2 minutes, then check that https://repcallahan.github.io/Office-Budget/documents/index.html?v=20261128d opens.
2. **Create the Power-Up.** Go to https://trello.com/power-ups/admin and click **New**. Name it **Office Hub**, pick your workspace, and for **Iframe connector URL** paste:
   `https://repcallahan.github.io/Office-Budget/documents/index.html?v=20261128d`
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

When someone opens the Trello board, an on-screen notice may appear (this is not a phone push or email):

- A new document that does not need a signature: **There's a new document** (a short Trello alert bar)
- A new document that needs a signature: **There's a new document that needs your review and signature** (a short Trello alert bar)
- Older documents still waiting for their signature: **You have N document(s) that need your review and signature** (a short Trello alert bar)
- An unacknowledged Office Bulletin: a small popup with the Wisconsin seal, the words **Office Bulletin**, the bulletin title, the message, an optional **Click here** link, and **Acknowledge**

Document alerts show at most once per browser tab session, and not again after the person has signed. The bulletin popup comes back every time they open the board, until they click **Acknowledge**. Closing the popup with the X does not count as acknowledging it. If a bulletin and a document alert both apply, the bulletin takes priority. The board button still shows a count of everything that needs action, for example **Office Hub (2)**.

Trello always draws a thin header bar with an X on this kind of popup. The title in that bar is left blank so it does not say “Office Hub.”

### Announcements

The **Announcements** tab is a running list of office announcements, newest first, with the date and who posted it. Everyone on the board can read them. Only the admin can post, edit, or end one.

Posting an announcement is how a bulletin is made: each new one pops up for every board member (Wisconsin seal, the words **Office Bulletin**, the title, the message, an optional **Click here** link, and **Acknowledge**) until they acknowledge it. Acknowledged and ended announcements stay in the list as history. The admin can see who has acknowledged each one.

A later Signal sender can pick up new announcements by their stable id and created timestamp. Office Hub does not send to Signal itself.

If the list grows long, the 12 most recent announcements (and any that are still active) keep their full message. Older ended announcements keep their title, author, date, id, and created time, but the message is shortened to about 80 characters so the board’s storage (about 3,900 characters per slot, then overflow onto Document Storage cards) does not fill up as quickly. A typical announcement plus acknowledgements from a small office is a few hundred characters; a long one with a link can approach 1,000.

## Storage

After the move to Google, titles, links, signatures, and announcements are stored in the Office Budget Email script (about 300,000 characters). Settings shows how much is used.

Until the move, they are stored in the board's Power-Up data, which holds roughly 4,000 characters. When that fills up (Settings shows a meter and a red warning at 80%), add a card named exactly:

**Document Storage 1 – Don't delete (document data)**

Then **Document Storage 2 – Don't delete (document data)**, and so on. Each one adds about 4,000 more characters.

**Important:** Power-Ups cannot see cards that are in an **archived** list. Keep the storage cards in a normal **open** list. You can collapse the list so it stays out of the way. Never archive the list or the cards, and never delete them. If the app says a storage card is missing, restore it from the board menu > **Archived items**.

## Privacy note

Staff do not see each other's signatures in the app. That is hidden from view, not encrypted: Trello Power-Up data can technically be read by anyone with board access using Trello's API.

## Updating later

Replace the changed files in the `documents/` folder of the repository, change the version tag (`20261128d`) in `index.html`, `documents.html`, `bulletin-popup.html`, `js/docs.js`, `js/cloud.js`, `js/bulletin-popup.js`, and in the Power-Up's Iframe connector URL, and commit. If this version added Office Hub to the Apps Script, also paste Office-Budget-Email-v3-Hub.txt and deploy it as a new version of the same deployment.
