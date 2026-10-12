'use strict';

var SIZES = [16, 32, 48, 128];
var ORANGE = {};
var GRAY = {};

SIZES.forEach(function (size) {
  ORANGE[size] = 'icons/icon' + size + '.png';
  GRAY[size] = 'icons/gray/icon' + size + '.png';
});

function isYouTube(url) {
  if (!url) return false;
  try {
    var host = new URL(url).hostname;
    return host === 'youtube.com' || host === 'www.youtube.com';
  } catch (err) {
    return false;
  }
}

function applyIcon(tab) {
  var path = tab && isYouTube(tab.url) ? ORANGE : GRAY;
  chrome.action.setIcon({ path: path });
}

function refresh() {
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, function (tabs) {
    applyIcon(tabs && tabs[0]);
  });
}

chrome.tabs.onActivated.addListener(refresh);

chrome.tabs.onUpdated.addListener(function (tabId, info, tab) {
  if (tab && tab.active && (info.url || info.status === 'complete')) {
    applyIcon(tab);
  }
});

chrome.windows.onFocusChanged.addListener(refresh);
chrome.runtime.onStartup.addListener(refresh);
chrome.runtime.onInstalled.addListener(refresh);

refresh();
