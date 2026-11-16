# Ink Arena — GitHub Pages prototype

## Publish it
1. Create a public GitHub repository named `ink-arena`.
2. Upload `index.html`, `style.css`, and `app.js` to the repository root.
3. Open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Choose branch `main`, folder `/ (root)`, then Save.
6. Wait for the Pages deployment to finish. Your URL will be:
   `https://YOUR-USERNAME.github.io/ink-arena/`

## Run locally
Open `index.html` in a modern browser. No build step is needed.

## What this prototype includes
- Responsive landing page and dashboard
- Random writing prompts
- Ten-minute countdown
- 400-word limit
- Rule-based sample scoring and feedback
- Practice opponent with simulated score
- ELO-like rating, league, win rate, and local match history
- Browser `localStorage` persistence

## Important limitations
This is a front-end prototype. The opponent and judge are simulated; it does not connect two real players or an AI model. Data is stored only in the current browser and is not shared between devices or users. Do not add secret API keys to `app.js` or any other browser file. Real accounts, multiplayer, and AI grading require a secure backend.
