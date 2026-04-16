const DEFAULT_API_BASE = "https://api.jackshelata.com";
const LOCAL_API_BASE = "http://localhost:8000";
const isLocalHost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
const API_BASE = isLocalHost ? LOCAL_API_BASE : DEFAULT_API_BASE;
const CREATE_ENDPOINT = API_BASE + "/urls";
const GOOGLE_STATUS_ENDPOINT = API_BASE + "/auth/google/status";
const form = document.getElementById("shortener-form");
const longUrlInput = document.getElementById("long-url");
const customAliasInput = document.getElementById("custom-alias");
const ttlInput = document.getElementById("ttl-seconds");
const ttlHelpEl = document.getElementById("ttl-help");
const permanentCheckbox = document.getElementById("is-permanent");
const retentionModeGroupEl = document.getElementById("retention-mode-group");
const submitBtn = document.getElementById("submit-btn");
const feedbackEl = document.getElementById("feedback");
const resultEl = document.getElementById("result");
const resultShortUrlEl = document.getElementById("result-short-url");
const copyShortUrlBtn = document.getElementById("copy-short-url");
const resultExpiresAtEl = document.getElementById("result-expires-at");
const turnstileWidgetEl = document.getElementById("turnstile-widget");
const googleAuthPanelEl = document.getElementById("google-auth-panel");
const googleAuthHelpEl = document.getElementById("google-auth-help");
const googleSigninButtonEl = document.getElementById("google-signin-button");
const googleAuthStatusEl = document.getElementById("google-auth-status");
const googleAuthNameEl = document.getElementById("google-auth-name");
const googleAuthEmailEl = document.getElementById("google-auth-email");
const googleAuthPermissionEl = document.getElementById("google-auth-permission");
const googleSignoutBtn = document.getElementById("google-signout-btn");
const defaultTtlHelpText = ttlHelpEl ? ttlHelpEl.textContent : "";
let turnstileWidgetId = null;
let turnstileToken = "";
let googleButtonRendered = false;
let googleIdToken = "";
let googleAuthStatus = null;

function showFeedback(message, type) {
  feedbackEl.textContent = message;
  feedbackEl.className = "alert alert-" + type;
  resultEl.classList.add("d-none");
}

function hideFeedback() {
  feedbackEl.className = "alert d-none";
  feedbackEl.textContent = "";
}

function isValidUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch (_) {
    return false;
  }
}

function formatExpiresAt(expiresAt) {
  if (expiresAt === null || typeof expiresAt === "undefined") {
    return "Never";
  }

  if (typeof expiresAt !== "number") {
    return "Unknown";
  }

  if (expiresAt <= 0) {
    return "Never";
  }

  const date = new Date(expiresAt < 1000000000000 ? expiresAt * 1000 : expiresAt);
  if (Number.isNaN(date.getTime())) {
    return String(expiresAt);
  }
  return date.toLocaleString();
}

function isPermanentSelected() {
  return Boolean(permanentCheckbox && retentionModeGroupEl && !retentionModeGroupEl.classList.contains("d-none") && permanentCheckbox.checked);
}

function validateInputs() {
  const longUrl = longUrlInput.value.trim();
  const ttlRaw = ttlInput.value.trim();

  if (!longUrl) {
    return { valid: false, message: "Long URL is required." };
  }

  if (!isValidUrl(longUrl)) {
    return { valid: false, message: "Please enter a valid URL including http:// or https://." };
  }

  if (isPermanentSelected()) {
    return { valid: true };
  }

  if (ttlRaw.length > 0) {
    if (!/^\d+$/.test(ttlRaw)) {
      return { valid: false, message: "TTL must be an integer greater than 0." };
    }

    const ttl = Number(ttlRaw);
    if (!Number.isInteger(ttl) || ttl <= 0) {
      return { valid: false, message: "TTL must be an integer greater than 0." };
    }
  }

  return { valid: true };
}

function getTurnstileSiteKey() {
  if (!turnstileWidgetEl) {
    return "";
  }
  return turnstileWidgetEl.dataset.sitekey ? turnstileWidgetEl.dataset.sitekey.trim() : "";
}

function hasConfiguredTurnstileSiteKey() {
  const siteKey = getTurnstileSiteKey();
  return siteKey.length > 0 && !siteKey.startsWith("REPLACE_WITH_");
}

function isTurnstileRequired() {
  return !isLocalHost;
}

function resetTurnstileWidget() {
  turnstileToken = "";
  if (window.turnstile && turnstileWidgetId !== null) {
    window.turnstile.reset(turnstileWidgetId);
  }
}

window.initShortenerTurnstile = function () {
  if (!turnstileWidgetEl || !window.turnstile || !isTurnstileRequired()) {
    return;
  }

  if (!hasConfiguredTurnstileSiteKey()) {
    return;
  }

  turnstileWidgetId = window.turnstile.render(turnstileWidgetEl, {
    sitekey: getTurnstileSiteKey(),
    theme: "auto",
    callback: function (token) {
      turnstileToken = token;
    },
    "expired-callback": function () {
      turnstileToken = "";
    },
    "error-callback": function () {
      turnstileToken = "";
    }
  });
};

function getGoogleClientId() {
  if (!googleAuthPanelEl) {
    return "";
  }
  return googleAuthPanelEl.dataset.clientId ? googleAuthPanelEl.dataset.clientId.trim() : "";
}

function hasConfiguredGoogleClientId() {
  const clientId = getGoogleClientId();
  return clientId.length > 0 && !clientId.startsWith("REPLACE_WITH_");
}

function canUsePermanentLinks() {
  return Boolean(googleAuthStatus && googleAuthStatus.allow_permanent);
}

function updateRetentionControls() {
  const canUsePermanent = canUsePermanentLinks();
  if (retentionModeGroupEl) {
    retentionModeGroupEl.classList.toggle("d-none", !canUsePermanent);
  }
  if (!canUsePermanent && permanentCheckbox) {
    permanentCheckbox.checked = false;
  }

  const permanentSelected = canUsePermanent && permanentCheckbox && permanentCheckbox.checked;
  ttlInput.disabled = Boolean(permanentSelected);
  ttlInput.placeholder = permanentSelected ? "Not used for permanent links" : "Defaults to 3600";
  if (ttlHelpEl) {
    ttlHelpEl.textContent = permanentSelected
      ? "Permanent retention selected. TTL is ignored."
      : defaultTtlHelpText;
  }
}

function updateGoogleAuthUi() {
  if (!googleSigninButtonEl || !googleAuthStatusEl || !googleAuthHelpEl) {
    return;
  }

  const configured = hasConfiguredGoogleClientId();
  const signedIn = Boolean(googleAuthStatus);

  googleSigninButtonEl.classList.toggle("d-none", !configured || signedIn);
  googleAuthStatusEl.classList.toggle("d-none", !signedIn);

  if (!configured) {
    googleAuthHelpEl.textContent = "Google login is not configured on this page yet.";
    updateRetentionControls();
    return;
  }

  googleAuthHelpEl.textContent = "Sign in with Google if you need access to never-expiring links.";

  if (!signedIn) {
    updateRetentionControls();
    return;
  }

  googleAuthNameEl.textContent = googleAuthStatus.name || "Signed in with Google";
  googleAuthEmailEl.textContent = googleAuthStatus.email || "";
  googleAuthPermissionEl.textContent = googleAuthStatus.allow_permanent
    ? "Infinite retention is enabled for this account."
    : "This account can create expiring links only.";
  updateRetentionControls();
}

function clearGoogleAuthState() {
  googleIdToken = "";
  googleAuthStatus = null;
  if (window.google && window.google.accounts && window.google.accounts.id) {
    window.google.accounts.id.disableAutoSelect();
  }
  updateGoogleAuthUi();
}

function getDetailMessage(detail) {
  if (typeof detail === "string") {
    return detail;
  }

  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0];
    if (first && typeof first.msg === "string") {
      if (Array.isArray(first.loc) && first.loc.length > 0) {
        const field = first.loc[first.loc.length - 1];
        if (typeof field === "string" && field.length > 0) {
          return field + ": " + first.msg;
        }
      }
      return first.msg;
    }
  }

  return null;
}

function getResponseErrorMessage(response, parsedBody) {
  const detailMessage = parsedBody ? getDetailMessage(parsedBody.detail) : null;

  if (response.status === 429) {
    const retryAfter = response.headers.get("Retry-After");
    if (retryAfter) {
      const unit = retryAfter === "1" ? "second" : "seconds";
      return "Too many requests. You are being throttled. Try again in " + retryAfter + " " + unit + ".";
    }
    return "Too many requests. You are being throttled. Please wait and try again.";
  }

  if (response.status === 409) {
    return detailMessage
      ? detailMessage
      : "That custom alias is already in use. Try a different alias.";
  }

  if (detailMessage) {
    return detailMessage;
  }

  if (parsedBody && typeof parsedBody.error === "string") {
    return parsedBody.error;
  }

  return "Request failed with status " + response.status + ".";
}

async function parseJsonResponse(response) {
  try {
    return await response.json();
  } catch (_) {
    return null;
  }
}

async function fetchGoogleAuthStatus(credential) {
  const response = await fetch(GOOGLE_STATUS_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ google_id_token: credential })
  });

  const parsedBody = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(getResponseErrorMessage(response, parsedBody));
  }
  return parsedBody;
}

window.initShortenerGoogleIdentity = function () {
  if (!googleSigninButtonEl || !window.google || !window.google.accounts || !window.google.accounts.id) {
    return;
  }

  if (!hasConfiguredGoogleClientId()) {
    updateGoogleAuthUi();
    return;
  }

  if (!googleButtonRendered) {
    window.google.accounts.id.initialize({
      client_id: getGoogleClientId(),
      callback: async function (response) {
        if (!response || !response.credential) {
          showFeedback("Google sign-in did not return a usable credential.", "danger");
          return;
        }

        try {
          submitBtn.disabled = true;
          const status = await fetchGoogleAuthStatus(response.credential);
          googleIdToken = response.credential;
          googleAuthStatus = status;
          hideFeedback();
          updateGoogleAuthUi();
        } catch (error) {
          clearGoogleAuthState();
          showFeedback(error.message || "Unable to verify your Google login.", "danger");
        } finally {
          submitBtn.disabled = false;
        }
      }
    });
    window.google.accounts.id.renderButton(googleSigninButtonEl, {
      theme: "outline",
      size: "large",
      text: "signin_with",
      shape: "pill"
    });
    googleButtonRendered = true;
  }

  updateGoogleAuthUi();
};

async function submitShortenRequest(payload) {
  const response = await fetch(CREATE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const parsedBody = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(getResponseErrorMessage(response, parsedBody));
  }

  return parsedBody;
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const tempInput = document.createElement("input");
  tempInput.value = text;
  document.body.appendChild(tempInput);
  tempInput.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(tempInput);

  if (!copied) {
    throw new Error("Copy failed. Please copy manually.");
  }
}

function setCopyButtonState(label, disabled) {
  copyShortUrlBtn.textContent = label;
  copyShortUrlBtn.disabled = disabled;
}

form.addEventListener("submit", async function (event) {
  event.preventDefault();
  hideFeedback();
  resultEl.classList.add("d-none");

  const validation = validateInputs();
  if (!validation.valid) {
    showFeedback(validation.message, "warning");
    return;
  }

  const payload = { long_url: longUrlInput.value.trim() };
  const customAlias = customAliasInput.value.trim();
  if (customAlias.length > 0) {
    payload.custom_alias = customAlias;
  }

  if (isPermanentSelected()) {
    if (!googleIdToken || !canUsePermanentLinks()) {
      showFeedback("Sign in with an approved Google account to create a permanent link.", "warning");
      return;
    }
    payload.is_permanent = true;
    payload.google_id_token = googleIdToken;
  } else {
    const ttlRaw = ttlInput.value.trim();
    if (ttlRaw.length > 0) {
      payload.ttl_seconds = Number(ttlRaw);
    }
  }

  if (isTurnstileRequired()) {
    if (!hasConfiguredTurnstileSiteKey()) {
      showFeedback("Turnstile is not configured on this page yet.", "danger");
      return;
    }

    if (!turnstileToken) {
      showFeedback("Please complete the human verification challenge.", "warning");
      return;
    }

    payload.turnstile_token = turnstileToken;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Creating...";

  try {
    const data = await submitShortenRequest(payload);
    if (!data || typeof data.short_url !== "string") {
      throw new Error("Unexpected response from server.");
    }

    resultShortUrlEl.textContent = data.short_url;
    resultShortUrlEl.href = data.short_url;
    resultExpiresAtEl.textContent = formatExpiresAt(data.expires_at);
    resultEl.classList.remove("d-none");
  } catch (error) {
    showFeedback(error.message || "Unable to create short URL.", "danger");
  } finally {
    if (isTurnstileRequired()) {
      resetTurnstileWidget();
    }
    submitBtn.disabled = false;
    submitBtn.textContent = "Create Short URL";
  }
});

if (permanentCheckbox) {
  permanentCheckbox.addEventListener("change", function () {
    updateRetentionControls();
  });
}

if (googleSignoutBtn) {
  googleSignoutBtn.addEventListener("click", function () {
    clearGoogleAuthState();
    hideFeedback();
  });
}

copyShortUrlBtn.addEventListener("click", async function () {
  const shortUrl = resultShortUrlEl.textContent.trim();
  if (!shortUrl) {
    showFeedback("No short URL to copy yet.", "warning");
    return;
  }

  try {
    setCopyButtonState("Copying...", true);
    await copyTextToClipboard(shortUrl);
    setCopyButtonState("Copied!", true);
    setTimeout(function () {
      setCopyButtonState("Copy", false);
    }, 1200);
  } catch (error) {
    setCopyButtonState("Copy", false);
    showFeedback(error.message || "Unable to copy short URL.", "danger");
  }
});

updateGoogleAuthUi();
updateRetentionControls();
