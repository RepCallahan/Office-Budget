# Budget Sync — setup guide

This is a free, private Trello Power-Up for the Callahan Office board. It keeps the office **biennium budget** on the board itself, not on a card. You will see an **Office Budget** button in the board header. Click it to open a wide window with a green number for how much is left, a red number for how much has been spent, and the percent remaining.

The default biennium budget is **$25,000**. You can also enter how much is already spent from the state report (the October 2026 AD35 report was **$22,473.29**), then log new expenses on top. You and Amy-Rose can add expenses inside that window. There is no Google Sheet, and you do not need a Trello API key or token.

Everything below can be done in a web browser, on a computer. Plan on about 10 minutes.

---

## Before you start

1. Unzip the `trello-budget-powerup` folder if you have not already. You should see files named `index.html`, `budget.html`, `README.md`, and folders named `js`, `css`, and `img`.
2. Have your GitHub login ready. A free account is enough. If you do not have one, go to [github.com](https://github.com) and click **Sign up**.
3. Stay signed in to Trello as the account that can change the Callahan Office board.

**If you already uploaded an earlier copy of Budget Sync to GitHub**, upload these new files over the old ones (replace them). You can delete leftover files from the old card version (`expense.html`, `section.html`, `report.html`, and the `settings` folder) if they are still in the repository. After GitHub Pages updates (often a minute or two), skip to Part 3, step 6 and make sure only **board-buttons** is turned on. Then go back to the Callahan Office board and refresh the page (or close and reopen the Office Budget window) so Trello loads the new files.

The files include a version tag (`?v=20261127d`) on the scripts and styles so an older cached copy is less likely to stick. If you upload another update later and still see the old version, change that date in `index.html`, `budget.html`, and `js/budget.js` (look for `20261127d` or `ASSET_VERSION`) to today’s date and upload those files again.

**Important:** If you already created a Trello app called Budget Sync and chose “My app doesn’t use Power-up capabilities,” that one cannot be changed. You will create a **new** app below and pick the option that **does** use Power-Up capabilities.

---

## Part 1. Put the files on GitHub (this hosts them for free)

1. Open [github.com](https://github.com) and sign in.
2. Click the green **New** button (or go to [github.com/new](https://github.com/new)).
3. For **Repository name**, type `trello-budget-powerup`.
4. Under the Public / Private choice, pick **Public**. Free hosting only works if the folder is public. These files have no passwords or keys in them, so that is fine.
5. Leave the other checkboxes unchecked. You do not need a README, gitignore, or license — this folder already has a README.
6. Click **Create repository**.
7. On the empty repository page, click **uploading an existing file**.
8. Open the unzipped `trello-budget-powerup` folder on your computer. Select **everything inside it** (`index.html`, `budget.html`, `README.md`, and the `js`, `css`, and `img` folders) and drag those items onto the GitHub page.

   Drag the files *inside* the folder, not the folder itself. When you are done, you should see `index.html` at the top of the file list, not a single folder named `trello-budget-powerup`.
9. Click **Commit changes**.

---

## Part 2. Turn on free GitHub Pages

1. In the same repository, click the **Settings** tab at the top.
2. On the left, click **Pages**.
3. Under **Build and deployment**, find **Source**. Choose **Deploy from a branch**.
4. For **Branch**, choose **main** (or **master**, if that is the only option). Leave the folder set to **/ (root)**.
5. Click **Save**.
6. Wait about a minute, then refresh the page. GitHub will show a web address that looks like:

   `https://YOUR-USERNAME.github.io/trello-budget-powerup/`

   Copy that address. It should end in `github.io`, not `github.com`.
7. Open the address in a new tab. You should see a short page titled **Budget Sync**. That means hosting is working.

   If you see “404” or “page not found,” wait a couple of minutes and try again. If it still fails, go back to Settings → Pages and confirm the branch is saved, and that `index.html` is at the top level of the repository (Part 1, step 8).

---

## Part 3. Register the Power-Up in Trello

1. Open [trello.com/power-ups/admin](https://trello.com/power-ups/admin) while signed into Trello.
2. Click **New** (or **Create Power-Up**).
3. When it asks about Power-Up capabilities, choose **My app will use Power-up capabilities**. This is the important choice. Do not pick the other one.
4. Fill in the form like this:
   - **App name:** `Budget Sync`
   - **Workspace:** Callahan Office
   - **Email:** your email (for example, repcallahan@gmail.com)
   - **Support contact:** the same email
   - **Author:** Calvin Callahan
   - **Iframe connector URL:** paste the GitHub address from Part 2 (the one that looks like `https://YOUR-USERNAME.github.io/trello-budget-powerup/`). It must start with `https://` and include `github.io`.
5. Click **Create**.
6. Open the new Budget Sync app and find the **Capabilities** section. Turn on **only** this one:
   - **board-buttons** (Board buttons)

   If an older copy had **card-badges**, **card-detail-badges**, **card-back-section**, or **card-buttons** turned on, turn those off. Nothing should appear on individual cards.
7. Save if Trello asks you to. Leave the OAuth / API key section blank. This Power-Up does not use them.

---

## Part 4. Add it to the Callahan Office board

1. Open your **Callahan Office** board in Trello.
2. Click **Power-Ups** (on the right side of the board, or under the board menu).
3. Look for **Custom**, or search for **Budget Sync**.
4. Click **Add** next to Budget Sync.

If you do not see it, confirm the Power-Up was created in the Callahan Office workspace (Part 3, step 4), then refresh the board and try again.

---

## Part 5. Open the budget

1. On the Callahan Office board, look in the **board header** (the top bar of the board, not a card). Click **Office Budget**.
2. The first time, you will be asked to set it up. **Biennium budget** should already say `25000` ($25,000). Leave that unless the state allocation has changed.
3. In **Already spent (from state report)**, enter the amount from the latest state report. For the October 2026 report (AD35), that is `22473.29`. Then click **Save and open budget**.
4. You should now see a wide window with a left-hand menu. **Overview** shows a green **Left**, a red **Spent**, and the percent remaining, plus recent expenses and a form to add one. Use **Budget** to see the office categories (already filled in), type a planned amount where you want one, or add a category of your own.

Anyone on the board, including Amy-Rose, can use it once it is added. They do not need to repeat this setup. They just click **Office Budget** in the board header.

---

## How to use it day to day

- Click **Office Budget** in the board header to open the budget.
- The **Budget** page already has the office categories and groups (Spring Survey, Spring Newsletter, and so on). You can add, edit, or delete a category yourself. Planned amounts start at $0 — type a plan for any category you want to track. Each line shows planned, spent, left, and a progress bar. Spent includes amounts carried in plus anything logged since. The top of the page compares total planned to the $25,000 biennium budget.
- The already-spent total from the state report ($22,473.29) is not added on top of the amounts carried in by category. The difference is shown as **Other / unitemized**.
- To log spending, fill in the form on **Overview** or **Expenses** (date, amount, description, and a category) and click **Save expense**. If a purchase does not fit a planned category, choose **Other / Unplanned**. The person who adds an expense is filled in automatically from their Trello name.
- To change or delete an expense, use **Edit** or **Delete** in the list. Edit fills the form; it does not open a second window.
- The **Categories** page is a simple, read-only look at where logged expenses went. Planning and progress live on the **Budget** page.
- To change the $25,000 biennium budget or the already-spent amount from a new state report, open **Settings**. The bottom of that page also shows the version that is running (for example `v20261127d`). If the office category list is missing or incomplete, use **Restore office categories**. Existing categories are kept and not duplicated.
- To get a monthly summary by email, open **Settings** and use **Monthly update**. The steps are under “Monthly update by email” below.
- If you spend more than the biennium budget, the left number turns red and the window shows **Overspent**.
- After you reconcile with a new state report, click **Archive / roll up**. That folds all logged expenses into the already-spent amount and clears the list, so the totals stay the same and you have room to keep logging. You will be asked to confirm first.
- When you are ready to start a new biennium (the next one begins **January 4, 2027**), click **Reset budget**. A printable session report opens first, with the period dates, totals, planned-vs-spent by category, and the full expense list. Click **Print / Save as PDF** and save the file from your browser’s print dialog. Only after that, click **I've saved the report, reset for next session**. That clears all expenses, per-category spent and carried-in amounts, the already-spent total, and unitemized amounts, sets the biennium budget back to $25,000, and records the new period start date. Every category is kept — names, groups, and planned amounts. A reset never deletes categories.
- Trello only lets a Power-Up store a short amount of data on each board or card. To hold more expenses, add a card on this board named **Budget Storage 1 – Don't delete (budget data)**, then reopen Office Budget. The app moves logged expenses onto that card automatically. You can archive the card afterward so it stays off the board — just don’t delete it. If that card fills up, add **Budget Storage 2 – Don't delete (budget data)** the same way. Use **Archive / roll up** anytime you want to fold logged expenses into already spent and free space.

---

## If something does not work

- **The GitHub page says 404.** Wait a few minutes, confirm Pages is set to the `main` branch and `/ (root)`, and confirm `index.html` is at the top of the repository, not inside an extra folder.
- **Trello says the connector URL is invalid.** You pasted the GitHub *repository* page (`github.com/...`) instead of the Pages address (`https://YOUR-USERNAME.github.io/trello-budget-powerup/`).
- **I do not see Budget Sync on the board.** Make sure you created a new app that **does** use Power-Up capabilities, in the Callahan Office workspace, and that **board-buttons** in Part 3 is turned on.
- **I do not see numbers on a card.** That is expected. Nothing appears on cards. Click **Office Budget** in the board header.
- **I uploaded new files but Trello still shows the old Office Budget window (for example, no Budget page).** GitHub Pages can take a minute or two to update. Then refresh the Trello board, or close the Office Budget window and open it again. These files use a version tag (`?v=20261127d`) so the browser is less likely to keep an old copy. If it is still stuck after that, change `20261127d` to today’s date in `index.html`, `budget.html`, and `js/budget.js`, upload those files again, wait for Pages, and refresh Trello.
- **The Office Budget button icon did not change.** Trello sometimes caches that header icon. Refresh the board, or try again after a few minutes. The new icon is a simple dollar-in-circle mark.
- **It asks me to add a Budget Storage card.** On the Callahan Office board, click **Add a card** in any list and name it exactly **Budget Storage 1 – Don't delete (budget data)**. Reopen Office Budget. After it finds the card, you can archive it (open the card → Archive) so it is not sitting on the board. Do not delete it. If you already archived it and expenses look missing, go to the board menu → **Archived items**, send that card back to the board, and reopen Office Budget.
- **I still have the old Google Sheet.** You can leave it or delete it. This Power-Up does not use it.

---

## Monthly update by email

You can have Office Budget email you a readable monthly summary. This uses a free Apps Script web app — no Google Sheet, and no API keys.

1. Open [script.google.com](https://script.google.com) and click **New project**.
2. Delete any starter code and paste the contents of `office-budget-webhook.gs` (this file is included with the Power-Up package). Click **Save**.
3. At the top of the script, set `RECIPIENT` to the email address that should get the summary. Click **Save**.
4. Select the function **testSend** and click **Run**. Authorize the script when Google asks. You should get a test email.
5. Select the function **setupTrigger** and click **Run**. Authorize if Google asks. This creates a daily check at about 4 PM. In **Project settings**, set the time zone to **America/Chicago** if it is not already.
6. Click **Deploy > New deployment**. Choose type **Web app**. Set **Execute as** to **Me** and **Who has access** to **Anyone**. Copy the web app URL (`https://script.google.com/macros/s/…/exec`).
7. In Trello, open **Office Budget > Settings > Monthly update**, paste the URL, and click **Save URL**. Click **Send update now** to send one from the app.

After that, each time someone opens Office Budget — and after an expense is added, edited, or deleted — a snapshot of the current month is saved to the script. On the last day of the month (America/Chicago), the script emails that snapshot. Expenses entered after the last open will not be in the email until someone opens the app. **Send update now** emails the current month immediately. Google’s response cannot be read from Trello, so “saved” means the request left the browser without a network error.

If you already have a deployment, paste the new script, click **Save**, run **setupTrigger** once, then **Deploy > Manage deployments > edit (pencil) > Version: New version > Deploy**. The web app URL stays the same. Do the script update before you upload the new Power-Up files, so a snapshot is not treated as an email.

