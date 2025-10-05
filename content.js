'use strict';


function isAllowedHost(hostname) {
  if (!hostname) return false;
  if (hostname === 'sora.chatgpt.com') return true;
  return hostname.endsWith('.sora.chatgpt.com');
}

const isSoraContext = isAllowedHost(window.location.hostname || '');

const BUTTON_CLASS = 'sora-downloader__button';
const WRAPPER_CLASS = 'sora-downloader__wrapper';
const POSITION_FLAG = 'data-sora-downloader-positioned';
const DOWNLOAD_ALL_ID = 'sora-downloader__download-all';

const processedVideos = new WeakSet();

const iconMarkup = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M5 20a2 2 0 0 1-2-2v-3h2v3h14v-3h2v3a2 2 0 0 1-2 2zm7-4-6-6 1.41-1.41L11 12.17V2h2v10.17l3.59-3.58L18 10z"/></svg>';

function getVideoSource(video) {
  if (!video) {
    return null;
  }

  const directSrc = video.currentSrc || video.src || '';
  if (directSrc) {
    return directSrc;
  }

  const sourceElement = Array.from(video.querySelectorAll('source')).find(el => el.src);
  return sourceElement ? sourceElement.src : null;
}

function buildSuggestedFilename(url) {
  if (!url) {
    return 'video.mp4';
  }

  if (url.startsWith('blob:')) {
    return 'video.webm';
  }

  try {
    const parsed = new URL(url);
    const lastSegment = parsed.pathname.split('/').filter(Boolean).pop() || 'video.mp4';
    if (lastSegment.includes('.')) {
      return lastSegment;
    }
    return `${lastSegment}.mp4`;
  } catch (_error) {
    return 'video.mp4';
  }
}

function ensurePositionedParent(element) {
  if (!element) {
    return null;
  }

  let parent = element.parentElement;
  if (!parent) {
    return element;
  }

  const computedStyle = window.getComputedStyle(parent);
  if (computedStyle.position === 'static') {
    if (!parent.hasAttribute(POSITION_FLAG)) {
      parent.setAttribute(POSITION_FLAG, 'true');
      parent.style.position = 'relative';
    }
  }

  return parent;
}

function createDownloadButton(video) {
  if (!video || processedVideos.has(video)) {
    return;
  }

  const host = ensurePositionedParent(video);
  if (!host) {
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.className = WRAPPER_CLASS;
  wrapper.style.position = 'absolute';
  wrapper.style.bottom = '8px';
  wrapper.style.right = '8px';
  wrapper.style.zIndex = '2147483646';
  wrapper.style.display = 'flex';
  wrapper.style.alignItems = 'center';
  wrapper.style.justifyContent = 'center';
  wrapper.style.pointerEvents = 'none';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = BUTTON_CLASS;
  button.setAttribute('aria-label', 'Download video');
  button.title = 'Download this video';
  button.innerHTML = iconMarkup;
  button.style.pointerEvents = 'auto';
  button.style.display = 'inline-flex';
  button.style.alignItems = 'center';
  button.style.justifyContent = 'center';
  button.style.width = '36px';
  button.style.height = '36px';
  button.style.borderRadius = '50%';
  button.style.border = 'none';
  button.style.cursor = 'pointer';
  button.style.background = 'rgba(0, 0, 0, 0.7)';
  button.style.color = '#fff';
  button.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.35)';
  button.style.backdropFilter = 'blur(2px)';
  button.style.transition = 'transform 0.18s ease, background 0.18s ease';

  button.addEventListener('mouseenter', () => {
    button.style.transform = 'scale(1.05)';
    button.style.background = 'rgba(0, 0, 0, 0.85)';
  });

  button.addEventListener('mouseleave', () => {
    button.style.transform = 'scale(1)';
    button.style.background = 'rgba(0, 0, 0, 0.7)';
  });

  button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();

    const sourceUrl = getVideoSource(video);
    if (!sourceUrl) {
      button.title = 'Unable to locate a downloadable source for this video';
      return;
    }

    const filename = buildSuggestedFilename(sourceUrl);
    button.disabled = true;
    button.style.opacity = '0.6';

    chrome.runtime.sendMessage(
      {
        type: 'download-video',
        payload: {
          url: sourceUrl,
          filename
        }
      },
      response => {
        button.disabled = false;
        button.style.opacity = '1';

        if (chrome.runtime.lastError) {
          console.warn('SoraDownloader: download failed', chrome.runtime.lastError.message);
          button.title = 'Download failed. Try again.';
          return;
        }

        if (!response || !response.ok) {
          const errorMessage = (response && response.error) || 'Unknown error';
          console.warn('SoraDownloader: download failed', errorMessage);
          button.title = `Download failed: ${errorMessage}`;
          return;
        }

        button.title = 'Download started.';
      }
    );
  });

  wrapper.appendChild(button);
  host.appendChild(wrapper);

  processedVideos.add(video);
}

function handleExistingVideos() {
  const videos = document.querySelectorAll('video');
  videos.forEach(createDownloadButton);
}

function findDraftsHeaderContainer() {
  const headings = document.querySelectorAll('h1, h2');
  for (const heading of headings) {
    if (heading.textContent && heading.textContent.trim().toLowerCase() === 'drafts') {
      const parent = heading.parentElement;
      if (parent && parent.classList.contains('flex')) {
        return parent;
      }
    }
  }
  return null;
}

function triggerBulkDownload(button) {
  const videos = Array.from(document.querySelectorAll('video'));
  const uniqueSources = [];
  const seen = new Set();

  videos.forEach(video => {
    const sourceUrl = getVideoSource(video);
    if (!sourceUrl || seen.has(sourceUrl)) {
      return;
    }
    seen.add(sourceUrl);
    uniqueSources.push(sourceUrl);
  });

  if (!uniqueSources.length) {
    button.title = 'No downloadable videos found';
    return;
  }

  button.disabled = true;
  const defaultLabel = button.dataset.defaultLabel || button.textContent || 'Download All';
  let remaining = uniqueSources.length;
  let hadError = false;

  button.textContent = `Downloading (${remaining})`;

  uniqueSources.forEach((url, index) => {
    const filename = buildSuggestedFilename(url) || `video-${index + 1}.mp4`;

    chrome.runtime.sendMessage(
      {
        type: 'download-video',
        payload: {
          url,
          filename
        }
      },
      response => {
        remaining -= 1;
        if (chrome.runtime.lastError || !response || !response.ok) {
          hadError = true;
        }

        if (remaining > 0) {
          button.textContent = `Downloading (${remaining})`;
          return;
        }

        button.disabled = false;
        button.textContent = hadError ? 'Retry Downloads' : defaultLabel;
        button.title = hadError ? 'Some downloads may have failed. Try again.' : 'All downloads started.';
      }
    );
  });
}

function ensureDownloadAllButton() {
  const container = findDraftsHeaderContainer();
  if (!container || container.querySelector(`#${DOWNLOAD_ALL_ID}`)) {
    return;
  }

  const button = document.createElement('button');
  button.id = DOWNLOAD_ALL_ID;
  button.type = 'button';
  button.textContent = 'Download All';
  button.dataset.defaultLabel = 'Download All';
  button.setAttribute('aria-label', 'Download all videos');
  button.title = 'Download all videos on this page';
  button.style.display = 'inline-flex';
  button.style.alignItems = 'center';
  button.style.justifyContent = 'center';
  button.style.padding = '0.4rem 0.9rem';
  button.style.borderRadius = '999px';
  button.style.border = 'none';
  button.style.cursor = 'pointer';
  button.style.background = 'rgba(0, 0, 0, 0.8)';
  button.style.color = '#fff';
  button.style.fontSize = '0.9rem';
  button.style.fontWeight = '600';
  button.style.transition = 'transform 0.18s ease, background 0.18s ease';

  button.addEventListener('mouseenter', () => {
    if (button.disabled) {
      return;
    }
    button.style.transform = 'scale(1.03)';
    button.style.background = 'rgba(0, 0, 0, 0.9)';
  });

  button.addEventListener('mouseleave', () => {
    button.style.transform = 'scale(1)';
    button.style.background = 'rgba(0, 0, 0, 0.8)';
  });

  button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    triggerBulkDownload(button);
  });

  container.appendChild(button);
}

function handleMutations(mutations) {
  for (const mutation of mutations) {
    if (mutation.type === 'childList') {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType !== Node.ELEMENT_NODE) {
          return;
        }

        if (node.tagName === 'VIDEO') {
          createDownloadButton(node);
          return;
        }

        const nestedVideos = node.querySelectorAll ? node.querySelectorAll('video') : [];
        nestedVideos.forEach(createDownloadButton);
      });
    }
  }

  ensureDownloadAllButton();
}

function bootstrap() {
  if (!isSoraContext) {
    return;
  }

  handleExistingVideos();
  ensureDownloadAllButton();

  const observer = new MutationObserver(handleMutations);
  observer.observe(document.documentElement || document.body, {
    childList: true,
    subtree: true
  });
}

if (isSoraContext) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  } else {
    bootstrap();
  }
} else {
  console.info('SoraDownloader: skipping execution outside sora.com');
}
