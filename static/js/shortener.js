const DEFAULT_API_ENDPOINT = "https://api.jackshelata.com/urls";
const LOCAL_API_ENDPOINT = "http://localhost:8000/urls";
const isLocalHost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
const API_ENDPOINT = isLocalHost ? LOCAL_API_ENDPOINT : DEFAULT_API_ENDPOINT;
const form = document.getElementById("shortener-form");
const longUrlInput = document.getElementById("long-url");
const ttlInput = document.getElementById("ttl-seconds");
const submitBtn = document.getElementById("submit-btn");
const feedbackEl = document.getElementById("feedback");
const resultEl = document.getElementById("result");
const resultShortUrlEl = document.getElementById("result-short-url");
const copyShortUrlBtn = document.getElementById("copy-short-url");
const resultExpiresAtEl = document.getElementById("result-expires-at");

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
  if (typeof expiresAt !== "number") {
    return "Unknown";
  }

  if (expiresAt <= 0) {
    return "Never";
  }

  // Backend may return Unix seconds or milliseconds.
  const date = new Date(expiresAt < 1000000000000 ? expiresAt * 1000 : expiresAt);
  if (Number.isNaN(date.getTime())) {
    return String(expiresAt);
  }
  return date.toLocaleString();
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

async function submitShortenRequest(payload) {
  const response = await fetch(API_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  let parsedBody = null;
  try {
    parsedBody = await response.json();
  } catch (_) {
    // Allow non-JSON errors to still surface status details.
  }

  if (!response.ok) {
    const errorMessage = parsedBody && typeof parsedBody.error === "string"
      ? parsedBody.error
      : "Request failed with status " + response.status + ".";
    throw new Error(errorMessage);
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
  const ttlRaw = ttlInput.value.trim();
  if (ttlRaw.length > 0) {
    payload.ttl_seconds = Number(ttlRaw);
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
    submitBtn.disabled = false;
    submitBtn.textContent = "Create Short URL";
  }
});

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
