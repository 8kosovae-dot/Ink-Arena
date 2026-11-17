(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const CONFIG = window.INK_ARENA_CONFIG || {};
  const configured = CONFIG.supabaseUrl && CONFIG.supabasePublishableKey &&
    !String(CONFIG.supabaseUrl).includes("PASTE_") && !String(CONFIG.supabasePublishableKey).includes("PASTE_");
  const PREF_DEFAULTS = { players: 2, minutes: 10, theme: "dark", font: 18 };
  const TIME_OPTIONS = [1, 5, 10, 15, 20, 30];
  const LEADERBOARD_PAGE_SIZE = 25;
  const GALLERY_PAGE_SIZE = 20;
  const SAVED_STORIES_PAGE_SIZE = 20;
  const PROMPT_CATEGORIES = ["Fantasy", "Mystery", "Science Fiction", "Realistic Fiction", "Horror", "Adventure", "Comedy", "Drama", "Historical", "Surreal"];

  let client = null;
  let currentUser = null;
  let currentProfile = null;
  let activeMatch = null;
  let pollHandle = null;
  let clockHandle = null;
  let busy = false;
  let authMode = "login";
  let submissionSent = false;
  let deadlineMs = null;
  let currentPrompt = null;
  let matchMembers = [];
  let currentPrefs = { ...PREF_DEFAULTS };
  let promptCache = [];
  let toastHandle = null;
  let currentPage = "home";
  let draftSyncHandle = null;
  let draftSyncPromise = Promise.resolve();
  let expiryInProgress = false;
  let titleDialogResolve = null;
  let leaderboardOffset = 0;
  let leaderboardLoading = false;
  let galleryOffset = 0;
  let savedStoriesOffset = 0;
  let savedStoriesLoading = false;
  let galleryHasMore = false;
  let galleryLoading = false;

  function toast(message) {
    const el = $("toast");
    el.textContent = message;
    el.classList.add("show");
    window.clearTimeout(toastHandle);
    toastHandle = window.setTimeout(() => el.classList.remove("show"), 3200);
  }
  function authMessage(message, error = false) {
    const el = $("auth-message");
    el.textContent = message;
    el.style.color = error ? "var(--red)" : "var(--gold)";
  }
  function settingsMessage(message, error = false) {
    const el = $("settings-feedback");
    el.textContent = message;
    el.style.color = error ? "var(--red)" : "var(--gold)";
  }
  function safeText(node, value) { if (node) node.textContent = value == null ? "" : String(value); }
  function setBusy(value, ids = ["signup-btn", "login-btn", "guest-btn", "start-btn", "submit-btn"]) {
    busy = value;
    ids.forEach(id => { const el = $(id); if (el) el.disabled = value || el.dataset.locked === "true"; });
  }
  function showScreen(id) {
    ["waiting-card", "editor-card", "opponent-wait-card", "results-card"].forEach(screen => {
      const node = $(screen);
      if (node) node.classList.toggle("hidden", screen !== id);
    });
    $("mode-card").classList.toggle("hidden", id !== "battle-card");
    const privateRoomCard = $("private-room-card");
    if (privateRoomCard) privateRoomCard.classList.toggle("hidden", id !== "battle-card");
  }
  function getEmailRedirectUrl() { return new URL("./", window.location.href).href; }
  function prefKey() { return `inkArenaPrefs_${currentUser?.id || "guest"}`; }
  function draftKey(matchId) { return `inkArenaDraft_${matchId}`; }
  function readPrefs() {
    try { currentPrefs = { ...PREF_DEFAULTS, ...JSON.parse(localStorage.getItem(prefKey()) || "{}") }; }
    catch { currentPrefs = { ...PREF_DEFAULTS }; }
    if (![2, 3, 4, 5, 6, 8].includes(Number(currentPrefs.players))) currentPrefs.players = PREF_DEFAULTS.players;
    if (!TIME_OPTIONS.includes(Number(currentPrefs.minutes))) currentPrefs.minutes = PREF_DEFAULTS.minutes;
    if (![18, 20, 22].includes(Number(currentPrefs.font))) currentPrefs.font = PREF_DEFAULTS.font;
    applyAppearance();
    syncSettingsControls();
    syncArenaModeControls();
  }
  function savePrefs() { localStorage.setItem(prefKey(), JSON.stringify(currentPrefs)); applyAppearance(); }
  function applyAppearance() {
    const theme = currentPrefs.theme === "system"
      ? (window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark")
      : currentPrefs.theme;
    document.body.dataset.theme = theme;
    document.documentElement.style.setProperty("--editor-size", `${currentPrefs.font || 16}px`);
  }
  function syncSettingsControls() {
    $("pref-theme").value = currentPrefs.theme;
    $("pref-font").value = String(currentPrefs.font);
    if (currentProfile) $("settings-username").value = currentProfile.username || "";
  }
  function syncArenaModeControls() {
    $("arena-players").value = String(currentPrefs.players);
    $("arena-minutes").value = String(currentPrefs.minutes);
    document.querySelectorAll("[data-player-choice]").forEach(button => {
      const selected = Number(button.dataset.playerChoice) === Number(currentPrefs.players);
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    document.querySelectorAll("[data-time-choice]").forEach(button => {
      const selected = Number(button.dataset.timeChoice) === Number(currentPrefs.minutes);
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  }
  function characterLimitForMinutes(minutes) { return Math.min(10000, Number(minutes) * 500); }
  function updateArenaMode() {
    currentPrefs.players = Number($("arena-players").value);
    currentPrefs.minutes = Number($("arena-minutes").value);
    savePrefs();
    syncArenaModeControls();
  }
  function navigateTo(page, updateHistory = true) {
    const validPages = ["home", "arena", "rankings", "profile", "gallery", "about"];
    const publicPages = ["home", "gallery", "about"];
    if (!validPages.includes(page)) page = "home";
    if (!currentUser && !publicPages.includes(page)) {
      page = "home";
      toast("Sign in or continue as a guest to use the Arena and player pages.");
    }
    currentPage = page;
    $("app-content").classList.toggle("hidden", !currentUser && !["gallery", "about"].includes(page));
    document.querySelectorAll(".page-view").forEach(view => view.classList.toggle("active", view.id === `page-${page}`));
    document.querySelectorAll("[data-page]").forEach(button => button.classList.toggle("active", button.dataset.page === page));
    if (updateHistory && window.location.hash !== `#${page}`) window.history.pushState({ page }, "", `#${page}`);
    if (page === "gallery" && client) loadGallery();
    if (page === "profile" && currentUser && currentProfile && !currentProfile.is_guest) loadSavedStories();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function leagueFor(rating) {
    if (rating >= 2400) return "Grandmaster";
    if (rating >= 2000) return "Master";
    if (rating >= 1600) return "Author";
    if (rating >= 1200) return "Apprentice";
    return "Beginner";
  }

  function init() {
    if (!configured || !window.supabase?.createClient) {
      authMessage("Setup needed: add your Supabase Project URL and Publishable key to config.js.", true);
      $("signup-btn").disabled = true;
      $("login-btn").disabled = true;
      if ($("guest-btn")) $("guest-btn").disabled = true;
      return;
    }
    client = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    bindEvents();
    navigateTo((window.location.hash || "#home").slice(1), false);
    client.auth.onAuthStateChange((event, session) => {
      window.setTimeout(() => {
        if (event === "PASSWORD_RECOVERY") {
          handleSession(session);
          openSettings();
          settingsMessage("Choose a new password, enter it twice, and save it below.");
          return;
        }
        handleSession(session);
      }, 0);
    });
    client.auth.getSession().then(({ data, error }) => {
      if (error) authMessage(error.message, true);
      handleSession(data?.session || null);
    });
    window.matchMedia?.("(prefers-color-scheme: light)").addEventListener?.("change", () => {
      if (currentPrefs.theme === "system") applyAppearance();
    });
  }

  function bindEvents() {
    setAuthMode("login");
    $("auth-form").addEventListener("submit", event => {
      if (authMode === "signup") { event.preventDefault(); signup(); }
      else login(event);
    });
    $("auth-mode-login").addEventListener("click", () => setAuthMode("login"));
    $("auth-mode-signup").addEventListener("click", () => setAuthMode("signup"));
    $("signup-btn").addEventListener("click", signup);
    $("guest-btn").addEventListener("click", continueAsGuest);
    $("resend-btn").addEventListener("click", resendConfirmation);
    $("reset-password-btn").addEventListener("click", resetPassword);
    $("logout-btn").addEventListener("click", logout);
    $("start-btn").addEventListener("click", findMatch);
    $("host-room-btn").addEventListener("click", hostPrivateRoom);
    $("join-room-btn").addEventListener("click", joinPrivateRoom);
    $("start-private-room-btn").addEventListener("click", startPrivateRoom);
    $("join-room-code").addEventListener("input", () => { $("join-room-code").value = $("join-room-code").value.toUpperCase().replace(/[^A-F0-9]/g, "").slice(0, 8); });
    $("copy-room-code").addEventListener("click", copyRoomCode);
    $("cancel-queue-btn").addEventListener("click", leaveMatch);
    $("leave-match-btn").addEventListener("click", leaveMatch);
    $("submit-btn").addEventListener("click", () => submitStory());
    $("refresh-match-btn").addEventListener("click", pollMatch);
    $("again-btn").addEventListener("click", () => { stopPolling(); activeMatch = null; showScreen("battle-card"); navigateTo("arena"); findMatch(); });
    $("judge-retry-btn").addEventListener("click", () => runJudge(true));
    $("story-input").addEventListener("input", () => { updateCharacterCount(); saveDraft(false); queueServerDraftSave(); });
    // Prevent clipboard/drop insertion in the live-writing editor.
    ["paste", "drop", "beforeinput"].forEach(type => $("story-input").addEventListener(type, event => {
      if (type === "beforeinput" && !["insertFromPaste", "insertFromDrop", "insertFromYank"].includes(event.inputType)) return;
      event.preventDefault();
      toast("Pasting and dropping outside text is disabled during a battle. Write directly in the editor.");
    }));
    $("story-input").addEventListener("keydown", event => {
      if ((event.ctrlKey || event.metaKey) && ["v", "V"].includes(event.key) || (event.shiftKey && event.key === "Insert")) {
        event.preventDefault();
        toast("Pasting is disabled during a battle.");
      }
    });
    $("settings-open").addEventListener("click", openSettings);
    $("arena-players").addEventListener("change", updateArenaMode);
    $("arena-minutes").addEventListener("change", updateArenaMode);
    document.querySelectorAll("[data-player-choice]").forEach(button => button.addEventListener("click", () => {
      $("arena-players").value = button.dataset.playerChoice;
      updateArenaMode();
    }));
    document.querySelectorAll("[data-time-choice]").forEach(button => button.addEventListener("click", () => {
      $("arena-minutes").value = button.dataset.timeChoice;
      updateArenaMode();
    }));
    $("pref-theme").addEventListener("change", saveAppearancePreferences);
    $("pref-font").addEventListener("change", saveAppearancePreferences);
    $("save-username-btn").addEventListener("click", saveUsername);
    $("settings-reset-password").addEventListener("click", resetPassword);
    $("change-password-btn").addEventListener("click", changePassword);
    $("prompts-open").addEventListener("click", openPrompts);
    $("history-refresh").addEventListener("click", loadHistory);
    $("rankings-refresh").addEventListener("click", () => loadLeaderboard(true));
    $("leaderboard-load-more").addEventListener("click", () => loadLeaderboard(false));
    $("gallery-refresh").addEventListener("click", () => loadGallery(true));
    $("gallery-load-more").addEventListener("click", () => loadGallery(false));
    $("saved-stories-refresh").addEventListener("click", () => loadSavedStories(true));
    $("saved-stories-load-more").addEventListener("click", () => loadSavedStories(false));
    $("story-title-form").addEventListener("submit", event => {
      event.preventDefault();
      const value = $("story-title-input").value.trim().slice(0, 100);
      if (!value) { toast("Enter a story title."); return; }
      const resolve = titleDialogResolve;
      titleDialogResolve = null;
      closeModal("story-title-modal");
      if (resolve) resolve(value);
    });
    $("skip-prompt-btn").addEventListener("click", voteSkipPrompt);
    document.querySelectorAll("[data-page]").forEach(button => button.addEventListener("click", event => {
      event.preventDefault(); navigateTo(button.dataset.page);
    }));
    window.addEventListener("popstate", () => navigateTo((window.location.hash || "#home").slice(1), false));
    $("prompt-search").addEventListener("input", renderPromptLibrary);
    $("prompt-category-filter").addEventListener("change", renderPromptLibrary);
    $("prompt-difficulty-filter").addEventListener("change", renderPromptLibrary);
    document.querySelectorAll("[data-close]").forEach(btn => btn.addEventListener("click", () => closeModal(btn.dataset.close)));
    document.querySelectorAll(".modal-backdrop").forEach(backdrop => backdrop.addEventListener("click", e => {
      if (e.target === backdrop) closeModal(backdrop.id);
    }));
    document.addEventListener("keydown", e => { if (e.key === "Escape") { ["settings-modal", "prompts-modal", "story-title-modal"].forEach(closeModal); } });
  }

  function setAuthMode(mode) {
    authMode = mode === "signup" ? "signup" : "login";
    const creating = authMode === "signup";
    $("auth-mode-login").classList.toggle("active", !creating);
    $("auth-mode-signup").classList.toggle("active", creating);
    $("auth-mode-login").setAttribute("aria-pressed", String(!creating));
    $("auth-mode-signup").setAttribute("aria-pressed", String(creating));
    $("auth-username-field").classList.toggle("hidden", !creating);
    $("auth-confirm-field").classList.toggle("hidden", !creating);
    $("login-btn").classList.toggle("hidden", creating);
    $("signup-btn").classList.toggle("hidden", !creating);
    $("auth-utility").classList.toggle("hidden", creating);
    $("password-input").setAttribute("autocomplete", creating ? "new-password" : "current-password");
    $("password-input").placeholder = creating ? "Create a password (8+ characters)" : "Your password";
    authMessage("");
  }

  async function signup() {
    if (busy) return;
    const username = $("username-input").value.trim();
    const email = $("email-input").value.trim();
    const password = $("password-input").value;
    const confirm = $("confirm-password-input").value;
    if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) return authMessage("Username must be 3–20 letters, numbers, or underscores.", true);
    if (!email || password.length < 8) return authMessage("Enter an email and a password with at least 8 characters.", true);
    if (!$("signup-consent").checked) return authMessage("Please confirm the age, guardian-permission, and story-privacy notice before creating an account.", true);
    if (password !== confirm) return authMessage("The passwords do not match. Please check both fields.", true);
    setBusy(true, ["signup-btn", "login-btn", "guest-btn"]); authMessage("Creating your account...");
    try {
      const { data, error } = await client.auth.signUp({
        email, password,
        options: { data: { username }, emailRedirectTo: getEmailRedirectUrl() }
      });
      if (error) throw error;
      if (!data.session) authMessage("Account created. Check your email and confirm the address before logging in.");
      else authMessage("Account created. Welcome to Ink Arena!");
    } catch (e) { authMessage(e.message || "Could not create account.", true); }
    finally { setBusy(false, ["signup-btn", "login-btn", "guest-btn"]); }
  }

  async function continueAsGuest() {
    if (busy) return;
    if (!$("signup-consent").checked) return authMessage("Please confirm the age, guardian-permission, and story-privacy notice before continuing.", true);
    setBusy(true, ["guest-btn", "signup-btn", "login-btn"]);
    authMessage("Creating a temporary guest session...");
    try {
      const { error } = await client.auth.signInAnonymously();
      if (error) throw error;
      authMessage("Guest session created. It has no ELO and cannot be recovered after you sign out or clear this browser's data.");
    } catch (e) {
      const message = /anonymous|disabled/i.test(e.message || "")
        ? "Guest sign-in is not enabled in Supabase yet. Enable Anonymous Sign-Ins in Authentication settings, then try again."
        : (e.message || "Could not start a guest session.");
      authMessage(message, true);
    } finally {
      setBusy(false, ["guest-btn", "signup-btn", "login-btn"]);
    }
  }

  async function resendConfirmation() {
    const email = $("email-input").value.trim();
    if (!email) return authMessage("Enter your account email first.", true);
    setBusy(true, ["resend-btn"]); authMessage("Sending a new confirmation email...");
    try {
      const { error } = await client.auth.resend({ type: "signup", email, options: { emailRedirectTo: getEmailRedirectUrl() } });
      if (error) throw error;
      authMessage("Confirmation email requested. Check your inbox and spam folder.");
    } catch (e) { authMessage(e.message || "Could not resend confirmation email.", true); }
    finally { setBusy(false, ["resend-btn"]); }
  }

  async function resetPassword() {
    const email = currentUser?.email || $("email-input").value.trim();
    if (!email) return (currentUser ? settingsMessage("Your account email is unavailable. Sign out and enter it on the login form.", true) : authMessage("Enter your account email first.", true));
    const feedback = currentUser ? settingsMessage : authMessage;
    feedback("Sending a password reset link...");
    try {
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: getEmailRedirectUrl() });
      if (error) throw error;
      feedback("Password reset email requested. Open the newest email and follow its instructions.");
    } catch (e) { feedback(e.message || "Could not request a password reset.", true); }
  }

  async function login(event) {
    event?.preventDefault();
    if (busy) return;
    const email = $("email-input").value.trim();
    const password = $("password-input").value;
    if (!email || !password) return authMessage("Enter your email and password.", true);
    setBusy(true, ["login-btn", "signup-btn", "guest-btn"]); authMessage("Signing in...");
    try {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      authMessage("Signed in.");
      $("confirm-password-input").value = "";
    } catch (e) { authMessage(e.message || "Could not sign in.", true); }
    finally { setBusy(false, ["login-btn", "signup-btn", "guest-btn"]); }
  }

  async function changePassword() {
    const password = $("settings-new-password").value;
    const confirm = $("settings-confirm-new-password").value;
    if (password.length < 8) return settingsMessage("Use at least 8 characters for your new password.", true);
    if (password !== confirm) return settingsMessage("The new passwords do not match.", true);
    const { error } = await client.auth.updateUser({ password });
    if (error) return settingsMessage(error.message, true);
    $("settings-new-password").value = "";
    $("settings-confirm-new-password").value = "";
    settingsMessage("Password updated successfully.");
    toast("Password updated.");
  }

  async function logout() {
    const isGuest = Boolean(currentProfile?.is_guest || currentUser?.is_anonymous);
    if (activeMatch && ["waiting", "active"].includes(activeMatch.status)) {
      const warning = isGuest
        ? "You are in a live match or queue. Leaving will end this temporary guest session, which cannot be recovered later. Continue?"
        : "You are in a live match or queue. Leave it and log out?";
      const ok = window.confirm(warning);
      if (!ok) return;
      await leaveMatch(true);
    } else if (isGuest && !window.confirm("Guest accounts are temporary. Logging out means you cannot sign back into this guest identity. Continue?")) {
      return;
    }
    stopPolling();
    const { error } = await client.auth.signOut();
    if (error) toast(error.message);
  }

  async function handleSession(session) {
    const nextUser = session?.user || null;
    if (nextUser?.id === currentUser?.id) return;
    currentUser = nextUser;
    stopPolling(); stopClock(); activeMatch = null; submissionSent = false;
    if (!currentUser) {
      currentProfile = null; matchMembers = [];
      $("auth-card").classList.toggle("hidden", currentPage !== "home");
      $("signed-in-strip").classList.add("hidden");
      $("stats-grid").classList.add("hidden");
      $("home-dashboard").classList.add("hidden");
      $("settings-open").classList.add("hidden");
      if (!["gallery", "about"].includes(currentPage)) currentPage = "home";
      navigateTo(currentPage, false);
      safeText($("header-username"), "VISITOR"); safeText($("header-rating"), "PUBLIC GALLERY"); safeText($("header-avatar"), "?");
      if (currentPage === "gallery") loadGallery();
      return;
    }
    $("auth-card").classList.add("hidden");
    $("signed-in-strip").classList.remove("hidden");
    $("stats-grid").classList.remove("hidden");
    $("app-content").classList.remove("hidden");
    $("home-dashboard").classList.remove("hidden");
    $("settings-open").classList.remove("hidden");
    readPrefs();
    syncArenaModeControls();
    navigateTo(currentPage, false);
    await loadProfile();
    syncPrivateRoomAccess();
    await Promise.all([loadLeaderboard(), loadPromptLibrary(), loadHistory()]);
    if (currentPage === "gallery") await loadGallery();
    await resumeMatch();
  }

  async function loadProfile() {
    const { data, error } = await client.from("profiles").select("id,username,rating,wins,losses,draws,is_guest").eq("id", currentUser.id).single();
    if (error) { toast("Profile could not load: " + error.message); return; }
    currentProfile = data;
    const isGuest = Boolean(data.is_guest || currentUser.is_anonymous);
    const username = data.username || (isGuest ? "Guest" : "Writer");
    safeText($("header-username"), username.toUpperCase());
    safeText($("header-avatar"), username.charAt(0).toUpperCase());
    safeText($("signed-in-name"), username);
    safeText($("signed-in-meta"), isGuest
      ? " · Temporary guest · no ELO · this browser only"
      : " · Your email is private");
    safeText($("you-name"), username);
    safeText($("you-avatar"), username.charAt(0).toUpperCase());
    safeText($("you-rating"), isGuest ? "Unranked guest" : `${data.rating} ELO`);
    safeText($("header-rating"), isGuest ? "UNRANKED GUEST · NO ELO" : `${data.rating} ELO · ${leagueFor(data.rating)}`);
    safeText($("rating-stat"), isGuest ? "—" : data.rating);
    const matches = (data.wins || 0) + (data.losses || 0) + (data.draws || 0);
    safeText($("matches-stat"), matches);
    safeText($("record-stat"), isGuest ? "Guest matches do not affect rankings" : `${data.wins || 0} W · ${data.losses || 0} L · ${data.draws || 0} D`);
    safeText($("league-stat"), isGuest ? "Unranked" : leagueFor(data.rating));
    safeText($("winrate-stat"), isGuest ? "—" : (matches ? `${Math.round((data.wins || 0) / matches * 100)}%` : "—"));
    safeText($("profile-username"), username);
    safeText($("profile-avatar"), username.charAt(0).toUpperCase());
    safeText($("profile-league"), isGuest ? "Guest · Unranked" : leagueFor(data.rating));
    safeText($("profile-rating"), isGuest ? "—" : data.rating);
    safeText($("profile-matches"), matches);
    safeText($("profile-wins"), data.wins || 0);
    safeText($("profile-losses"), data.losses || 0);
    safeText($("profile-draws"), data.draws || 0);
    $("stats-grid").classList.toggle("hidden", isGuest);
    $("home-guest-note").classList.toggle("hidden", !isGuest);
    $("profile-rating-block").classList.toggle("hidden", isGuest);
    $("profile-stats-grid").classList.toggle("hidden", isGuest);
    $("account-security-section").classList.toggle("hidden", isGuest);
    safeText($("profile-description"), isGuest
      ? "Temporary guest profile. This identity is stored only in this browser session and has no ELO rating."
      : "Your profile is public to other signed-in Ink Arena players.");
    $("settings-username").value = username;
    await loadSavedStories();
  }

  function syncPrivateRoomAccess() {
    const isGuest = Boolean(currentProfile?.is_guest || currentUser?.is_anonymous);
    const button = $("host-room-btn");
    if (button) {
      button.disabled = isGuest || !currentUser;
      button.textContent = isGuest ? "Regular account required to host" : "Create private room →";
    }
    safeText($("host-room-hint"), isGuest
      ? "Guests can join private rooms by code. Sign in with a regular account to host."
      : "Share the code with up to 29 others. Start when at least 2 writers are ready.");
  }

  async function loadLeaderboard(reset = true) {
    const container = $("leaderboard-list");
    const button = $("leaderboard-load-more");
    if (!container || !client || leaderboardLoading) return;
    leaderboardLoading = true;
    try {
      if (reset) { leaderboardOffset = 0; container.replaceChildren(); }
      if (button) button.disabled = true;
      const { data, error } = await client.from("profiles")
        .select("username,rating,wins,losses,draws")
        .eq("is_guest", false)
        .order("rating", { ascending: false })
        .order("username", { ascending: true })
        .range(leaderboardOffset, leaderboardOffset + LEADERBOARD_PAGE_SIZE - 1);
      if (error) {
        if (reset) safeText(container, "Leaderboard unavailable: " + error.message);
        if (button) button.classList.add("hidden");
        return;
      }
      if (reset && !data?.length) {
        safeText(container, "No ranked writers yet. Be the first to compete with an account.");
        if (button) button.classList.add("hidden");
        return;
      }
      (data || []).forEach((person, i) => {
        const row = document.createElement("div"); row.className = "leader-row";
        const rank = document.createElement("span"); rank.className = "rank"; rank.textContent = String(leaderboardOffset + i + 1).padStart(2, "0");
        const icon = document.createElement("span"); icon.className = "mini-avatar"; icon.textContent = (person.username || "W").charAt(0).toUpperCase();
        const name = document.createElement("span"); name.className = "leader-name"; name.textContent = person.username || "Writer";
        const sub = document.createElement("small"); sub.textContent = `${person.wins || 0}W · ${person.losses || 0}L · ${person.draws || 0}D`; name.appendChild(sub);
        const rating = document.createElement("b"); rating.textContent = person.rating;
        row.append(rank, icon, name, rating);
        if (person.username === currentProfile?.username) row.classList.add("you-row");
        container.appendChild(row);
      });
      leaderboardOffset += (data || []).length;
      if (button) button.classList.toggle("hidden", (data || []).length < LEADERBOARD_PAGE_SIZE);
    } finally {
      leaderboardLoading = false;
      if (button) button.disabled = false;
    }
  }

  async function loadHistory() {
    if (!currentUser) return;
    const container = $("history-list");
    const { data, error } = await client.from("match_players").select("match_id,joined_at").eq("user_id", currentUser.id).order("joined_at", { ascending: false }).limit(8);
    if (error) { safeText(container, "Match history unavailable."); return; }
    if (!data?.length) { container.innerHTML = '<p class="empty-history">No matches yet. Your first battle is waiting.</p>'; return; }
    const ids = data.map(r => r.match_id);
    const { data: matches } = await client.from("matches").select("id,status,created_at,judge_status,judge_result").in("id", ids);
    const byId = new Map((matches || []).map(m => [m.id, m]));
    container.replaceChildren();
    data.forEach(row => {
      const match = byId.get(row.match_id); if (!match) return;
      const item = document.createElement("div"); item.className = "history-item";
      const left = document.createElement("span"); left.textContent = `${new Date(match.created_at).toLocaleDateString()} · ${match.status}`;
      const right = document.createElement("b");
      const myResult = match.judge_result?.evaluations?.find(e => e.user_id === currentUser.id);
      const delta = match.judge_result?.rating_changes?.find(e => e.user_id === currentUser.id)?.delta;
      right.textContent = myResult ? `${myResult.total}/${match.judge_result?.rubric_version === "ink-arena-rubric-v3" ? 120 : 100}${match.judge_result?.unranked_match ? " · No ELO" : (Number.isFinite(delta) ? ` · ${delta > 0 ? "+" : ""}${delta}` : "")}` : (match.judge_status === "completed" ? "Judged" : match.status === "completed" ? "Judging" : "—");
      if (Number(delta) > 0) right.className = "won"; else if (Number(delta) < 0) right.className = "lost";
      item.append(left, right); container.appendChild(item);
    });
    if (!container.children.length) container.innerHTML = '<p class="empty-history">No finished matches yet.</p>';
  }

  async function loadPromptLibrary() {
    const { data, error } = await client.from("prompts").select("id,title,body,category,difficulty").eq("active", true).order("category").order("title");
    if (error) { console.warn("Prompt library:", error.message); return; }
    promptCache = data || [];
    const categorySelect = $("prompt-category-filter");
    const selected = categorySelect.value || "all";
    categorySelect.replaceChildren(new Option("All genres", "all"));
    [...new Set(promptCache.map(p => p.category || "Other"))].sort().forEach(cat => categorySelect.add(new Option(cat, cat)));
    categorySelect.value = [...categorySelect.options].some(o => o.value === selected) ? selected : "all";
    renderPromptLibrary();
  }
  function renderPromptLibrary() {
    const list = $("prompt-library-list"); if (!list) return;
    const query = ($("prompt-search").value || "").toLowerCase().trim();
    const category = $("prompt-category-filter").value;
    const difficulty = $("prompt-difficulty-filter").value;
    const visible = promptCache.filter(p => (category === "all" || p.category === category) && (difficulty === "all" || p.difficulty === difficulty) && (!query || `${p.title} ${p.body} ${p.category}`.toLowerCase().includes(query)));
    list.replaceChildren();
    if (!visible.length) { const p = document.createElement("p"); p.className = "muted-note"; p.textContent = "No prompts match that search."; list.appendChild(p); return; }
    visible.forEach(prompt => {
      const card = document.createElement("article"); card.className = "prompt-library-card";
      const title = document.createElement("h4"); title.textContent = prompt.title;
      const body = document.createElement("p"); body.textContent = prompt.body;
      const tags = document.createElement("div"); tags.className = "prompt-tags"; tags.textContent = `${prompt.category || "Creative"} · ${prompt.difficulty || "Intermediate"}`;
      card.append(title, body, tags); list.appendChild(card);
    });
  }
  function openSettings() { syncSettingsControls(); settingsMessage(""); $("settings-modal").classList.remove("hidden"); }
  function openPrompts() { $("prompts-modal").classList.remove("hidden"); renderPromptLibrary(); }
  function closeModal(id) {
    $(id)?.classList.add("hidden");
    if (id === "story-title-modal" && titleDialogResolve) {
      const resolve = titleDialogResolve;
      titleDialogResolve = null;
      resolve(null);
    }
  }
  function saveAppearancePreferences() {
    currentPrefs.theme = $("pref-theme").value;
    currentPrefs.font = Number($("pref-font").value);
    savePrefs();
    settingsMessage("Appearance updated.");
  }
  async function saveUsername() {
    const username = $("settings-username").value.trim();
    if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) return settingsMessage("Use 3–20 letters, numbers, or underscores.", true);
    const { data, error } = await client.rpc("update_username", { p_username: username });
    if (error) return settingsMessage(error.message, true);
    await loadProfile(); await loadLeaderboard();
    settingsMessage("Username updated."); toast("Username updated.");
  }

  async function resumeMatch() {
    const { data: rows, error } = await client.from("match_players").select("match_id,joined_at").eq("user_id", currentUser.id).is("left_at", null).order("joined_at", { ascending: false }).limit(15);
    if (error) { console.warn("Resume match:", error.message); showScreen("battle-card"); return; }
    let match = null;
    for (const row of rows || []) {
      const { data } = await client.from("matches").select("*").eq("id", row.match_id).maybeSingle();
      if (data && ["waiting", "active"].includes(data.status)) { match = data; break; }
      if (!match && data && data.status !== "cancelled") match = data;
    }
    if (!match) { activeMatch = null; showScreen("battle-card"); return; }
    activeMatch = match;
    if (match.status === "waiting") { await updateWaitingRoom(match); beginPolling(); }
    else if (match.status === "active") { await handleActiveMatch(match); beginPolling(); }
    else {
      await finishDisplay(match);
      if (match.status === "completed" && ["not_requested", "processing"].includes(match.judge_status)) beginPolling();
    }
  }

  async function hostPrivateRoom() {
    if (!currentUser || !currentProfile) return toast("Sign in or continue as a guest before using private rooms.");
    if (currentProfile.is_guest || currentUser.is_anonymous) return toast("Only a regular signed-in account can host. Guests can join with a code.");
    if (busy) return;
    if (activeMatch && ["waiting", "active"].includes(activeMatch.status)) return toast("Leave your current match before hosting another room.");
    // Private rooms have one shared capacity of 30; the host no longer chooses a room size.
    const targetPlayers = 30;
    const durationSeconds = Number(currentPrefs.minutes) * 60;
    setBusy(true, ["host-room-btn", "join-room-btn", "start-btn"]);
    safeText($("host-room-btn"), "Creating room…");
    try {
      const { data, error } = await client.rpc("host_private_room", {
        p_target_players: targetPlayers,
        p_duration_seconds: durationSeconds,
        p_character_limit: characterLimitForMinutes(currentPrefs.minutes)
      });
      if (error) throw error;
      const room = Array.isArray(data) ? data[0] : data;
      if (!room?.match_id || !room?.room_code) throw new Error("The database did not return a room code. Run the private-room SQL migration first.");
      const { data: match, error: fetchError } = await client.from("matches").select("*").eq("id", room.match_id).single();
      if (fetchError) throw fetchError;
      activeMatch = match;
      navigateTo("arena");
      await updateWaitingRoom(match);
      beginPolling();
      toast(`Private room created. Share code ${room.room_code}.`);
    } catch (e) {
      toast(e.message || "Could not create a private room.");
    } finally {
      setBusy(false, ["host-room-btn", "join-room-btn", "start-btn"]);
      syncPrivateRoomAccess();
    }
  }

  async function startPrivateRoom() {
    if (!activeMatch?.id || !activeMatch.is_private || activeMatch.room_host_id !== currentUser?.id) {
      return toast("Only the room host can start this private match.");
    }
    const button = $("start-private-room-btn");
    if (busy || !button || button.classList.contains("hidden")) return;
    button.disabled = true;
    safeText(button, "Starting match…");
    try {
      const { error } = await client.rpc("start_private_room", { p_match_id: activeMatch.id });
      if (error) throw error;
      await pollMatch();
      toast("Your private match has started.");
    } catch (e) {
      toast(e.message || "Could not start the private match.");
      safeText(button, "Start match with current players →");
      button.disabled = false;
    }
  }

  async function joinPrivateRoom() {
    if (!currentUser) return toast("First choose Continue as guest or sign in, then enter the room code.");
    if (busy) return;
    if (activeMatch && ["waiting", "active"].includes(activeMatch.status)) return toast("Leave your current match before joining another room.");
    const code = $("join-room-code").value.trim().toUpperCase();
    if (!/^[A-F0-9]{8}$/.test(code)) return toast("Enter the 8-character room code.");
    setBusy(true, ["join-room-btn", "host-room-btn", "start-btn"]);
    safeText($("join-room-btn"), "Joining room…");
    try {
      const { data, error } = await client.rpc("join_private_room", { p_code: code });
      if (error) throw error;
      const room = Array.isArray(data) ? data[0] : data;
      if (!room?.match_id) throw new Error("The room could not be found. Check the code and try again.");
      const { data: match, error: fetchError } = await client.from("matches").select("*").eq("id", room.match_id).single();
      if (fetchError) throw fetchError;
      $("join-room-code").value = "";
      activeMatch = match;
      navigateTo("arena");
      if (match.status === "waiting") { await updateWaitingRoom(match); beginPolling(); }
      else if (match.status === "active") { await handleActiveMatch(match); beginPolling(); }
      toast(match.status === "active" ? "You joined. The match is underway." : "You joined the private room.");
    } catch (e) {
      toast(e.message || "Could not join that room.");
    } finally {
      setBusy(false, ["join-room-btn", "host-room-btn", "start-btn"]);
      syncPrivateRoomAccess();
    }
  }

  async function copyRoomCode() {
    const code = $("room-code-value")?.textContent?.trim();
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      toast("Room code copied.");
    } catch {
      toast(`Room code: ${code}`);
    }
  }

  async function findMatch() {
    if (!currentUser || busy) return;
    navigateTo("arena");
    if (activeMatch && ["waiting", "active"].includes(activeMatch.status)) return toast("You are already in a match.");
    setBusy(true); safeText($("start-btn"), "Finding your room...");
    try {
      const { data, error } = await client.rpc("find_match", {
        p_target_players: currentPrefs.players,
        p_duration_seconds: currentPrefs.minutes * 60,
        p_character_limit: characterLimitForMinutes(currentPrefs.minutes)
      });
      if (error) throw error;
      const room = Array.isArray(data) ? data[0] : data;
      if (!room?.match_id) throw new Error("The queue did not return a room. Check the database setup.");
      const { data: match, error: fetchError } = await client.from("matches").select("*").eq("id", room.match_id).single();
      if (fetchError) throw fetchError;
      activeMatch = match;
      if (match.status === "waiting") { await updateWaitingRoom(match); beginPolling(); }
      else if (match.status === "active") { await handleActiveMatch(match); beginPolling(); }
    } catch (e) { toast(e.message || "Could not find a match."); }
    finally { setBusy(false); safeText($("start-btn"), "Find a match →"); }
  }

  function beginPolling() { stopPolling(); pollHandle = window.setInterval(pollMatch, 2200); pollMatch(); }
  function stopPolling() { if (pollHandle) window.clearInterval(pollHandle); pollHandle = null; }
  function stopClock() { if (clockHandle) window.clearInterval(clockHandle); clockHandle = null; }

  async function fetchRoomData(match) {
    const [{ data: members, error: membersError }, { data: prompt, error: promptError }, { data: submissions, error: submissionsError }, { data: skipVotes, error: skipError }] = await Promise.all([
      client.from("match_players").select("user_id,seat,joined_at,left_at").eq("match_id", match.id).is("left_at", null).order("seat"),
      client.from("prompts").select("id,title,body,category,difficulty").eq("id", match.prompt_id).single(),
      client.from("submissions").select("user_id,submitted_at").eq("match_id", match.id),
      client.from("prompt_skip_votes").select("user_id").eq("match_id", match.id)
    ]);
    if (membersError) throw membersError;
    if (promptError) throw promptError;
    if (submissionsError) throw submissionsError;
    if (skipError) throw skipError;
    matchMembers = members || []; currentPrompt = prompt;
    return { members: members || [], prompt, submissions: submissions || [], skipVotes: skipVotes || [] };
  }
  async function pollMatch() {
    if (!activeMatch?.id || !client) return;
    try {
      const { data, error } = await client.from("matches").select("*").eq("id", activeMatch.id).single();
      if (error) throw error;
      activeMatch = data;
      if (data.status === "waiting") await updateWaitingRoom(data);
      else if (data.status === "active") {
        if (data.deadline_at && Date.now() >= new Date(data.deadline_at).getTime()) {
          await client.rpc("expire_match", { p_match_id: data.id });
          const { data: refreshed } = await client.from("matches").select("*").eq("id", data.id).single();
          if (refreshed) { activeMatch = refreshed; if (["completed", "expired"].includes(refreshed.status)) { await finishDisplay(refreshed); stopPolling(); return; } }
        }
        await handleActiveMatch(data);
      }
      else if (["completed", "expired"].includes(data.status)) {
        await finishDisplay(data);
        if (data.status === "expired" || ["completed", "failed", "blocked"].includes(data.judge_status)) stopPolling();
      }
      else if (data.status === "cancelled") { stopPolling(); activeMatch = null; showScreen("battle-card"); toast(data.is_private ? "The host closed this private room." : "That room was closed. Start another search."); }
    } catch (e) { console.warn("Match refresh:", e.message); }
  }

  async function updateWaitingRoom(match) {
    const { data: members, error } = await client.from("match_players").select("user_id,seat").eq("match_id", match.id).is("left_at", null).order("seat");
    if (error) throw error;
    matchMembers = members || [];
    const count = members?.length || 1;
    const target = match.target_players || 2;
    const pct = Math.min(100, count / target * 100);
    $("room-progress-bar").style.width = `${pct}%`;
    safeText($("room-count"), `${count} / ${target} writers`);
    safeText($("waiting-title"), match.is_private ? "Your private room is ready" : (count >= target ? "Starting your match..." : "Finding your writing room..."));
    safeText($("waiting-copy"), match.is_private
      ? "Share the code with your group. The room holds up to 30 writers, and the host can start whenever at least 2 players are ready."
      : `Your room is filling up. ${target - count} more ${target - count === 1 ? "writer" : "writers"} needed. Keep this tab open.`);
    safeText($("match-id"), `ROOM ${match.id.slice(0, 8).toUpperCase()}`);
    const codePanel = $("room-code-panel");
    codePanel.classList.toggle("hidden", !match.is_private || !match.room_code);
    if (match.is_private && match.room_code) safeText($("room-code-value"), match.room_code);
    const startButton = $("start-private-room-btn");
    const canHostStart = Boolean(match.is_private && match.room_host_id === currentUser?.id && count >= 2);
    startButton.classList.toggle("hidden", !canHostStart);
    startButton.disabled = false;
    safeText(startButton, canHostStart ? `Start match with ${count} players →` : "Start match with current players →");
    safeText($("cancel-queue-btn"), match.is_private && match.room_host_id === currentUser?.id ? "Close private room" : (match.is_private ? "Leave room" : "Leave queue"));
    showScreen("waiting-card");
  }

  async function handleActiveMatch(match) {
    if (!match.deadline_at) return;
    const data = await fetchRoomData(match);
    const mine = await client.from("submissions").select("id,body").eq("match_id", match.id).eq("user_id", currentUser.id).maybeSingle();
    if (mine.error) throw mine.error;
    safeText($("prompt-title"), data.prompt.title);
    safeText($("prompt-text"), data.prompt.body);
    safeText($("prompt-meta"), `${data.prompt.category || "Creative"} · ${data.prompt.difficulty || "Intermediate"}`);
    safeText($("match-id"), `${match.is_private ? "PRIVATE ROOM" : "MATCH"} ${match.id.slice(0, 8).toUpperCase()}`);
    $("room-code-panel").classList.add("hidden");
    safeText($("live-room-count"), `${data.members.length} writers in this match`);
    safeText($("submission-progress"), `${data.submissions.length} / ${data.members.length} submitted`);
    safeText($("character-limit-label"), Number(match.character_limit || characterLimitForMinutes(match.duration_seconds / 60)).toLocaleString());
    const skipCount = data.skipVotes.length;
    const mySkipVote = data.skipVotes.some(v => v.user_id === currentUser.id);
    const skipButton = $("skip-prompt-btn");
    skipButton.disabled = Boolean(mine.data) || data.submissions.length > 0 || mySkipVote;
    safeText(skipButton, mySkipVote ? `Vote recorded (${skipCount}/${data.members.length})` : `Vote to skip prompt (${skipCount}/${data.members.length})`);
    safeText($("skip-prompt-status"), data.submissions.length > 0
      ? "Voting has closed because a story was submitted."
      : mySkipVote
        ? "Your vote is in. The prompt changes when everyone votes; the timer will restart."
        : "Everyone must vote. If all agree, a random prompt is chosen and the full timer restarts.");
    deadlineMs = new Date(match.deadline_at).getTime();
    submissionSent = Boolean(mine.data);
    if (mine.data) {
      showScreen("opponent-wait-card");
      const pct = data.members.length ? data.submissions.length / data.members.length * 100 : 0;
      $("submitted-progress-bar").style.width = `${pct}%`;
      safeText($("submitted-progress-label"), `${data.submissions.length} / ${data.members.length} writers submitted. Waiting for the rest of the room.`);
    } else {
      if ($("story-input").dataset.match !== match.id) {
        const localDraft = localStorage.getItem(draftKey(match.id)) || "";
        const { data: remoteDraft } = await client.rpc("get_match_draft", { p_match_id: match.id });
        $("story-input").value = localDraft || remoteDraft || "";
        $("story-input").dataset.match = match.id;
        updateCharacterCount();
      }
      showScreen("editor-card");
    }
    startClock();
  }

  function startClock() {
    stopClock();
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000));
      const minutes = Math.floor(remaining / 60), seconds = remaining % 60;
      safeText($("timer"), `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`);
      $("timer").classList.toggle("urgent", remaining <= 60);
      if (remaining === 0 && !submissionSent && !expiryInProgress && !busy) {
        stopClock();
        autoSubmitAtDeadline();
      }
    };
    tick(); clockHandle = window.setInterval(tick, 1000);
  }

  function countCharacters(text) { return Array.from(text).length; }
  function updateCharacterCount() {
    const input = $("story-input");
    const limit = activeMatch?.character_limit || characterLimitForMinutes(currentPrefs.minutes);
    const chars = Array.from(input.value);
    if (chars.length > limit) {
      input.value = chars.slice(0, limit).join("");
    }
    const count = countCharacters(input.value);
    safeText($("character-count"), count.toLocaleString());
    const disabled = submissionSent || count < 1 || count > limit || busy;
    $("submit-btn").disabled = disabled;
    safeText($("editor-status"), "");
  }
  function saveDraft() {
    if (!activeMatch?.id || submissionSent) return;
    localStorage.setItem(draftKey(activeMatch.id), $("story-input").value);
  }
  function queueServerDraftSave() {
    if (!activeMatch?.id || submissionSent || !currentUser) return;
    window.clearTimeout(draftSyncHandle);
    const matchId = activeMatch.id;
    const body = $("story-input").value;
    draftSyncHandle = window.setTimeout(() => {
      draftSyncPromise = draftSyncPromise.then(async () => {
        if (activeMatch?.id !== matchId || submissionSent) return;
        const { error } = await client.rpc("save_match_draft", { p_match_id: matchId, p_body: body });
        if (error) console.warn("Draft sync:", error.message);
      }).catch(error => console.warn("Draft sync:", error?.message || error));
    }, 700);
  }
  async function autoSubmitAtDeadline() {
    if (!activeMatch?.id || submissionSent || expiryInProgress) return;
    expiryInProgress = true;
    const matchId = activeMatch.id;
    const text = $("story-input").value;
    window.clearTimeout(draftSyncHandle);
    safeText($("submitted-progress-label"), "Time is up. Submitting the latest saved writing for everyone…");
    showScreen("opponent-wait-card");
    try {
      // Wait for older autosaves to finish, then flush the latest text before the
      // expiry RPC atomically submits every active player's server-side draft.
      await draftSyncPromise;
      const { error: draftError } = await client.rpc("save_match_draft", { p_match_id: matchId, p_body: text });
      if (draftError) console.warn("Final draft sync:", draftError.message);
      const { data, error } = await client.rpc("expire_match", { p_match_id: matchId });
      if (error) throw error;
      if (data) { submissionSent = true; localStorage.removeItem(draftKey(matchId)); await pollMatch(); }
    } catch (e) {
      console.warn("Automatic submission:", e.message);
      toast(e.message || "Automatic submission could not finish. Refresh the match status.");
    } finally {
      expiryInProgress = false;
    }
  }
  async function submitStory(override = null, automatic = false) {
    if (!activeMatch || submissionSent || busy) return;
    const body = (override ?? $("story-input").value).trim();
    const limit = activeMatch.character_limit || characterLimitForMinutes(currentPrefs.minutes);
    if (!body) return toast("Write something before submitting.");
    if (countCharacters(body) > limit) return toast(`Your story must be ${limit.toLocaleString()} characters or fewer.`);
    setBusy(true, ["submit-btn"]); safeText($("submit-btn"), "Submitting...");
    try {
      const { error } = await client.rpc("submit_story", { p_match_id: activeMatch.id, p_body: body });
      if (error) throw error;
      submissionSent = true; localStorage.removeItem(draftKey(activeMatch.id)); window.clearTimeout(draftSyncHandle); stopClock();
      showScreen("opponent-wait-card"); toast(automatic ? "Time is up. Your draft was submitted." : "Story submitted. Waiting for the room.");
      pollMatch();
    } catch (e) { toast(e.message || "Could not submit your story."); }
    finally { setBusy(false, ["submit-btn"]); safeText($("submit-btn"), "Submit story →"); updateCharacterCount(); }
  }

  async function leaveMatch(silent = false) {
    if (!activeMatch?.id) { showScreen("battle-card"); return; }
    if (activeMatch.status === "active") {
      const ok = silent || window.confirm("Leaving an active match counts as a forfeit. Your current draft will not be submitted. Continue?");
      if (!ok) return;
    }
    try {
      const { error } = await client.rpc("leave_match", { p_match_id: activeMatch.id });
      if (error) throw error;
    } catch (e) { if (!silent) toast(e.message || "Could not leave this match."); return; }
    stopPolling(); stopClock(); activeMatch = null; submissionSent = false; showScreen("battle-card");
    if (!silent) toast("You left the match.");
  }

  async function finishDisplay(match) {
    activeMatch = match; stopClock();
    showScreen("results-card");
    const { data: members, error: memberError } = await client.from("match_players").select("user_id,seat,left_at").eq("match_id", match.id).order("seat");
    if (memberError) { toast(memberError.message); return; }
    matchMembers = members || [];
    const ids = matchMembers.map(m => m.user_id);
    const [{ data: profiles }, { data: submissions }, { data: promptData }] = await Promise.all([
      client.from("profiles").select("id,username").in("id", ids),
      match.judge_status === "blocked"
        ? Promise.resolve({ data: [], error: null })
        : client.from("submissions").select("user_id,body,submitted_at,auto_submitted").eq("match_id", match.id),
      client.from("prompts").select("title").eq("id", match.prompt_id).maybeSingle()
    ]);
    const profileById = new Map((profiles || []).map(p => [p.id, p.username]));
    const submissionById = new Map((submissions || []).map(s => [s.user_id, s]));
    const evaluations = match.judge_result?.evaluations || [];
    const evalById = new Map(evaluations.map(e => [e.user_id, e]));
    const ratingChanges = new Map((match.judge_result?.rating_changes || []).map(r => [r.user_id, r]));
    const ordered = matchMembers.map(m => ({ ...m, username: profileById.get(m.user_id) || "Writer", body: submissionById.get(m.user_id)?.body || "No story submitted before time ran out.", autoSubmitted: Boolean(submissionById.get(m.user_id)?.auto_submitted), evaluation: evalById.get(m.user_id), rating: ratingChanges.get(m.user_id) }));
    const hasAutoSubmittedEntry = (submissions || []).some(row => row.auto_submitted);
    safeText($("result-title"), hasAutoSubmittedEntry ? "Time is up · stories submitted." : "The room has finished.");
    safeText($("result-subtitle"), `${ordered.length} writers · ${match.judge_status === "completed" ? "AI results are ready" : match.judge_status === "blocked" ? "Safety filter stopped this match" : "Stories are ready for judging"}`);
    renderJudgeStatus(match);
    renderRanking(ordered, match.judge_result);
    if (match.judge_status === "blocked") {
      $("story-results").textContent = "This match was stopped by the automated safety filter. Stories are not revealed, no scores were issued, and ratings were not changed. Start a new match with age-appropriate fictional writing.";
    } else {
      renderStories(ordered, match, promptData?.title || "Ink Arena story", match.judge_status === "completed");
    }
    const canJudge = match.status === "completed" && !["completed", "processing", "blocked"].includes(match.judge_status);
    $("judge-retry-btn").classList.toggle("hidden", !canJudge);
    if (match.status === "completed" && match.judge_status !== "completed" && match.judge_status !== "processing" && match.judge_status !== "blocked") runJudge(false);
  }

  function renderJudgeStatus(match) {
    const box = $("judge-status");
    box.className = "judge-status";
    if (match.judge_status === "completed") { box.classList.add("done"); box.innerHTML = match.judge_result?.unranked_match ? '<span class="status-dot"></span><span>Judging complete · unranked match · nobody gained or lost ELO.</span>' : '<span class="status-dot"></span><span>Judging complete · ranked scores and rating changes saved.</span>'; }
    else if (match.judge_status === "processing") { box.innerHTML = '<span class="status-dot"></span><span>AI judge is reading the stories and comparing the rubric…</span>'; }
    else if (match.judge_status === "failed") { box.classList.add("error"); box.innerHTML = '<span class="status-dot"></span><span>AI judging failed. You can retry after checking the API setup.</span>'; }
    else if (match.judge_status === "blocked") { box.classList.add("error"); box.textContent = "The automated safety filter stopped this match. No stories were revealed, no scores were issued, and no ratings changed."; }
    else if (match.status === "expired") { box.classList.add("error"); box.innerHTML = '<span class="status-dot"></span><span>Match expired before a full room submission. No rating change was applied.</span>'; }
    else { box.innerHTML = '<span class="status-dot"></span><span>AI judge will score the stories now…</span>'; }
  }

  function renderRanking(entries, result) {
    const container = $("results-ranking"); container.replaceChildren();
    const winner = $("winner-banner"); winner.classList.add("hidden"); winner.textContent = "";
    const scoreData = (result?.evaluations || []).map(e => ({ ...e, rating: (result.rating_changes || []).find(r => r.user_id === e.user_id) }));
    if (!scoreData.length) return;
    if (result?.overall_summary) {
      const summary = document.createElement("div"); summary.className = "result-summary";
      const label = document.createElement("b"); label.textContent = "AI judge's overview";
      const copy = document.createElement("p"); copy.textContent = result.overall_summary;
      summary.append(label, copy); container.appendChild(summary);
    }
    scoreData.sort((a, b) => (b.total || 0) - (a.total || 0));
    const maxScore = result?.rubric_version === "ink-arena-rubric-v3" ? 120 : 100;
    const winningScore = scoreData[0].total;
    const winningNames = entries.filter(e => scoreData.some(s => s.user_id === e.user_id && s.total === winningScore)).map(e => e.username);
    winner.textContent = winningNames.length === 1 ? `🏆 WINNER: ${winningNames[0]} · ${winningScore}/${maxScore}` : `🏆 TIE: ${winningNames.join(", ")} · ${winningScore}/${maxScore}`;
    winner.classList.remove("hidden");
    scoreData.forEach((score, index) => {
      const who = entries.find(e => e.user_id === score.user_id);
      const card = document.createElement("article"); card.className = `ranked-entry ${index === 0 ? "top-entry" : ""}`;
      const top = document.createElement("div"); top.className = "ranked-top";
      const left = document.createElement("div");
      const name = document.createElement("div"); name.className = "ranked-name"; name.textContent = `${index + 1}. ${who?.username || "Writer"}${who?.user_id === currentUser.id ? " (You)" : ""}`;
      const rating = document.createElement("div"); rating.className = "ranked-ratings";
      const delta = score.rating?.delta;
      rating.textContent = result?.unranked_match ? "Unranked guest match · no ELO changes" : (score.rating ? `${score.rating.old_rating} → ${score.rating.new_rating} ELO (${delta > 0 ? "+" : ""}${delta})` : "Rating pending");
      left.append(name, rating);
      const points = document.createElement("strong"); points.className = "ranked-score"; points.textContent = `${score.total}/${maxScore}`;
      top.append(left, points); card.appendChild(top);
      const bars = document.createElement("div"); bars.className = "score-bars";
      const labels = result?.rubric_version === "ink-arena-rubric-v3"
        ? [["Craft & clarity", "craft"], ["Story & structure", "story"], ["Prompt fit", "prompt_fit"], ["Emotion & impact", "emotion"], ["Originality", "originality"], ["Spelling & grammar", "spelling_grammar"]]
        : [["Craft & clarity", "craft"], ["Story & structure", "story"], ["Prompt fit", "prompt_fit"], ["Emotion & impact", "emotion"], ["Spelling & grammar", "spelling_grammar"]];
      labels.forEach(([label, key]) => {
        const metric = document.createElement("div"); metric.className = "score-metric";
        const l = document.createElement("label"); l.textContent = label;
        const track = document.createElement("div"); track.className = "score-track";
        const fill = document.createElement("span"); fill.style.width = `${(score.criteria?.[key] || 0) / 20 * 100}%`; track.appendChild(fill);
        const value = document.createElement("b"); value.textContent = `${score.criteria?.[key] ?? "—"}/20`;
        metric.append(l, track, value); bars.appendChild(metric);
      });
      const feedback = document.createElement("p"); feedback.className = "ranked-feedback"; feedback.textContent = score.feedback || "No written feedback was returned.";
      const strengths = document.createElement("p"); strengths.className = "ranked-detail";
      const strengthLabel = document.createElement("b"); strengthLabel.textContent = "What worked: ";
      strengths.append(strengthLabel, document.createTextNode(score.strengths || "Not provided."));
      const next = document.createElement("p"); next.className = "ranked-detail";
      const nextLabel = document.createElement("b"); nextLabel.textContent = "Try next: ";
      next.append(nextLabel, document.createTextNode(score.next_step || "Not provided."));
      card.append(bars, feedback, strengths, next);
      container.appendChild(card);
    });
  }

  function renderStories(entries, match, promptTitle, actionsAllowed = true) {
    const container = $("story-results"); container.replaceChildren();
    entries.forEach(entry => {
      const card = document.createElement("article"); card.className = "story-panel";
      const title = document.createElement("h4"); title.textContent = `${entry.username}${entry.user_id === currentUser.id ? " · YOUR STORY" : ""}`;
      const body = document.createElement("p"); body.textContent = entry.body;
      card.append(title, body);
      if (entry.autoSubmitted) {
        const tag = document.createElement("small"); tag.className = "auto-submit-tag"; tag.textContent = "Submitted automatically when time ran out"; card.appendChild(tag);
      }
      if (entry.user_id === currentUser.id && actionsAllowed && !currentProfile?.is_guest && entry.body !== "No story submitted before time ran out.") {
        const actions = document.createElement("div"); actions.className = "story-actions";
        const save = document.createElement("button"); save.className = "primary-btn"; save.textContent = "Save to My Stories";
        save.addEventListener("click", () => saveMyStory(match.id, promptTitle));
        actions.append(save); card.appendChild(actions);
      } else if (entry.user_id === currentUser.id && currentProfile?.is_guest) {
        const note = document.createElement("p"); note.className = "fine-print"; note.textContent = "Create a regular account to save stories permanently or publish them to the Gallery."; card.appendChild(note);
      }
      container.appendChild(card);
    });
  }

  async function voteSkipPrompt() {
    if (!activeMatch?.id || activeMatch.status !== "active" || submissionSent || busy) return;
    const button = $("skip-prompt-btn"); button.disabled = true;
    try {
      const { data, error } = await client.rpc("vote_skip_prompt", { p_match_id: activeMatch.id });
      if (error) throw error;
      if (data?.prompt_changed) toast("Everyone agreed. A new prompt is ready and the timer has restarted.");
      else toast(`Your vote is recorded (${data?.votes || 0}/${data?.total || matchMembers.length}). Waiting for everyone else.`);
      await pollMatch();
    } catch (e) {
      toast(e.message || "Could not record your vote.");
      button.disabled = false;
    }
  }

  function askStoryTitle(defaultTitle, mode = "save") {
    return new Promise(resolve => {
      titleDialogResolve = resolve;
      $("story-title-heading").textContent = mode === "publish" ? "Publish to the Gallery" : "Name your story";
      $("story-title-help").textContent = mode === "publish"
        ? "Choose the title readers will see in the public Gallery. You can keep the same title."
        : "Choose a title you'll recognize in My Stories. You can rename it before publishing.";
      safeText($("story-title-confirm"), mode === "publish" ? "Publish story" : "Save story");
      $("story-title-input").value = defaultTitle || "Untitled story";
      $("story-title-modal").classList.remove("hidden");
      window.setTimeout(() => { $("story-title-input").focus(); $("story-title-input").select(); }, 0);
    });
  }

  async function saveMyStory(matchId, promptTitle) {
    if (!currentUser || currentProfile?.is_guest) return toast("A regular account is required to save stories.");
    const title = await askStoryTitle(`Inspired by ${promptTitle}`);
    if (!title) return;
    try {
      const { error } = await client.rpc("save_story", { p_source_match_id: matchId, p_title: title });
      if (error) throw error;
      toast("Saved to My Stories.");
      await loadSavedStories();
      navigateTo("profile");
      $("saved-stories-list").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) { toast(e.message || "Could not save this story."); }
  }


  async function loadSavedStories(reset = true) {
    const container = $("saved-stories-list");
    const button = $("saved-stories-load-more");
    if (!container) return;
    if (!currentUser || currentProfile?.is_guest) {
      container.replaceChildren();
      const note = document.createElement("p"); note.className = "empty-history";
      note.textContent = currentProfile?.is_guest ? "Guest profiles are temporary. Create a regular account to keep a personal story library." : "Sign in with a regular account to save stories here.";
      container.appendChild(note);
      if (button) button.classList.add("hidden");
      return;
    }
    if (savedStoriesLoading) return;
    savedStoriesLoading = true;
    try {
      if (reset) {
        savedStoriesOffset = 0;
        container.replaceChildren();
        const loading = document.createElement("p"); loading.className = "empty-history"; loading.textContent = "Loading your stories…"; container.appendChild(loading);
      }
      if (button) button.disabled = true;
      const from = savedStoriesOffset;
      const to = from + SAVED_STORIES_PAGE_SIZE - 1;
      const { data, error } = await client.from("saved_stories")
        .select("id,title,body,source_match_id,created_at")
        .eq("user_id", currentUser.id).order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, to);
      if (reset) container.replaceChildren();
      if (error) {
        const p = document.createElement("p"); p.className = "empty-history"; p.textContent = `Saved stories could not load: ${error.message}`; container.appendChild(p);
        if (button) button.classList.add("hidden");
        return;
      }
      if (reset && !data?.length) {
        const p = document.createElement("p"); p.className = "empty-history"; p.textContent = "Your saved stories will appear here. Save one from the results after a match."; container.appendChild(p);
        if (button) button.classList.add("hidden");
        return;
      }
      (data || []).forEach(story => {
        const item = document.createElement("article"); item.className = "saved-story-item";
        const copy = document.createElement("div");
        const title = document.createElement("h3"); title.textContent = story.title;
        const date = document.createElement("small"); date.className = "saved-story-date"; date.textContent = `Saved ${new Date(story.created_at).toLocaleDateString()}`;
        const details = document.createElement("details"); details.className = "saved-story-details";
        const summary = document.createElement("summary"); summary.textContent = "Read story";
        const body = document.createElement("p"); body.textContent = story.body;
        details.append(summary, body);
        copy.append(title, date, details);
        const actions = document.createElement("div"); actions.className = "saved-story-actions";
        const rename = document.createElement("button"); rename.className = "secondary-btn"; rename.textContent = "Rename";
        rename.addEventListener("click", async () => {
          const nextTitle = await askStoryTitle(story.title);
          if (!nextTitle || nextTitle === story.title) return;
          const { error: renameError } = await client.rpc("rename_saved_story", { p_saved_story_id: story.id, p_title: nextTitle });
          if (renameError) toast(renameError.message); else { toast("Story renamed."); loadSavedStories(true); }
        });
        const publish = document.createElement("button"); publish.className = "primary-btn"; publish.textContent = "Send to Gallery";
        publish.addEventListener("click", async () => {
          const publicTitle = await askStoryTitle(story.title, "publish");
          if (!publicTitle) return;
          if (!window.confirm("Publish this story for everyone to read? Your public username will be shown. Do not include personal information.")) return;
          const { error: renameError } = await client.rpc("rename_saved_story", { p_saved_story_id: story.id, p_title: publicTitle });
          if (renameError) { toast(renameError.message); return; }
          const { error: publishError } = await client.rpc("publish_saved_story", { p_saved_story_id: story.id });
          if (publishError) toast(publishError.message); else { toast("Your story is now in the Gallery."); await loadGallery(true); }
        });
        const remove = document.createElement("button"); remove.className = "secondary-btn danger-btn"; remove.textContent = "Delete";
        remove.addEventListener("click", async () => {
          if (!window.confirm("Delete this saved story from My Stories?")) return;
          const { error: deleteError } = await client.from("saved_stories").delete().eq("id", story.id).eq("user_id", currentUser.id);
          if (deleteError) toast(deleteError.message); else { toast("Saved story deleted."); loadSavedStories(true); }
        });
        actions.append(rename, publish, remove); item.append(copy, actions); container.appendChild(item);
      });
      savedStoriesOffset += (data || []).length;
      if (button) button.classList.toggle("hidden", (data || []).length < SAVED_STORIES_PAGE_SIZE);
    } finally {
      savedStoriesLoading = false;
      if (button) button.disabled = false;
    }
  }

  async function loadGallery(reset = true) {
    const container = $("gallery-list");
    const button = $("gallery-load-more");
    if (!container || !client || galleryLoading) return;
    if (reset) { galleryOffset = 0; container.replaceChildren(); }
    galleryLoading = true;
    if (button) button.disabled = true;
    if (reset) {
      const loading = document.createElement("p"); loading.className = "empty-history"; loading.textContent = "Loading the Gallery…"; container.appendChild(loading);
    }
    try {
      const { data, error } = await client.rpc("get_public_gallery_page", { p_limit: GALLERY_PAGE_SIZE, p_offset: galleryOffset });
      if (error) {
        if (reset) {
          container.replaceChildren();
          const p = document.createElement("p"); p.className = "empty-history"; p.textContent = `Gallery could not load: ${error.message}. Run the v3.4 update first.`; container.appendChild(p);
        }
        if (button) button.classList.add("hidden");
        return;
      }
      let likedIds = new Set();
      if (currentUser && !currentProfile?.is_guest && data?.length) {
        const ids = data.map(row => row.id);
        const { data: likes } = await client.from("gallery_likes").select("story_id").eq("user_id", currentUser.id).in("story_id", ids);
        likedIds = new Set((likes || []).map(row => row.story_id));
      }
      if (reset) container.replaceChildren();
      const stories = data || [];
      stories.forEach(story => {
        const card = document.createElement("article"); card.className = "gallery-card";
        const title = document.createElement("h3"); title.textContent = story.title;
        const meta = document.createElement("div"); meta.className = "gallery-meta"; meta.textContent = `By ${story.author_name} · ${new Date(story.created_at).toLocaleDateString()}`;
        const details = document.createElement("details"); details.className = "gallery-story-details";
        const read = document.createElement("summary"); read.textContent = "Read story";
        const body = document.createElement("p"); body.className = "gallery-body"; body.textContent = story.body;
        details.append(read, body);
        const actions = document.createElement("div"); actions.className = "gallery-actions";
        const like = document.createElement("button"); like.className = `secondary-btn like-btn${likedIds.has(story.id) ? " liked" : ""}`;
        const isOwner = currentUser && currentUser.id === story.author_id;
        const canLike = Boolean(currentUser && currentProfile && !currentProfile.is_guest && !isOwner);
        like.textContent = currentUser?.is_anonymous || currentProfile?.is_guest ? `👍 ${story.like_count} · Account needed` : !currentUser ? `👍 ${story.like_count} · Sign in to like` : isOwner ? `👍 ${story.like_count} · Your story` : `${likedIds.has(story.id) ? "♥ Liked" : "👍 Like"} · ${story.like_count}`;
        like.disabled = !canLike;
        if (canLike) like.addEventListener("click", () => toggleGalleryLike(story.id, likedIds.has(story.id)));
        actions.appendChild(like);
        if (isOwner) {
          const remove = document.createElement("button"); remove.className = "secondary-btn danger-btn"; remove.textContent = "Remove post";
          remove.addEventListener("click", async () => {
            if (!window.confirm("Remove this story from the public Gallery?")) return;
            const { error: deleteError } = await client.from("gallery_stories").delete().eq("id", story.id).eq("author_id", currentUser.id);
            if (deleteError) toast(deleteError.message); else { toast("Gallery post removed."); loadGallery(true); }
          });
          actions.appendChild(remove);
        }
        card.append(title, meta, details, actions); container.appendChild(card);
      });
      galleryOffset += stories.length;
      galleryHasMore = stories.length === GALLERY_PAGE_SIZE;
      if (button) button.classList.toggle("hidden", !galleryHasMore);
      if (reset && !stories.length) {
        const p = document.createElement("p"); p.className = "empty-history"; p.textContent = "The Gallery is empty so far. Save a story after a match, then send it here from My Stories."; container.appendChild(p);
      }
    } catch (error) {
      if (reset) {
        container.replaceChildren();
        const p = document.createElement("p"); p.className = "empty-history"; p.textContent = `Gallery could not load: ${error?.message || "Unexpected error."}`; container.appendChild(p);
      }
      if (button) button.classList.add("hidden");
    } finally {
      galleryLoading = false;
      if (button) button.disabled = false;
    }
  }

  async function toggleGalleryLike(storyId, isLiked) {
    if (!currentUser || currentProfile?.is_guest) return toast("Sign in with a regular account to like stories.");
    const result = isLiked
      ? await client.from("gallery_likes").delete().eq("story_id", storyId).eq("user_id", currentUser.id)
      : await client.from("gallery_likes").insert({ story_id: storyId, user_id: currentUser.id });
    if (result.error) { toast(result.error.message); return; }
    await loadGallery(true);
  }

  async function runJudge(userRequested) {
    if (!activeMatch?.id || activeMatch.status !== "completed") return;
    if (userRequested) { $("judge-retry-btn").disabled = true; safeText($("judge-retry-btn"), "Judging..."); }
    renderJudgeStatus({ ...activeMatch, judge_status: "processing" });
    try {
      const { data, error } = await client.functions.invoke("judge-match", { body: { matchId: activeMatch.id } });
      if (error) {
        let detail = error.message;
        try {
          const response = error.context;
          if (response && typeof response.json === "function") {
            const payload = await response.json();
            if (payload?.error) detail = payload.error;
          }
        } catch { /* keep the SDK message if its response body cannot be parsed */ }
        throw new Error(detail || "The AI judge could not run.");
      }
      if (data?.error) {
        if (data.processing) {
          toast("AI judging is already running. Results will appear when it finishes.");
          $("judge-retry-btn").disabled = false; safeText($("judge-retry-btn"), "Refresh AI results");
          beginPolling(); return;
        }
        throw new Error(data.error);
      }
      if (data?.blocked) {
        toast(data.message || "The automatic safety filter stopped this match. No ratings changed.");
      } else {
        toast("AI judging has finished.");
      }
      const { data: latest, error: fetchError } = await client.from("matches").select("*").eq("id", activeMatch.id).single();
      if (fetchError) throw fetchError;
      activeMatch = latest;
      await loadProfile(); await loadLeaderboard(); await loadHistory();
      await finishDisplay(latest);
    } catch (e) {
      console.error("AI judging:", e);
      renderJudgeStatus({ ...activeMatch, judge_status: "failed" });
      $("judge-retry-btn").classList.remove("hidden");
      $("judge-retry-btn").disabled = false;
      safeText($("judge-retry-btn"), "Retry AI judging");
      toast(e.message || "AI judging could not run. Check the Edge Function and API key setup.");
    }
  }

  init();
})();
