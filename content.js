(function () {
  'use strict';

  var DEFAULT_SETTINGS = {
    enabled: true,
    fontSize: 30,
    posX: 50,
    posY: 86,
    boxW: 72,
    boxH: 14,
    bgAlpha: 0.55,
    offset: 0,
    theme: 'dark',
    editMode: false,
    posCustom: false
  };

  var DEFAULT_DROP_PX = 90;
  var MIN_W = 12;
  var MIN_H = 6;
  var HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

  var state = {
    cues: [],
    loaded: false,
    settings: Object.assign({}, DEFAULT_SETTINGS)
  };

  var overlay = null;
  var box = null;
  var textEl = null;
  var editResume = false;
  var drag = null;
  var lastVideo = null;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function findPlayer() {
    return document.getElementById('movie_player') ||
      document.querySelector('.html5-video-player');
  }

  function isAd(player) {
    return player.classList.contains('ad-showing') ||
      player.classList.contains('ad-interrupting');
  }

  function disableNativeCaptions() {
    var player = findPlayer();
    var root = player || document;
    var button = root.querySelector('.ytp-subtitles-button');
    if (!button) return false;
    if (button.getAttribute('aria-pressed') === 'true') {
      try { button.click(); } catch (err) { /* ignore */ }
    }
    return true;
  }

  function scheduleCaptionDisable() {
    if (!state.loaded) return;
    var tries = 0;
    (function attempt() {
      if (!state.loaded) return;
      if (disableNativeCaptions()) return;
      if (tries++ < 15) setTimeout(attempt, 400);
    })();
  }

  function effectivePosY() {
    var s = state.settings;
    if (s.posCustom) return s.posY;
    var player = findPlayer();
    var height = player ? player.clientHeight : 0;
    var extra = height > 0 ? (DEFAULT_DROP_PX / height * 100) : 0;
    return Math.min(100 - s.boxH / 2, s.posY + extra);
  }

  function applyBox() {
    if (!box) return;
    var s = state.settings;
    box.style.left = (s.posX - s.boxW / 2) + '%';
    box.style.top = (effectivePosY() - s.boxH / 2) + '%';
    box.style.width = s.boxW + '%';
    box.style.height = s.boxH + '%';
  }

  function applyStyle() {
    if (!overlay || !box) return;
    var s = state.settings;
    overlay.style.setProperty('--yls-font-size', s.fontSize + 'px');
    overlay.style.setProperty('--yls-bg-alpha', String(s.bgAlpha));
    var dark = s.theme !== 'light';
    overlay.classList.toggle('yls-theme-dark', dark);
    overlay.classList.toggle('yls-theme-light', !dark);
    box.classList.toggle('yls-edit', !!s.editMode);
    applyBox();
  }

  function ensureOverlay() {
    var player = findPlayer();
    if (!player) return null;

    if (!overlay || !overlay.isConnected || overlay.parentElement !== player) {
      overlay = document.createElement('div');
      overlay.id = 'yls-subtitle-overlay';
      overlay.style.display = 'none';

      box = document.createElement('div');
      box.id = 'yls-subtitle-box';

      textEl = document.createElement('span');
      textEl.id = 'yls-subtitle-text';
      box.appendChild(textEl);

      HANDLES.forEach(function (dir) {
        var handle = document.createElement('div');
        handle.className = 'yls-handle';
        handle.dataset.dir = dir;
        box.appendChild(handle);
      });

      box.addEventListener('pointerdown', onBoxPointerDown, true);
      overlay.appendChild(box);
      player.appendChild(overlay);
      applyStyle();
    }
    return overlay;
  }

  function onBoxPointerDown(e) {
    if (!state.settings.editMode) return;
    e.preventDefault();
    e.stopPropagation();
    var player = findPlayer();
    if (!player) return;
    var rect = player.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    var s = state.settings;
    s.posY = effectivePosY();
    s.posCustom = true;
    var handle = e.target.classList && e.target.classList.contains('yls-handle');
    var left = s.posX - s.boxW / 2;
    var top = s.posY - s.boxH / 2;
    var right = s.posX + s.boxW / 2;
    var bottom = s.posY + s.boxH / 2;

    drag = {
      dir: handle ? e.target.dataset.dir : null,
      startX: (e.clientX - rect.left) / rect.width * 100,
      startY: (e.clientY - rect.top) / rect.height * 100,
      left: left,
      top: top,
      right: right,
      bottom: bottom,
      centerX: (left + right) / 2,
      centerY: (top + bottom) / 2
    };
    box.classList.add('yls-dragging');
    try { box.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    window.addEventListener('pointermove', onPointerMove, true);
    window.addEventListener('pointerup', onPointerUp, true);
  }

  function onPointerMove(e) {
    if (!drag) return;
    var player = findPlayer();
    if (!player) return;
    var rect = player.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    var dx = (e.clientX - rect.left) / rect.width * 100 - drag.startX;
    var dy = (e.clientY - rect.top) / rect.height * 100 - drag.startY;
    var s = state.settings;

    if (drag.dir) {
      var left = drag.left;
      var top = drag.top;
      var right = drag.right;
      var bottom = drag.bottom;
      if (drag.dir.indexOf('w') !== -1) left = clamp(drag.left + dx, 0, right - MIN_W);
      if (drag.dir.indexOf('e') !== -1) right = clamp(drag.right + dx, left + MIN_W, 100);
      if (drag.dir.indexOf('n') !== -1) top = clamp(drag.top + dy, 0, bottom - MIN_H);
      if (drag.dir.indexOf('s') !== -1) bottom = clamp(drag.bottom + dy, top + MIN_H, 100);
      s.posX = (left + right) / 2;
      s.posY = (top + bottom) / 2;
      s.boxW = right - left;
      s.boxH = bottom - top;
    } else {
      s.posX = clamp(drag.centerX + dx, s.boxW / 2, 100 - s.boxW / 2);
      s.posY = clamp(drag.centerY + dy, s.boxH / 2, 100 - s.boxH / 2);
    }
    applyBox();
  }

  function onPointerUp() {
    if (!drag) return;
    drag = null;
    if (box) box.classList.remove('yls-dragging');
    window.removeEventListener('pointermove', onPointerMove, true);
    window.removeEventListener('pointerup', onPointerUp, true);
  }

  function pauseForEdit() {
    var player = findPlayer();
    if (!player) return;
    var video = player.querySelector('video');
    editResume = !!(video && !video.paused);
    if (editResume && video) {
      try { video.pause(); } catch (err) { /* ignore */ }
    }
  }

  function resumeAfterEdit() {
    if (!editResume) return;
    editResume = false;
    var player = findPlayer();
    if (!player) return;
    var video = player.querySelector('video');
    if (!video) return;
    var playing = video.play();
    if (playing && playing.catch) playing.catch(function () { /* ignore */ });
  }

  function notifyEditMode() {
    try {
      chrome.runtime.sendMessage(
        { type: 'YLS_EDIT_MODE_CHANGED', value: state.settings.editMode },
        function () { void chrome.runtime.lastError; }
      );
    } catch (err) { /* ignore */ }
  }

  function findCue(time) {
    var cues = state.cues;
    var lo = 0;
    var hi = cues.length - 1;
    var best = -1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (cues[mid].start <= time) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (best < 0) return null;
    var cue = cues[best];
    return time <= cue.end ? cue : null;
  }

  function render(cue) {
    var content;
    if (cue) {
      content = cue.text;
    } else if (state.settings.editMode) {
      content = '字幕樣本 Sample Subtitle';
    } else {
      content = null;
    }

    if (content === null) {
      if (overlay && overlay.style.display !== 'none') {
        overlay.style.display = 'none';
      }
      return;
    }
    if (!ensureOverlay()) return;
    if (overlay.style.display === 'none') {
      overlay.style.display = '';
      applyStyle();
    }
    if (textEl.textContent !== content) {
      textEl.textContent = content;
    }
  }

  function tick() {
    requestAnimationFrame(tick);
    var cue = null;
    var video = null;
    if (state.settings.enabled && state.cues.length) {
      var player = findPlayer();
      if (player && !isAd(player)) {
        video = player.querySelector('video');
        if (video && video.readyState >= 1) {
          cue = findCue(video.currentTime + state.settings.offset);
        }
      }
    }
    if (video !== lastVideo) {
      lastVideo = video;
      if (state.loaded) {
        applyBox();
        scheduleCaptionDisable();
      }
    }
    render(cue);
  }

  function setSettings(patch) {
    if (!patch || typeof patch !== 'object') return;
    var wasEdit = state.settings.editMode;
    Object.assign(state.settings, patch);
    if (state.settings.editMode !== wasEdit) {
      if (state.settings.editMode) {
        pauseForEdit();
      } else {
        resumeAfterEdit();
      }
      notifyEditMode();
    }
    applyStyle();
  }

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.type) {
      case 'YLS_SET_SUBTITLE':
        state.cues = Array.isArray(msg.cues) ? msg.cues : [];
        state.loaded = state.cues.length > 0;
        setSettings(msg.settings);
        scheduleCaptionDisable();
        sendResponse({ ok: true, count: state.cues.length });
        break;
      case 'YLS_SET_SETTINGS':
        setSettings(msg.settings);
        sendResponse({ ok: true, settings: state.settings });
        break;
      case 'YLS_SET_EDIT_MODE':
        setSettings({ editMode: !!msg.value });
        sendResponse({ ok: true, editMode: state.settings.editMode });
        break;
      case 'YLS_GET_STATUS':
        sendResponse({
          ok: true,
          loaded: state.loaded,
          count: state.cues.length,
          settings: state.settings
        });
        break;
      case 'YLS_CLEAR':
        state.cues = [];
        state.loaded = false;
        if (overlay) {
          overlay.style.display = 'none';
          textEl.textContent = '';
        }
        sendResponse({ ok: true, count: 0 });
        break;
      default:
        break;
    }
    return false;
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state.settings.editMode) {
      setSettings({ editMode: false });
    }
  }, true);

  requestAnimationFrame(tick);
})();
