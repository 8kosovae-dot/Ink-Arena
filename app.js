(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const CONFIG = window.INK_ARENA_CONFIG || {};
  const configured = CONFIG.supabaseUrl && CONFIG.supabasePublishableKey &&
    !String(CONFIG.supabaseUrl).includes("PASTE_") && !String(CONFIG.supabasePublishableKey).includes("PASTE_");
  const PREF_DEFAULTS = { players: 4, minutes: 10, words: 500, theme: "dark", font: 16 };
  const PROMPT_CATEGORIES = ["Fantasy", "Mystery", "Science Fiction", "Realistic Fiction", "Horror (mild)", "Adventure", "Comedy", "Drama", "Historical", "Surreal"];

  let client = null;
  let currentUser = null;
  let currentProfile = null;
  let activeMatch = null;
  let pollHandle = null;
  let clockHandle = null;
  let busy = false;
  let submissionSent = false;
  let deadlineMs = null;
  let currentPrompt = null;
  let matchMembers = [];
  let currentPrefs = { ...PREF_DEFAULTS };
  let promptCache = [];
  let toastHandle = null;
  let reportTargetUser = null;

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
  function setBusy(value, ids = ["signup-btn", "login-btn", "start-btn", "submit-btn"]) {
    busy = value;
    ids.forEach(id => { const el = $(id); if (el) el.disabled = value || el.dataset.locked === "true"; });
  }
  function showScreen(id) {
    ["battle-card", "waiting-card", "editor-card", "opponent-wait-card", "results-card"].forEach(screen => {
      $(screen).classList.toggle("hidden", screen !== id);
    });
  }
  function getEmailRedirectUrl() { return new URL("./", window.location.href).href; }
  function prefKey() { return `inkArenaPrefs_${currentUser?.id || "guest"}`; }
  function draftKey(matchId) { return `inkArenaDraft_${matchId}`; }
  function readPrefs() {
    try { currentPrefs = { ...PREF_DEFAULTS, ...JSON.parse(localStorage.getItem(prefKey()) || "{}") }; }
    catch { currentPrefs = { ...PREF_DEFAULTS }; }
    applyAppearance();
    syncSettingsControls();
    updateQueueSummary();
  }
  function savePrefs() { localStorage.setItem(prefKey(), JSON.stringify(currentPrefs)); updateQueueSummary(); applyAppearance(); }
  function applyAppearance() {
    const theme = currentPrefs.theme === "system"
      ? (window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark")
      : currentPrefs.theme;
    document.body.dataset.theme = theme;
    document.documentElement.style.setProperty("--editor-size", `${currentPrefs.font || 16}px`);
  }
  function syncSettingsControls() {
    $("pref-players").value = String(currentPrefs.players);
    $("pref-minutes").value = String(currentPrefs.minutes);
    $("pref-words").value = String(currentPrefs.words);
    $("pref-theme").value = currentPrefs.theme;
    $("pref-font").value = String(currentPrefs.font);
    if (currentProfile) $("settings-username").value = currentProfile.username || "";
  }
  function updateQueueSummary() {
    const p = currentPrefs;
    safeText($("queue-summary"), `${p.players} writers · ${p.minutes} minutes · ${Number(p.words).toLocaleString()}-word limit`);
    safeText($("queue-players"), `${p.players} writers`);
    safeText($("queue-time"), `${p.minutes} minutes`);
    safeText($("queue-words"), `${Number(p.words).toLocaleString()} words`);
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
      return;
    }
    client = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    bindEvents();
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
    $("auth-form").addEventListener("submit", login);
    $("signup-btn").addEventListener("click", signup);
    $("resend-btn").addEventListener("click", resendConfirmation);
    $("reset-password-btn").addEventListener("click", resetPassword);
    $("logout-btn").addEventListener("click", logout);
    $("start-btn").addEventListener("click", findMatch);
    $("cancel-queue-btn").addEventListener("click", leaveMatch);
    $("leave-match-btn").addEventListener("click", leaveMatch);
    $("submit-btn").addEventListener("click", () => submitStory());
    $("save-draft-btn").addEventListener("click", saveDraft);
    $("refresh-match-btn").addEventListener("click", pollMatch);
    $("again-btn").addEventListener("click", () => { stopPolling(); activeMatch = null; showScreen("battle-card"); findMatch(); });
    $("judge-retry-btn").addEventListener("click", () => runJudge(true));
    $("story-input").addEventListener("input", () => { updateWordCount(); saveDraft(false); });
    $("settings-open").addEventListener("click", openSettings);
    $("quick-settings-open").addEventListener("click", openSettings);
    $("save-prefs-btn").addEventListener("click", saveMatchPreferences);
    $("save-look-btn").addEventListener("click", saveAppearancePreferences);
    $("save-username-btn").addEventListener("click", saveUsername);
    $("settings-reset-password").addEventListener("click", resetPassword);
    $("change-password-btn").addEventListener("click", changePassword);
    $("prompts-open").addEventListener("click", openPrompts);
    $("history-refresh").addEventListener("click", loadHistory);
    $("send-report-btn").addEventListener("click", sendReport);
    $("moderation-open").addEventListener("click", openModeration);
    $("prompt-search").addEventListener("input", renderPromptLibrary);
    $("prompt-category-filter").addEventListener("change", renderPromptLibrary);
    $("prompt-difficulty-filter").addEventListener("change", renderPromptLibrary);
    document.querySelectorAll("[data-close]").forEach(btn => btn.addEventListener("click", () => closeModal(btn.dataset.close)));
    document.querySelectorAll(".modal-backdrop").forEach(backdrop => backdrop.addEventListener("click", e => {
      if (e.target === backdrop) closeModal(backdrop.id);
    }));
    document.addEventListener("keydown", e => { if (e.key === "Escape") { ["settings-modal", "prompts-modal", "report-modal", "moderation-modal"].forEach(closeModal); } });
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
    setBusy(true, ["signup-btn", "login-btn"]); authMessage("Creating your account...");
    try {
      const { data, error } = await client.auth.signUp({
        email, password,
        options: { data: { username }, emailRedirectTo: getEmailRedirectUrl() }
      });
      if (error) throw error;
      if (!data.session) authMessage("Account created. Check your email and confirm the address before logging in.");
      else authMessage("Account created. Welcome to Ink Arena!");
    } catch (e) { authMessage(e.message || "Could not create account.", true); }
    finally { setBusy(false, ["signup-btn", "login-btn"]); }
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
    setBusy(true, ["login-btn", "signup-btn"]); authMessage("Signing in...");
    try {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      authMessage("Signed in.");
      $("confirm-password-input").value = "";
    } catch (e) { authMessage(e.message || "Could not sign in.", true); }
    finally { setBusy(false, ["login-btn", "signup-btn"]); }
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
    if (activeMatch && ["waiting", "active"].includes(activeMatch.status)) {
      const ok = window.confirm("You are in a live match or queue. Leave it and log out?");
      if (!ok) return;
      await leaveMatch(true);
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
      $("auth-card").classList.remove("hidden");
      $("signed-in-strip").classList.add("hidden");
      $("stats-grid").classList.add("hidden");
      $("app-content").classList.add("hidden");
      $("settings-open").classList.add("hidden");
      safeText($("header-username"), "GUEST"); safeText($("header-rating"), "SIGN IN TO PLAY"); safeText($("header-avatar"), "?");
      return;
    }
    $("auth-card").classList.add("hidden");
    $("signed-in-strip").classList.remove("hidden");
    $("stats-grid").classList.remove("hidden");
    $("app-content").classList.remove("hidden");
    $("settings-open").classList.remove("hidden");
    readPrefs();
    await loadProfile();
    await Promise.all([loadLeaderboard(), loadPromptLibrary(), loadHistory()]);
    await resumeMatch();
  }

  async function loadProfile() {
    const { data, error } = await client.from("profiles").select("id,username,rating,wins,losses,draws,is_moderator").eq("id", currentUser.id).single();
    if (error) { toast("Profile could not load: " + error.message); return; }
    currentProfile = data;
    $("moderation-open").classList.toggle("hidden", data.is_moderator !== true);
    const username = data.username || "Writer";
    safeText($("header-username"), username.toUpperCase());
    safeText($("header-avatar"), username.charAt(0).toUpperCase());
    safeText($("signed-in-name"), username);
    safeText($("you-name"), username);
    safeText($("you-avatar"), username.charAt(0).toUpperCase());
    safeText($("you-rating"), `${data.rating} ELO`);
    safeText($("header-rating"), `${data.rating} ELO · ${leagueFor(data.rating)}`);
    safeText($("rating-stat"), data.rating);
    const matches = (data.wins || 0) + (data.losses || 0) + (data.draws || 0);
    safeText($("matches-stat"), matches);
    safeText($("record-stat"), `${data.wins || 0} W · ${data.losses || 0} L · ${data.draws || 0} D`);
    safeText($("league-stat"), leagueFor(data.rating));
    safeText($("winrate-stat"), matches ? `${Math.round((data.wins || 0) / matches * 100)}%` : "—");
    $("settings-username").value = username;
  }

  async function loadLeaderboard() {
    const container = $("leaderboard-list"); container.replaceChildren();
    const { data, error } = await client.from("profiles").select("username,rating,wins,losses,draws").order("rating", { ascending: false }).limit(10);
    if (error) { safeText(container, "Leaderboard unavailable: " + error.message); return; }
    if (!data?.length) { safeText(container, "No writers yet. Be the first to join."); return; }
    data.forEach((person, i) => {
      const row = document.createElement("div"); row.className = "leader-row";
      const rank = document.createElement("span"); rank.className = "rank"; rank.textContent = String(i + 1).padStart(2, "0");
      const icon = document.createElement("span"); icon.className = "mini-avatar"; icon.textContent = (person.username || "W").charAt(0).toUpperCase();
      const name = document.createElement("span"); name.className = "leader-name"; name.textContent = person.username || "Writer";
      const sub = document.createElement("small"); sub.textContent = `${person.wins || 0}W · ${person.losses || 0}L · ${person.draws || 0}D`; name.appendChild(sub);
      const rating = document.createElement("b"); rating.textContent = person.rating;
      row.append(rank, icon, name, rating);
      if (person.username === currentProfile?.username) row.classList.add("you-row");
      container.appendChild(row);
    });
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
      right.textContent = myResult ? `${myResult.total}/100${Number.isFinite(delta) ? ` · ${delta > 0 ? "+" : ""}${delta}` : ""}` : (match.judge_status === "completed" ? "Judged" : match.status === "completed" ? "Judging" : "—");
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
  function closeModal(id) { $(id)?.classList.add("hidden"); }
  function saveMatchPreferences() {
    currentPrefs.players = Number($("pref-players").value);
    currentPrefs.minutes = Number($("pref-minutes").value);
    currentPrefs.words = Number($("pref-words").value);
    savePrefs(); settingsMessage("Match settings saved. They will apply to your next queue."); toast("Match settings saved.");
  }
  function saveAppearancePreferences() {
    currentPrefs.theme = $("pref-theme").value;
    currentPrefs.font = Number($("pref-font").value);
    savePrefs(); settingsMessage("Appearance saved."); toast("Appearance updated.");
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

  async function findMatch() {
    if (!currentUser || busy) return;
    if (activeMatch && ["waiting", "active"].includes(activeMatch.status)) return toast("You are already in a match.");
    setBusy(true); safeText($("start-btn"), "Finding your room...");
    try {
      const { data, error } = await client.rpc("find_match", {
        p_target_players: currentPrefs.players,
        p_duration_seconds: currentPrefs.minutes * 60,
        p_word_limit: currentPrefs.words
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
    finally { setBusy(false); safeText($("start-btn"), "Find a writing battle →"); }
  }

  function beginPolling() { stopPolling(); pollHandle = window.setInterval(pollMatch, 2200); pollMatch(); }
  function stopPolling() { if (pollHandle) window.clearInterval(pollHandle); pollHandle = null; }
  function stopClock() { if (clockHandle) window.clearInterval(clockHandle); clockHandle = null; }

  async function fetchRoomData(match) {
    const [{ data: members, error: membersError }, { data: prompt, error: promptError }, { data: submissions, error: submissionsError }] = await Promise.all([
      client.from("match_players").select("user_id,seat,joined_at,left_at").eq("match_id", match.id).order("seat"),
      client.from("prompts").select("title,body,category,difficulty").eq("id", match.prompt_id).single(),
      client.from("submissions").select("user_id,submitted_at").eq("match_id", match.id)
    ]);
    if (membersError) throw membersError;
    if (promptError) throw promptError;
    if (submissionsError) throw submissionsError;
    matchMembers = members || []; currentPrompt = prompt;
    return { members: members || [], prompt, submissions: submissions || [] };
  }
  async function pollMatch() {
    if (!activeMatch?.id || !client) return;
    try {
      const { data, error } = await client.from("matches").select("*").eq("id", activeMatch.id).single();
      if (error) throw error;
      activeMatch = data;
      if (data.status === "waiting") await updateWaitingRoom(data);
      else if (data.status === "active") {
        if (data.deadline_at && Date.now() > new Date(data.deadline_at).getTime() + 22000) {
          await client.rpc("expire_match", { p_match_id: data.id });
          const { data: refreshed } = await client.from("matches").select("*").eq("id", data.id).single();
          if (refreshed) { activeMatch = refreshed; if (["completed", "expired"].includes(refreshed.status)) { await finishDisplay(refreshed); stopPolling(); return; } }
        }
        await handleActiveMatch(data);
      }
      else if (["completed", "expired"].includes(data.status)) {
        await finishDisplay(data);
        if (data.status === "expired" || ["completed", "failed", "needs_review"].includes(data.judge_status)) stopPolling();
      }
      else if (data.status === "cancelled") { stopPolling(); activeMatch = null; showScreen("battle-card"); toast("That room was closed. Start another search."); }
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
    safeText($("waiting-title"), count >= target ? "Starting your match..." : "Finding your writing room...");
    safeText($("waiting-copy"), `Your room is filling up. ${target - count} more ${target - count === 1 ? "writer" : "writers"} needed. Keep this tab open.`);
    safeText($("match-id"), `ROOM ${match.id.slice(0, 8).toUpperCase()}`);
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
    safeText($("match-id"), `MATCH ${match.id.slice(0, 8).toUpperCase()}`);
    safeText($("live-room-count"), `${data.members.length} writers in this match`);
    safeText($("submission-progress"), `${data.submissions.length} / ${data.members.length} submitted`);
    safeText($("word-limit-label"), match.word_limit || currentPrefs.words);
    deadlineMs = new Date(match.deadline_at).getTime();
    submissionSent = Boolean(mine.data);
    if (mine.data) {
      showScreen("opponent-wait-card");
      const pct = data.members.length ? data.submissions.length / data.members.length * 100 : 0;
      $("submitted-progress-bar").style.width = `${pct}%`;
      safeText($("submitted-progress-label"), `${data.submissions.length} / ${data.members.length} writers submitted. Waiting for the rest of the room.`);
    } else {
      const draft = localStorage.getItem(draftKey(match.id));
      if ($("story-input").dataset.match !== match.id) {
        $("story-input").value = draft || "";
        $("story-input").dataset.match = match.id;
        updateWordCount();
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
      if (remaining === 0 && !submissionSent && !busy) {
        stopClock();
        const text = $("story-input").value.trim() || "The clock ran out before I could finish this story.";
        submitStory(text, true);
      }
    };
    tick(); clockHandle = window.setInterval(tick, 1000);
  }

  function countWords(text) { const value = text.trim(); return value ? value.split(/\s+/).length : 0; }
  function updateWordCount() {
    const count = countWords($("story-input").value);
    safeText($("word-count"), count);
    const limit = activeMatch?.word_limit || currentPrefs.words;
    const disabled = submissionSent || count < 1 || count > limit || busy;
    $("submit-btn").disabled = disabled;
    $("editor-status").textContent = count > limit ? `Please stay under ${limit} words.` : "Your draft autosaves in this browser.";
  }
  function saveDraft(showToast = true) {
    if (!activeMatch?.id || submissionSent) return;
    localStorage.setItem(draftKey(activeMatch.id), $("story-input").value);
    if (showToast) toast("Draft saved in this browser.");
  }
  async function submitStory(override = null, automatic = false) {
    if (!activeMatch || submissionSent || busy) return;
    const body = (override ?? $("story-input").value).trim();
    const limit = activeMatch.word_limit || currentPrefs.words;
    if (!body) return toast("Write at least one word before submitting.");
    if (countWords(body) > limit) return toast(`Your story must be ${limit} words or fewer.`);
    setBusy(true, ["submit-btn"]); safeText($("submit-btn"), "Submitting...");
    try {
      const { error } = await client.rpc("submit_story", { p_match_id: activeMatch.id, p_body: body });
      if (error) throw error;
      submissionSent = true; localStorage.removeItem(draftKey(activeMatch.id)); stopClock();
      showScreen("opponent-wait-card"); toast(automatic ? "Time is up. Your draft was submitted." : "Story submitted. Waiting for the room.");
      pollMatch();
    } catch (e) { toast(e.message || "Could not submit your story."); }
    finally { setBusy(false, ["submit-btn"]); safeText($("submit-btn"), "Submit story →"); updateWordCount(); }
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
    const [{ data: profiles }, { data: submissions }] = await Promise.all([
      client.from("profiles").select("id,username").in("id", ids),
      match.judge_status === "needs_review"
        ? Promise.resolve({ data: [], error: null })
        : client.from("submissions").select("user_id,body,submitted_at").eq("match_id", match.id)
    ]);
    const profileById = new Map((profiles || []).map(p => [p.id, p.username]));
    const submissionById = new Map((submissions || []).map(s => [s.user_id, s.body]));
    const evaluations = match.judge_result?.evaluations || [];
    const evalById = new Map(evaluations.map(e => [e.user_id, e]));
    const ratingChanges = new Map((match.judge_result?.rating_changes || []).map(r => [r.user_id, r]));
    const ordered = matchMembers.map(m => ({ ...m, username: profileById.get(m.user_id) || "Writer", body: submissionById.get(m.user_id) || "No story was submitted.", evaluation: evalById.get(m.user_id), rating: ratingChanges.get(m.user_id) }));
    safeText($("result-title"), match.status === "expired" ? "Time is up." : "The room has finished.");
    safeText($("result-subtitle"), `${ordered.length} writers · ${match.judge_status === "completed" ? "AI results are ready" : "Stories are ready for judging"}`);
    renderJudgeStatus(match);
    renderRanking(ordered, match.judge_result);
    if (match.judge_status === "needs_review") {
      $("story-results").innerHTML = '<div class="needs-review-note">Entries are temporarily hidden while a moderator reviews a safety report. The automated filter may make mistakes; no rating changes have been made.</div>';
    } else {
      renderStories(ordered);
    }
    const canJudge = match.status === "completed" && !["completed", "processing", "needs_review"].includes(match.judge_status);
    $("judge-retry-btn").classList.toggle("hidden", !canJudge);
    if (match.status === "completed" && match.judge_status !== "completed" && match.judge_status !== "processing" && match.judge_status !== "needs_review") runJudge(false);
  }

  function renderJudgeStatus(match) {
    const box = $("judge-status");
    box.className = "judge-status";
    if (match.judge_status === "completed") { box.classList.add("done"); box.innerHTML = '<span class="status-dot"></span><span>AI judging complete · scores and ratings saved.</span>'; }
    else if (match.judge_status === "processing") { box.innerHTML = '<span class="status-dot"></span><span>AI judge is reading the stories and comparing the rubric…</span>'; }
    else if (match.judge_status === "failed") { box.classList.add("error"); box.innerHTML = '<span class="status-dot"></span><span>AI judging failed. You can retry after checking the API setup.</span>'; }
    else if (match.judge_status === "needs_review") { box.classList.add("error"); box.innerHTML = '<span class="status-dot"></span><span>Some content was held by the safety filter. A moderator must review it. No rating changes were applied.</span>'; }
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
    const winningScore = scoreData[0].total;
    const winningNames = entries.filter(e => scoreData.some(s => s.user_id === e.user_id && s.total === winningScore)).map(e => e.username);
    winner.textContent = winningNames.length === 1 ? `🏆 ${winningNames[0]} wins the room with ${winningScore}/100.` : `🏆 It's a tie at the top: ${winningNames.join(", ")} · ${winningScore}/100.`;
    winner.classList.remove("hidden");
    scoreData.forEach((score, index) => {
      const who = entries.find(e => e.user_id === score.user_id);
      const card = document.createElement("article"); card.className = `ranked-entry ${index === 0 ? "top-entry" : ""}`;
      const top = document.createElement("div"); top.className = "ranked-top";
      const left = document.createElement("div");
      const name = document.createElement("div"); name.className = "ranked-name"; name.textContent = `${index + 1}. ${who?.username || "Writer"}${who?.user_id === currentUser.id ? " (You)" : ""}`;
      const rating = document.createElement("div"); rating.className = "ranked-ratings";
      const delta = score.rating?.delta;
      rating.textContent = score.rating ? `${score.rating.old_rating} → ${score.rating.new_rating} ELO (${delta > 0 ? "+" : ""}${delta})` : "Rating pending";
      left.append(name, rating);
      const points = document.createElement("strong"); points.className = "ranked-score"; points.textContent = `${score.total}/100`;
      top.append(left, points); card.appendChild(top);
      const bars = document.createElement("div"); bars.className = "score-bars";
      const labels = [["Craft", "craft"], ["Story", "story"], ["Prompt", "prompt_fit"], ["Emotion", "emotion"], ["Originality", "originality"]];
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

  function renderStories(entries) {
    const container = $("story-results"); container.replaceChildren();
    entries.forEach(entry => {
      const card = document.createElement("article"); card.className = "story-panel";
      const title = document.createElement("h4"); title.textContent = `${entry.username}${entry.user_id === currentUser.id ? " · YOU" : ""}`;
      const body = document.createElement("p"); body.textContent = entry.body;
      card.append(title, body);
      if (entry.user_id !== currentUser.id) {
        const report = document.createElement("button"); report.className = "story-report-button"; report.type = "button"; report.textContent = "Report this entry";
        report.addEventListener("click", () => {
          reportTargetUser = entry.user_id;
          $("report-intro").textContent = `Report ${entry.username}'s entry. Reports are private and visible to the site moderator.`;
          $("report-details").value = ""; $("report-feedback").textContent = "";
          $("report-modal").classList.remove("hidden");
        });
        card.appendChild(report);
      }
      container.appendChild(card);
    });
  }

  async function openModeration() {
    if (currentProfile?.is_moderator !== true) return toast("Moderator access is required.");
    $("moderation-modal").classList.remove("hidden");
    await loadModerationQueue();
  }

  async function loadModerationQueue() {
    const list = $("moderation-list");
    list.replaceChildren();
    const loading = document.createElement("p"); loading.className = "muted-note"; loading.textContent = "Loading open reports…"; list.appendChild(loading);
    const { data: reports, error } = await client.from("reports")
      .select("id,match_id,reporter_id,target_user_id,reason,details,source,status,created_at")
      .eq("status", "open").order("created_at", { ascending: false }).limit(40);
    if (error) { safeText(list, `Could not load reports: ${error.message}`); return; }
    list.replaceChildren();
    if (!reports?.length) { const empty = document.createElement("p"); empty.className = "muted-note"; empty.textContent = "No open reports. The queue is clear."; list.appendChild(empty); return; }
    const ids = [...new Set(reports.map(r => r.match_id))];
    const userIds = [...new Set(reports.flatMap(r => [r.reporter_id, r.target_user_id]).filter(Boolean))];
    const [{ data: profiles }, { data: matches }, { data: submissions }] = await Promise.all([
      client.from("profiles").select("id,username").in("id", userIds),
      client.from("matches").select("id,status,judge_status,moderation_approved").in("id", ids),
      client.from("submissions").select("match_id,user_id,body").in("match_id", ids)
    ]);
    const names = new Map((profiles || []).map(p => [p.id, p.username]));
    const matchMap = new Map((matches || []).map(m => [m.id, m]));
    const storyMap = new Map((submissions || []).map(s => [`${s.match_id}:${s.user_id}`, s.body]));
    reports.forEach(report => {
      const match = matchMap.get(report.match_id);
      const card = document.createElement("article"); card.className = "moderation-report-card";
      const heading = document.createElement("div"); heading.className = "moderation-report-heading";
      const title = document.createElement("b"); title.textContent = `${report.source === "automated_moderation" ? "Automated safety hold" : "Player report"} · ${names.get(report.target_user_id) || "Unknown writer"}`;
      const meta = document.createElement("small"); meta.textContent = `${report.reason.replaceAll("_", " ")} · ${new Date(report.created_at).toLocaleString()}`;
      heading.append(title, meta);
      const details = document.createElement("p"); details.textContent = report.details || "No extra details provided.";
      const story = document.createElement("blockquote"); story.className = "moderation-story";
      story.textContent = storyMap.get(`${report.match_id}:${report.target_user_id}`) || "The entry is unavailable.";
      card.append(heading, details, story);
      const actions = document.createElement("div"); actions.className = "moderation-actions";
      if (report.source === "automated_moderation" && match?.judge_status === "needs_review" && !match.moderation_approved) {
        const blockedBeforeAi = (report.details || "").includes("not sent to the AI judge or moderation API");
        if (!blockedBeforeAi) {
          const allow = document.createElement("button"); allow.className = "secondary-btn"; allow.textContent = "Approve & run AI judge";
          allow.addEventListener("click", () => moderateHeldMatch(report.match_id, "approve"));
          actions.appendChild(allow);
        }
        const reject = document.createElement("button"); reject.className = "secondary-btn danger-btn"; reject.textContent = "Reject & cancel match";
        reject.addEventListener("click", () => moderateHeldMatch(report.match_id, "reject"));
        actions.appendChild(reject);
      } else {
        const close = document.createElement("button"); close.className = "secondary-btn"; close.textContent = "Mark report reviewed";
        close.addEventListener("click", () => closeReport(report.id)); actions.append(close);
      }
      card.appendChild(actions); list.appendChild(card);
    });
  }

  async function moderateHeldMatch(matchId, action) {
    const prompt = action === "approve"
      ? "Approve this entry and let the AI judge the match?"
      : "Reject the held entry and cancel the match without awarding ratings?";
    if (!window.confirm(prompt)) return;
    const { error } = await client.rpc("moderate_held_match", { p_match_id: matchId, p_action: action, p_notes: action === "reject" ? "Removed after moderator review." : "" });
    if (error) return toast(error.message);
    toast(action === "approve" ? "Match approved. Participants can refresh to see AI judging." : "Match cancelled after review.");
    await loadModerationQueue();
  }

  async function closeReport(reportId) {
    const { error } = await client.rpc("moderate_report", { p_report_id: reportId, p_status: "reviewed" });
    if (error) return toast(error.message);
    toast("Report marked reviewed."); await loadModerationQueue();
  }

  async function sendReport() {
    if (!activeMatch?.id || !reportTargetUser) return;
    const reason = $("report-reason").value;
    const details = $("report-details").value.trim();
    $("send-report-btn").disabled = true;
    $("report-feedback").textContent = "Sending report...";
    try {
      const { error } = await client.rpc("report_story", {
        p_match_id: activeMatch.id,
        p_target_user: reportTargetUser,
        p_reason: reason,
        p_details: details
      });
      if (error) throw error;
      $("report-feedback").textContent = "Report sent. Thank you for helping keep Ink Arena respectful.";
      toast("Report sent to the site moderator.");
      window.setTimeout(() => closeModal("report-modal"), 1000);
      reportTargetUser = null;
    } catch (e) {
      $("report-feedback").textContent = e.message || "Could not send report.";
    } finally {
      $("send-report-btn").disabled = false;
    }
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
      if (data?.needsReview) {
        toast(data.message || "Entries were held for moderator review.");
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
