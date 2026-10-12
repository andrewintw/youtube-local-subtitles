(function () {
  'use strict';

  var els = {
    status: document.getElementById('status'),
    fileInfo: document.getElementById('fileInfo'),
    file: document.getElementById('file'),
    enabled: document.getElementById('enabled'),
    themeDark: document.getElementById('themeDark'),
    themeLight: document.getElementById('themeLight'),
    fontSize: document.getElementById('fontSize'),
    fontSizeVal: document.getElementById('fontSizeVal'),
    bgAlpha: document.getElementById('bgAlpha'),
    bgAlphaVal: document.getElementById('bgAlphaVal'),
    offset: document.getElementById('offset'),
    offsetVal: document.getElementById('offsetVal'),
    editToggle: document.getElementById('editToggle'),
    clear: document.getElementById('clear')
  };

  var loaded = false;
  var editMode = false;
  var themeSetting = 'dark';

  function applyPopupTheme() {
    var dark = themeSetting !== 'light';
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    els.themeDark.classList.toggle('active', dark);
    els.themeLight.classList.toggle('active', !dark);
  }

  function sendToTab(msg, callback) {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var tab = tabs && tabs[0];
      if (!tab || tab.id == null) {
        callback(null, '找不到作用中的分頁');
        return;
      }
      chrome.tabs.sendMessage(tab.id, msg, function (response) {
        if (chrome.runtime.lastError) {
          callback(null, chrome.runtime.lastError.message);
          return;
        }
        callback(response, null);
      });
    });
  }

  function patch(settings) {
    if (!loaded) return;
    sendToTab({ type: 'YLS_SET_SETTINGS', settings: settings }, function () {});
  }

  function showError(text) {
    els.status.textContent = text;
    els.status.style.display = 'block';
  }

  function hideError() {
    els.status.style.display = 'none';
    els.status.textContent = '';
  }

  function setFileInfo(text, ok) {
    els.fileInfo.textContent = text;
    els.fileInfo.className = 'file-info' + (ok ? ' ok' : '');
  }

  function updateLabels() {
    els.fontSizeVal.textContent = els.fontSize.value + 'px';
    els.bgAlphaVal.textContent = els.bgAlpha.value + '%';
    var sec = (parseInt(els.offset.value, 10) / 1000).toFixed(1);
    els.offsetVal.textContent = (sec > 0 ? '+' : '') + sec + 's';
  }

  function setEditButton() {
    els.editToggle.classList.toggle('active', editMode);
    els.editToggle.textContent = editMode ? '調整中…（點此或按 Esc 結束）' : '調整字幕大小與位置';
  }

  function writeSettings(settings) {
    if (!settings) return;
    if (typeof settings.enabled === 'boolean') els.enabled.checked = settings.enabled;
    if (typeof settings.fontSize === 'number') els.fontSize.value = settings.fontSize;
    if (typeof settings.bgAlpha === 'number') els.bgAlpha.value = Math.round(settings.bgAlpha * 100);
    if (typeof settings.offset === 'number') els.offset.value = Math.round(settings.offset * 1000);
    if (settings.theme) themeSetting = settings.theme === 'light' ? 'light' : 'dark';
    if (typeof settings.editMode === 'boolean') { editMode = settings.editMode; setEditButton(); }
    applyPopupTheme();
    updateLabels();
  }

  els.file.addEventListener('change', function () {
    var file = this.files && this.files[0];
    this.value = '';
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var result;
      try {
        result = SubParser.parse(String(reader.result));
      } catch (e) {
        showError('解析錯誤：' + e.message);
        return;
      }
      if (!result.cues.length) {
        showError('解析失敗：此檔找不到任何字幕 cue');
        return;
      }
      var settings = {
        enabled: els.enabled.checked,
        fontSize: parseInt(els.fontSize.value, 10),
        bgAlpha: parseInt(els.bgAlpha.value, 10) / 100,
        offset: parseInt(els.offset.value, 10) / 1000,
        theme: themeSetting
      };
      sendToTab(
        { type: 'YLS_SET_SUBTITLE', cues: result.cues, settings: settings },
        function (response, err) {
          if (err) return;
          loaded = true;
          hideError();
          setFileInfo('已載入 ' + result.cues.length + ' 條字幕（' +
            result.format.toUpperCase() + '）', true);
        }
      );
    };
    reader.onerror = function () {
      showError('讀取檔案失敗');
    };
    reader.readAsText(file, 'utf-8');
  });

  els.enabled.addEventListener('change', function () {
    patch({ enabled: els.enabled.checked });
  });

  function setTheme(theme) {
    themeSetting = theme;
    applyPopupTheme();
    patch({ theme: theme });
  }

  els.themeDark.addEventListener('click', function () { setTheme('dark'); });
  els.themeLight.addEventListener('click', function () { setTheme('light'); });

  els.fontSize.addEventListener('input', function () {
    updateLabels();
    patch({ fontSize: parseInt(els.fontSize.value, 10) });
  });

  els.bgAlpha.addEventListener('input', function () {
    updateLabels();
    patch({ bgAlpha: parseInt(els.bgAlpha.value, 10) / 100 });
  });

  els.offset.addEventListener('input', function () {
    updateLabels();
    patch({ offset: parseInt(els.offset.value, 10) / 1000 });
  });

  els.editToggle.addEventListener('click', function () {
    var next = !editMode;
    sendToTab({ type: 'YLS_SET_EDIT_MODE', value: next }, function (response, err) {
      if (err) return;
      editMode = response ? response.editMode : next;
      setEditButton();
    });
  });

  els.clear.addEventListener('click', function () {
    sendToTab({ type: 'YLS_CLEAR' }, function (response, err) {
      loaded = false;
      if (err) return;
      hideError();
      setFileInfo('尚未載入字幕');
    });
  });

  chrome.runtime.onMessage.addListener(function (msg) {
    if (msg && msg.type === 'YLS_EDIT_MODE_CHANGED') {
      editMode = !!msg.value;
      setEditButton();
    }
  });

  applyPopupTheme();
  updateLabels();
  setEditButton();

  sendToTab({ type: 'YLS_GET_STATUS' }, function (response, err) {
    if (err || !response || !response.ok) {
      setFileInfo('尚未載入字幕');
      return;
    }
    writeSettings(response.settings);
    loaded = response.loaded;
    setFileInfo(response.loaded ? '已載入 ' + response.count + ' 條字幕' : '尚未載入字幕', response.loaded);
  });
})();
