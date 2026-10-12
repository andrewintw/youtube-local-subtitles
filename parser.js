(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module && module.exports) {
    module.exports = api;
  }
  root.SubParser = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var TIME_RE = /((?:\d{1,2}:)?\d{1,2}:\d{1,2}[.,]\d{1,3})\s*-->\s*((?:\d{1,2}:)?\d{1,2}:\d{1,2}[.,]\d{1,3})/;

  function parseTime(token) {
    var parts = String(token).replace(',', '.').split(':');
    var h = 0;
    var m = 0;
    var s = 0;
    if (parts.length === 3) {
      h = parseInt(parts[0], 10) || 0;
      m = parseInt(parts[1], 10) || 0;
      s = parseFloat(parts[2]);
    } else if (parts.length === 2) {
      m = parseInt(parts[0], 10) || 0;
      s = parseFloat(parts[1]);
    } else {
      s = parseFloat(parts[0]);
    }
    if (isNaN(s)) return NaN;
    return h * 3600 + m * 60 + s;
  }

  function stripMarkup(text) {
    return String(text)
      .replace(/\{\\[^}]*\}/g, '')
      .replace(/<[^>]*>/g, '')
      .replace(/&#x([0-9a-f]+);/gi, function (_, hex) {
        return String.fromCharCode(parseInt(hex, 16));
      })
      .replace(/&#(\d+);/g, function (_, num) {
        return String.fromCharCode(parseInt(num, 10));
      })
      .replace(/&nbsp;/gi, ' ')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#0*39;|&apos;/gi, "'")
      .replace(/&amp;/gi, '&');
  }

  function isSkippableHeader(line) {
    return /^(WEBVTT\b|NOTE\b|STYLE\b|REGION\b)/.test(line);
  }

  function isCueStart(line) {
    return TIME_RE.test(line);
  }

  function parse(text) {
    if (typeof text !== 'string' || !text.replace(/^\uFEFF/, '').trim()) {
      return { cues: [], format: 'unknown' };
    }
    var normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    var isVtt = /^\s*WEBVTT/.test(normalized);
    var lines = normalized.split('\n');
    var cues = [];
    var i = 0;

    while (i < lines.length) {
      var line = lines[i];

      if (isSkippableHeader(line.trim())) {
        i++;
        continue;
      }
      if (line.indexOf('-->') === -1) {
        i++;
        continue;
      }
      var m = TIME_RE.exec(line);
      if (!m) {
        i++;
        continue;
      }

      var start = parseTime(m[1]);
      var end = parseTime(m[2]);
      i++;

      var textLines = [];
      while (i < lines.length) {
        var l = lines[i];
        if (!l.trim()) {
          i++;
          break;
        }
        if (isCueStart(l)) {
          break;
        }
        if (/^\s*\d+\s*$/.test(l) && i + 1 < lines.length && isCueStart(lines[i + 1])) {
          break;
        }
        textLines.push(l);
        i++;
      }

      var payload = stripMarkup(textLines.join('\n')).replace(/\n+$/, '').trim();
      if (!payload) continue;
      if (!isFinite(start) || !isFinite(end) || end < start) continue;

      cues.push({ start: start, end: end, text: payload });
    }

    cues.sort(function (a, b) {
      return a.start - b.start || a.end - b.end;
    });

    return { cues: cues, format: isVtt ? 'vtt' : 'srt' };
  }

  return {
    parse: parse,
    parseTime: parseTime,
    stripMarkup: stripMarkup
  };
});
