function isAllowedUrl(url) {
  if (!url) {
    return false;
  }

  try {
    const parsed = new URL(url);
    return parsed.hostname === 'sora.com' || parsed.hostname.endsWith('.sora.com');
  } catch (_error) {
    return false;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "download-video") {
    return;
  }

  const senderUrl = sender && sender.url;
  if (!isAllowedUrl(senderUrl)) {
    sendResponse({ ok: false, error: "unauthorized-host" });
    return;
  }

  const { url, filename } = message.payload || {};

  if (!url) {
    sendResponse({ ok: false, error: "missing-url" });
    return;
  }

  const downloadOptions = {
    url,
    filename: filename || undefined,
    saveAs: false
  };

  chrome.downloads.download(downloadOptions, downloadId => {
    if (chrome.runtime.lastError) {
      sendResponse({ ok: false, error: chrome.runtime.lastError.message || "download-failed" });
      return;
    }

    sendResponse({ ok: true, downloadId });
  });

  return true;
});
