# Office Passwords — setup

A free, private Trello Power-Up. Adds an **Office Passwords** button (lock icon) to the board header that opens a full-screen window with all office logins. Anyone with access to the Trello board can see the logins (no master password, by design).

## Setup (about 5 minutes)

1. Unzip. You get one folder named `passwords`.
2. On GitHub, open the **RepCallahan/Office-Budget** repository, click **Add file > Upload files**, and drag the whole `passwords` folder in. Click **Commit changes**. (Your budget files are not touched.) Wait about 1–2 minutes. Check that https://repcallahan.github.io/Office-Budget/passwords/index.html opens.
3. In Trello, go to the Power-Ups admin portal (trello.com/power-ups/admin) and click **New**. Name it **Office Passwords**, choose your workspace, and for **Iframe connector URL** paste: `https://repcallahan.github.io/Office-Budget/passwords/index.html`
4. Open the app's **Capabilities** tab and turn on **board-buttons** only. Save.
5. Open the office Trello board, click **Power-Ups > Custom**, and **Add** Office Passwords. Click **Office Passwords** in the board header.

## Updating an existing install

Replace these files in the `passwords/` folder of the **RepCallahan/Office-Budget** repository (drag them onto the existing files, then commit):

- `index.html`
- `logins.html`
- `js/vault.js`
- `js/app.js`
- `README.md`

`js/client.js`, `css/app.css`, and the images do not need to be replaced for this update. Wait 1–2 minutes after the commit, then reopen Office Passwords in Trello.

## Storage cards

Logins are stored on hidden **Password Storage** cards, not in the small board-level slot (that one only holds about 45 logins). The first card is named exactly:

**Password Storage 1 – Don't delete (password data)**

On first open the app looks for that card and will add it if it can. If you already had logins saved, they are moved onto the card automatically. If a card fills up, the app adds **Password Storage 2 – Don't delete (password data)** the same way (and 3, 4, … as needed). Settings shows a meter of total space across every storage card and warns at 80% of that total.

### Archive the card so it stays off the board

1. Open the **Office Passwords** app once first (so it can create or find the card and remember its id).
2. Then archive the storage card, or the list it is in: open the card → **Archive**. You can also archive the whole list.
3. Never delete the card or the list. Archived is fine; deleted is not. The app still reads archived cards because it saved their ids.

If logins look missing after an archive, go to the board menu → **Archived items**, send the **Password Storage** card back to the board, and reopen Office Passwords.

If the app asks you to add a storage card, create one in any list with the exact name above, reopen Office Passwords, then you can archive it.

## Notes
- The app is free. There is no master password, and logins have no notes or categories. Anyone with access to the board can see them.
- To update later, upload the new files and change the version tag (`20261127c`) in `index.html`, `logins.html`, and `js/vault.js` so Trello doesn't use an old cached copy.
