(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const CONFIG = window.INK_ARENA_CONFIG || {};
  const configured = CONFIG.supabaseUrl && CONFIG.supabasePublishableKey &&
    !String(CONFIG.supabaseUrl).includes("PASTE_") && !String(CONFIG.supabasePublishableKey).includes("PASTE_");

  let client = null;
  let currentUser = null;
  let currentProfile = null;
  let activeMatch = null;
  let pollHandle = null;
  let clockHandle = null;
  let deadlineMs = null;
  let submissionSent = false;
  let busy = false;

  function toast(message) {
    const el = $("toast");
    el.textContent = message;
    el.classList.add("show");
    window.setTimeout(() => el.classList.remove("show"), 2800);
  }
  function authMessage(message, isError = false) {
    const el = $("auth-message");
    el.textContent = message;
    el.style.color = isError ? "var(--red)" : "var(--gold)";
  }
  function setBusy(value) {
    busy = value;
    ["signup-btn", "login-btn", "start-btn", "submit-btn"].forEach(id => {
      const el = $(id);
      if (el) el.disabled = value || el.dataset.locked === "true";
    });
  }
  function showScreen(id) {
    ["battle-card", "waiting-card", "opponent-wait-card", "editor-card", "results-card"].forEach(screen => {
      $(screen).classList.toggle("hidden", screen !== id);
    });
  }
  function safeText(node, text) { node.textContent = text == null ? "" : String(text); }

  function init() {
    if (!configured || !window.supabase?.createClient) {
      authMessage("Setup needed: create your Supabase project, run supabase-setup.sql, then add your Project URL and Publishable key to config.js.", true);
      $("signup-btn").disabled = true;
      $("login-btn").disabled = true;
      return;
    }
    client = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabasePublishableKey);
    $("auth-form").addEventListener("submit", login);
    $("signup-btn").addEventListener("click", signup);
    $("logout-btn").addEventListener("click", logout);
    $("start-btn").addEventListener("click", findMatch);
    $("cancel-btn").addEventListener("click", cancelMatch);
    $("give-up-btn").addEventListener("click", cancelMatch);
    $("submit-btn").addEventListener("click", submitStory);
    $("again-btn").addEventListener("click", () => { showScreen("battle-card"); findMatch(); });
    $("story-input").addEventListener("input", updateWordCount);
    client.auth.onAuthStateChange((_event, session) => {
      // Supabase recommends keeping this callback quick; load data after it returns.
      window.setTimeout(() => handleSession(session), 0);
    });
    client.auth.getSession().then(({ data, error }) => {
      if (error) authMessage(error.message, true);
      handleSession(data?.session || null);
    });
  }

  async function signup() {
    if (busy) return;
    const username = $("username-input").value.trim();
    const email = $("email-input").value.trim();
    const password = $("password-input").value;
    if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
      authMessage("Choose a username with 3–20 letters, numbers, or underscores.", true); return;
    }
    if (!email || password.length < 8) {
      authMessage("Enter a valid email and a password with at least 8 characters.", true); return;
    }
    setBusy(true); authMessage("Creating your account...");
    try {
      const { data, error } = await client.auth.signUp({
        email, password, options: { data: { username } }
      });
      if (error) throw error;
      if (!data.session) {
        authMessage("Account created. Check your email for the confirmation link, then log in.");
      } else {
        authMessage("Account created. Welcome to Ink Arena!");
      }
    } catch (e) { authMessage(e.message || "Could not create account.", true); }
    finally { setBusy(false); }
  }

  async function login(event) {
    event?.preventDefault();
    if (busy) return;
    const email = $("email-input").value.trim();
    const password = $("password-input").value;
    if (!email || !password) { authMessage("Enter your email and password.", true); return; }
    setBusy(true); authMessage("Signing in...");
    try {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      authMessage("Signed in.");
    } catch (e) { authMessage(e.message || "Could not sign in.", true); }
    finally { setBusy(false); }
  }

  async function logout() {
    if (activeMatch && ["waiting", "active"].includes(activeMatch.status)) {
      const ok = window.confirm("You are in a live match. Leave it and log out?");
      if (!ok) return;
      await cancelMatch(true);
    }
    const { error } = await client.auth.signOut();
    if (error) toast(error.message);
  }

  async function handleSession(session) {
    currentUser = session?.user || null;
    if (!currentUser) {
      stopPolling(); currentProfile = null; activeMatch = null;
      $("auth-card").classList.remove("hidden");
      $("signed-in-strip").classList.add("hidden");
      $("stats-grid").classList.add("hidden");
      $("app-content").classList.add("hidden");
      safeText($("header-username"), "GUEST"); safeText($("header-rating"), "SIGN IN TO PLAY");
      return;
    }
    $("auth-card").classList.add("hidden");
    $("signed-in-strip").classList.remove("hidden");
    $("stats-grid").classList.remove("hidden");
    $("app-content").classList.remove("hidden");
    await loadProfile();
    await loadLeaderboard();
    await resumeMatch();
  }

  async function loadProfile() {
    const { data, error } = await client.from("profiles")
      .select("id, username, rating, wins, losses")
      .eq("id", currentUser.id).single();
    if (error) {
      toast("Profile could not load: " + error.message);
      return;
    }
    currentProfile = data;
    const username = data.username || "Writer";
    safeText($("header-username"), username.toUpperCase());
    safeText($("header-avatar"), username.charAt(0).toUpperCase());
    safeText($("signed-in-name"), username);
    safeText($("you-name"), username);
    safeText($("you-avatar"), username.charAt(0).toUpperCase());
    safeText($("you-rating"), "UNRANKED");
    safeText($("header-rating"), "UNRANKED SCRIMMAGE");
    safeText($("rating-stat"), "—");
    safeText($("matches-stat"), String((data.wins || 0) + (data.losses || 0)));
    safeText($("league-stat"), "Writer");
  }

  async function loadLeaderboard() {
    const { data, error } = await client.from("profiles")
      .select("username, rating").order("rating", { ascending: false }).limit(8);
    const container = $("leaderboard-list"); container.replaceChildren();
    if (error) { safeText(container, "Leaderboard unavailable: " + error.message); return; }
    if (!data?.length) { safeText(container, "No players yet. Be the first to join."); return; }
    data.forEach((person, i) => {
      const row = document.createElement("div"); row.className = "leader-row";
      const rank = document.createElement("span"); rank.className = "rank"; rank.textContent = String(i + 1).padStart(2, "0");
      const icon = document.createElement("span"); icon.className = "mini-avatar"; icon.textContent = (person.username || "W").charAt(0).toUpperCase();
      const name = document.createElement("span"); name.className = "leader-name"; name.textContent = person.username || "Writer";
      const sub = document.createElement("small"); sub.textContent = "Unranked"; name.appendChild(sub);
      const rating = document.createElement("b"); rating.textContent = "—";
      row.append(rank, icon, name, rating); container.appendChild(row);
    });
  }

  async function resumeMatch() {
    const { data, error } = await client.from("matches").select("*")
      .or(`player1.eq.${currentUser.id},player2.eq.${currentUser.id}`)
      .in("status", ["waiting", "active", "completed", "expired"])
      .order("created_at", { ascending: false }).limit(1);
    if (error) { console.warn("Resume match:", error.message); return; }
    const match = data?.[0];
    if (!match) { activeMatch = null; showScreen("battle-card"); return; }
    activeMatch = match;
    if (match.status === "waiting") { showScreen("waiting-card"); beginPolling(); return; }
    if (match.status === "active") { await handleActiveMatch(match); beginPolling(); return; }
    await finishDisplay(match);
  }

  async function findMatch() {
    if (!currentUser || busy) return;
    setBusy(true); safeText($("start-btn"), "Finding opponent...");
    try {
      const { data, error } = await client.rpc("find_match");
      if (error) throw error;
      const match = Array.isArray(data) ? data[0] : data;
      if (!match?.id) throw new Error("The match queue did not return a match. Check that the SQL setup completed.");
      activeMatch = match;
      if (match.status === "waiting") {
        safeText($("waiting-title"), "Looking for another writer...");
        safeText($("waiting-copy"), "Keep this tab open. Your match starts automatically when another player joins.");
        showScreen("waiting-card"); beginPolling();
      } else if (match.status === "active") {
        await handleActiveMatch(match); beginPolling();
      }
    } catch (e) { toast(e.message || "Could not find a match."); }
    finally { setBusy(false); safeText($("start-btn"), "Find a writing battle →"); }
  }

  function beginPolling() {
    stopPolling(); pollHandle = window.setInterval(pollMatch, 2200);
    pollMatch();
  }
  function stopPolling() { if (pollHandle) window.clearInterval(pollHandle); pollHandle = null; }

  async function pollMatch() {
    if (!activeMatch?.id || !client) return;
    try {
      const { data, error } = await client.from("matches").select("*").eq("id", activeMatch.id).single();
      if (error) throw error;
      activeMatch = data;
      if (data.status === "active") {
        if (data.deadline_at && Date.now() > new Date(data.deadline_at).getTime() + 35000) {
          await client.rpc("expire_match", { p_match_id: data.id });
          return;
        }
        await handleActiveMatch(data);
      } else if (data.status === "completed" || data.status === "expired") {
        stopPolling(); await finishDisplay(data);
      } else if (data.status === "cancelled") {
        stopPolling(); activeMatch = null; showScreen("battle-card"); toast("That match was cancelled. Start another search.");
      }
    } catch (e) { console.warn("Match check:", e.message); }
  }

  async function handleActiveMatch(match) {
    const { data: prompt, error } = await client.from("prompts").select("title, body").eq("id", match.prompt_id).single();
    if (error) throw error;
    safeText($("prompt-title"), prompt.title); safeText($("prompt-text"), prompt.body);
    safeText($("match-id"), "MATCH #" + match.id.slice(0, 8).toUpperCase());
    deadlineMs = new Date(match.deadline_at).getTime();
    const { data: mine, error: subError } = await client.from("submissions").select("id, body").eq("match_id", match.id).eq("user_id", currentUser.id).maybeSingle();
    if (subError) throw subError;
    if (mine) {
      submissionSent = true; showScreen("opponent-wait-card"); startClock(); return;
    }
    submissionSent = false;
    if ($("editor-card").classList.contains("hidden")) {
      $("story-input").value = ""; updateWordCount();
    }
    showScreen("editor-card"); startClock();
  }

  function startClock() {
    if (clockHandle) window.clearInterval(clockHandle);
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000));
      const minutes = Math.floor(remaining / 60), seconds = remaining % 60;
      safeText($("timer"), `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`);
      $("timer").classList.toggle("urgent", remaining <= 60);
      if (remaining === 0 && !submissionSent) {
        window.clearInterval(clockHandle);
        const text = $("story-input").value.trim() || "I ran out of time before I could finish my story.";
        submitStory(text, true);
      }
    };
    tick(); clockHandle = window.setInterval(tick, 1000);
  }

  function countWords(text) { const t = text.trim(); return t ? t.split(/\s+/).length : 0; }
  function updateWordCount() {
    const count = countWords($("story-input").value);
    safeText($("word-count"), count);
    const disabled = submissionSent || count < 1 || count > 400 || busy;
    $("submit-btn").disabled = disabled;
    $("editor-status").textContent = count > 400 ? "Please shorten your story to 400 words." : "Both writers share the same server deadline.";
  }

  async function submitStory(textOverride = null, automatic = false) {
    if (!activeMatch || submissionSent || busy) return;
    const body = (textOverride ?? $("story-input").value).trim();
    if (!body) { toast("Write at least one word before submitting."); return; }
    if (countWords(body) > 400) { toast("Your story must be 400 words or fewer."); return; }
    setBusy(true); safeText($("submit-btn"), "Submitting...");
    try {
      const { error } = await client.rpc("submit_story", { p_match_id: activeMatch.id, p_body: body });
      if (error) throw error;
      submissionSent = true;
      if (clockHandle) window.clearInterval(clockHandle);
      showScreen("opponent-wait-card"); beginPolling();
      if (automatic) toast("Time is up. Your draft was submitted.");
      else toast("Story submitted. Waiting for your opponent.");
    } catch (e) { toast(e.message || "Could not submit the story."); }
    finally { setBusy(false); safeText($("submit-btn"), "Submit story →"); updateWordCount(); }
  }

  async function finishDisplay(match) {
    activeMatch = match; stopPolling();
    if (clockHandle) window.clearInterval(clockHandle);
    showScreen("results-card");
    const { data: submissions, error } = await client.from("submissions")
      .select("user_id, body, submitted_at").eq("match_id", match.id);
    if (error) { toast("Could not load submissions: " + error.message); return; }
    const people = [match.player1, match.player2].filter(Boolean);
    const names = {};
    for (const uid of people) {
      const { data } = await client.from("profiles").select("username").eq("id", uid).maybeSingle();
      names[uid] = data?.username || "Writer";
    }
    const mine = submissions?.find(s => s.user_id === currentUser.id);
    const other = submissions?.find(s => s.user_id !== currentUser.id);
    safeText($("story-one-title"), (mine ? "You — " : "You — no submission · ") + (names[currentUser.id] || "Writer"));
    safeText($("story-two-title"), other ? (names[other.user_id] || "Opponent") : "Opponent — no submission");
    safeText($("story-one"), mine?.body || "No story was submitted.");
    safeText($("story-two"), other?.body || (match.status === "expired" ? "The other writer did not submit before the match expired." : "No story was submitted."));
    safeText($("result-subtitle"), match.status === "expired" ? "This match timed out. You can start another one." : "Both submissions are saved. Compare the two stories.");
  }

  async function cancelMatch(silent = false) {
    if (!activeMatch?.id) { showScreen("battle-card"); return; }
    try {
      const { error } = await client.rpc("cancel_match", { p_match_id: activeMatch.id });
      if (error) throw error;
    } catch (e) { if (!silent) toast(e.message || "Could not leave match."); }
    stopPolling(); if (clockHandle) window.clearInterval(clockHandle);
    activeMatch = null; submissionSent = false; showScreen("battle-card");
    if (!silent) toast("You left the match.");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
