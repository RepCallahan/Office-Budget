# Office Passwords — setup

A free, private Trello Power-Up. Adds an **Office Passwords** button (lock icon) to the board header that opens a full-screen window with all office logins. Anyone with access to the Trello board can see the logins (no master password, by design).

## Setup (about 5 minutes)

1. Unzip. You get one folder named `passwords`.
2. On GitHub, open the **RepCallahan/Office-Budget** repository, click **Add file > Upload files**, and drag the whole `passwords` folder in. Click **Commit changes**. (Your budget files are not touched.) Wait about 1–2 minutes. Check that https://repcallahan.github.io/Office-Budget/passwords/index.html opens.
3. In Trello, go to the Power-Ups admin portal (trello.com/power-ups/admin) and click **New**. Name it **Office Passwords**, choose your workspace, and for **Iframe connector URL** paste: `https://repcallahan.github.io/Office-Budget/passwords/index.html`
4. Open the app's **Capabilities** tab and turn on **board-buttons** only. Save.
5. Open the office Trello board, click **Power-Ups > Custom**, and **Add** Office Passwords. Click **Office Passwords** in the board header.

## Notes
- Space: about 45 logins fit (Trello allows 4,096 characters per Power-Up). Settings shows a meter and warns at 80%.
- To update later, upload the new files and change the version tag (`20261127b`) in `index.html`, `logins.html`, and `js/vault.js` so Trello doesn't use an old cached copy.
