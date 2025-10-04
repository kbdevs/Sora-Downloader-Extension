chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "download-video") {
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
