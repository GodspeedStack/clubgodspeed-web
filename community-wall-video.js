/* ==========================================================================
   The Wall: video preparation (runs on the uploader's phone, before upload)

   Why: iPhones record HEVC by default. Chrome on Android and Windows usually
   cannot play HEVC, so an iPhone clip uploaded as-is would be a black box for
   many families. This module converts any clip that is not already H.264 into
   H.264 + AAC MP4 (max 1280px long edge, max 30 fps) using the browser's own
   hardware codecs (WebCodecs) through Mediabunny. Nothing leaves the phone
   except the finished file; no third-party transcoding service is involved.

   Contract:
     CWVideo.prepare(file, { onProgress(fraction, label), signal }) ->
       Promise<{ blob, mime, codec, width, height, duration_ms, poster,
                 transcoded, audioDropped }>
     Rejects with { code, message } where message is parent-readable.

   Every output also drops all container metadata tags (GPS location, device
   make and model). If conversion is impossible on this device, the original
   is uploaded with its GPS coordinates zeroed and `codec` set, so viewers'
   players can offer a save-to-watch fallback instead of a black box.
   ========================================================================== */
(function () {
  'use strict';

  var LIB_SRC = 'vendor/mediabunny-1.61.0.min.js';
  var LIB_SRI = 'sha384-OAYtO+g2XSKqz76g5m0DuCKKB/6b0iosC7PM/9DC1frqoEDtfq5ZiuOyZlUo1rzK';   // replaced at build time with the file's sha384
  var MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
  var MAX_INPUT_BYTES = 2 * 1024 * 1024 * 1024; // conversion streams the source; 4K clips are large
  var MAX_MS = 60500;
  var LONG_EDGE = 1280;
  var MAX_FPS = 30;
  var VIDEO_BPS = 2500000;

  function err(code, message) { return { code: code, message: message }; }

  var libPromise = null;
  function loadLib() {
    if (window.Mediabunny) return Promise.resolve(window.Mediabunny);
    if (libPromise) return libPromise;
    libPromise = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = LIB_SRC;
      if (LIB_SRI.indexOf('sha') === 0) { s.integrity = LIB_SRI; s.crossOrigin = 'anonymous'; }
      s.onload = function () { window.Mediabunny ? res(window.Mediabunny) : rej(err('LIB_MISSING', 'Video tools did not load.')); };
      s.onerror = function () { libPromise = null; rej(err('LIB_MISSING', 'Video tools did not load. Check your connection and try again.')); };
      document.head.appendChild(s);
    });
    return libPromise;
  }

  function even(n) { n = Math.max(2, Math.round(n)); return n % 2 ? n - 1 : n; }

  // Fit display size inside LONG_EDGE, keep aspect, even numbers for the encoder.
  function targetSize(w, h) {
    var k = Math.min(1, LONG_EDGE / Math.max(w, h));
    return { width: even(w * k), height: even(h * k) };
  }

  function canvasToJpeg(canvas) {
    if (canvas.convertToBlob) return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.82 });
    return new Promise(function (res, rej) {
      canvas.toBlob(function (b) { b ? res(b) : rej(err('POSTER', 'Could not make a preview.')); }, 'image/jpeg', 0.82);
    });
  }

  // A neutral poster when the device cannot decode the clip at all.
  function placeholderPoster(w, h) {
    var c = document.createElement('canvas');
    var t = targetSize(w || 720, h || 1280); t.width = Math.min(t.width, 720); t.height = Math.round(t.width * (h || 1280) / (w || 720));
    c.width = t.width; c.height = t.height;
    var g = c.getContext('2d');
    g.fillStyle = '#111114'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = 'rgba(255,255,255,.85)';
    var r = Math.min(c.width, c.height) * 0.09, cx = c.width / 2, cy = c.height / 2;
    g.beginPath(); g.moveTo(cx - r * 0.6, cy - r); g.lineTo(cx + r, cy); g.lineTo(cx - r * 0.6, cy + r); g.closePath(); g.fill();
    return canvasToJpeg(c);
  }

  function posterFromTrack(MB, track, w, h) {
    var t = targetSize(w, h);
    var k = Math.min(1, 1080 / Math.max(t.width, t.height));
    var sink = new MB.CanvasSink(track, { width: even(t.width * k), height: even(t.height * k), fit: 'contain', poolSize: 1 });
    return track.getFirstTimestamp().then(function (first) {
      return sink.getCanvas(first + 0.25).then(function (wc) { return wc || sink.getCanvas(first); });
    }).then(function (wc) {
      if (!wc) throw err('POSTER', 'No frame');
      return canvasToJpeg(wc.canvas);
    });
  }

  // Fallback GPS scrub for files uploaded without conversion: zero ISO 6709
  // coordinate strings inside the moov box. Same byte length, file stays valid.
  function scrubLocation(file) {
    return file.arrayBuffer().then(function (ab) {
      var buf = new Uint8Array(ab), dv = new DataView(ab), off = 0, start = -1, end = -1;
      while (off + 8 <= buf.length) {
        var size = dv.getUint32(off), hdr = 8;
        var type = String.fromCharCode(buf[off + 4], buf[off + 5], buf[off + 6], buf[off + 7]);
        if (size === 1 && off + 16 <= buf.length) { size = Number(dv.getBigUint64(off + 8)); hdr = 16; }
        else if (size === 0) size = buf.length - off;
        if (size < hdr) break;
        if (type === 'moov') { start = off; end = Math.min(buf.length, off + size); break; }
        off += size;
      }
      if (start >= 0) {
        var seg = buf.subarray(start, end), text = '';
        for (var i = 0; i < seg.length; i += 8192) text += String.fromCharCode.apply(null, seg.subarray(i, i + 8192));
        var re = /[+-]\d{1,3}\.\d+[+-]\d{1,3}\.\d+(?:[+-]\d+(?:\.\d+)?)?/g, m;
        while ((m = re.exec(text))) {
          for (var j = 0; j < m[0].length; j++) { var ch = m[0].charCodeAt(j); if (ch >= 48 && ch <= 57) seg[m.index + j] = 48; }
        }
      }
      return new Blob([buf], { type: file.type || 'video/mp4' });
    });
  }

  function sniffMime(file) {
    if (file.type === 'video/quicktime' || /\.mov$/i.test(file.name)) return 'video/quicktime';
    return 'video/mp4';
  }

  function prepare(file, opts) {
    opts = opts || {};
    var progress = opts.onProgress || function () {};
    if (file.size > MAX_INPUT_BYTES) return Promise.reject(err('FILE_TOO_LARGE', 'That video is too large. Trim it on your phone and try again.'));

    return loadLib().then(function (MB) {
      var input = new MB.Input({ source: new MB.BlobSource(file), formats: MB.ALL_FORMATS });
      var ctx = {};
      return input.getPrimaryVideoTrack().then(function (vt) {
        if (!vt) throw err('NO_VIDEO', 'That file has no video in it.');
        ctx.vt = vt;
        return Promise.all([input.computeDuration(), vt.getCodec(), vt.getDisplayWidth(), vt.getDisplayHeight(),
          vt.canDecode(), vt.computePacketStats(90), vt.hasHighDynamicRange().catch(function () { return false; }),
          input.getPrimaryAudioTrack()]);
      }).then(function (r) {
        ctx.duration = r[0]; ctx.codec = r[1] || 'unknown'; ctx.w = r[2]; ctx.h = r[3];
        ctx.canDecode = r[4]; ctx.fps = r[5] && r[5].averagePacketRate; ctx.hdr = r[6]; ctx.audio = r[7];
        if (ctx.duration * 1000 > MAX_MS) throw err('VIDEO_TOO_LONG', 'Videos can be up to 60 seconds. Trim it on your phone and try again.');

        var tooBig = file.size > MAX_UPLOAD_BYTES;
        var tooWide = Math.max(ctx.w, ctx.h) > 1920;
        ctx.mustTranscode = ctx.codec !== 'avc' || tooBig || tooWide || ctx.hdr;
        if (!ctx.mustTranscode) return { mode: 'remux' };
        var t = targetSize(ctx.w, ctx.h);
        ctx.out = t;
        return Promise.all([
          ctx.canDecode,
          MB.canEncodeVideo('avc', { width: t.width, height: t.height, quality: new MB.Quality({ bitrate: VIDEO_BPS }) })
        ]).then(function (ok) { return { mode: ok[0] && ok[1] ? 'transcode' : 'unsupported' }; });
      }).then(function (plan) {
        if (plan.mode === 'unsupported') return fallbackOriginal(MB, file, ctx);
        return convert(MB, input, file, ctx, plan.mode, progress, opts.signal).catch(function (e) {
          if (e && e.code === 'CANCELED') throw e;
          // Remux of an H.264 file failed: the original is already playable everywhere.
          if (plan.mode === 'remux') return fallbackOriginal(MB, file, ctx);
          throw err('CONVERT_FAILED', 'This phone could not convert that video. Keep the screen on and try again, or set Camera, Formats to Most Compatible.');
        });
      });
    }, function () {
      // Library unavailable: keep the old path (scrub GPS, upload as-is) when it can still upload.
      if (file.size > MAX_UPLOAD_BYTES) throw err('FILE_TOO_LARGE', 'Videos can be up to 50 MB. Trim it on your phone and try again.');
      return scrubLocation(file).then(function (blob) {
        return { blob: blob, mime: sniffMime(file), codec: null, transcoded: false, audioDropped: false, needsPoster: true };
      });
    });
  }

  function fallbackOriginal(MB, file, ctx) {
    if (file.size > MAX_UPLOAD_BYTES) {
      throw err('CANNOT_CONVERT', 'This phone cannot shrink that video. Trim it under 50 MB, or set Camera, Formats to Most Compatible, and try again.');
    }
    return scrubLocation(file).then(function (blob) {
      var poster = ctx.canDecode ? posterFromTrack(MB, ctx.vt, ctx.w, ctx.h).catch(function () { return placeholderPoster(ctx.w, ctx.h); })
                                 : placeholderPoster(ctx.w, ctx.h);
      return poster.then(function (p) {
        return { blob: blob, mime: sniffMime(file), codec: ctx.codec, width: ctx.w, height: ctx.h,
                 duration_ms: Math.round(ctx.duration * 1000), poster: p, transcoded: false, audioDropped: false };
      });
    });
  }

  function convert(MB, input, file, ctx, mode, progress, signal) {
    var output = new MB.Output({ format: new MB.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new MB.BufferTarget() });
    var video = mode === 'transcode' ? {
      codec: 'avc',
      width: ctx.out.width, height: ctx.out.height, fit: 'contain',
      allowTransformationMetadata: false,          // bake rotation in: upright on every player
      frameRate: ctx.fps && ctx.fps > MAX_FPS + 1 ? MAX_FPS : undefined,
      quality: new MB.Quality({ bitrate: VIDEO_BPS }),
      keyFrameInterval: 2,
      forceTranscode: true
    } : {};
    if (mode === 'transcode' && ctx.hdr) {
      // HDR (iPhone HLG / Dolby Vision) -> SDR: drawing through a 2D canvas tone-maps into 8-bit sRGB.
      var c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(ctx.out.width, ctx.out.height) : Object.assign(document.createElement('canvas'), { width: ctx.out.width, height: ctx.out.height });
      var g = c.getContext('2d');
      video.process = function (sample) { g.clearRect(0, 0, c.width, c.height); sample.drawWithFit(g, { fit: 'contain' }); return c; };
      video.processedWidth = ctx.out.width; video.processedHeight = ctx.out.height;
    }
    // AAC sources are copied untouched; anything else is encoded to AAC where the browser can.
    var audio = { codec: 'aac' };

    return MB.Conversion.init({
      input: input, output: output,
      tags: {},                 // drop every metadata tag: GPS, device make/model, creation software
      video: video, audio: audio,
      tracks: 'primary',
      showWarnings: false
    }).then(function (conv) {
      if (!conv.isValid) throw err('CONVERT_INVALID', 'Cannot convert this file.');
      var audioDropped = !!ctx.audio && !conv.utilizedTracks.some(function (t) { return t.type === 'audio'; });
      var label = mode === 'transcode' ? 'Converting video' : 'Preparing video';
      conv.onProgress = function (p) { progress(Math.max(0, Math.min(1, p)), label); };
      if (signal) {
        if (signal.aborted) { conv.cancel(); throw err('CANCELED', 'Canceled'); }
        signal.addEventListener('abort', function () { conv.cancel(); }, { once: true });
      }
      progress(0, label);
      return conv.execute().then(function () {
        var blob = new Blob([output.target.buffer], { type: 'video/mp4' });
        if (blob.size > MAX_UPLOAD_BYTES) throw err('FILE_TOO_LARGE', 'That video is still over 50 MB after converting. Trim it and try again.');
        var size = mode === 'transcode' ? ctx.out : { width: ctx.w, height: ctx.h };
        return posterFromTrack(MB, ctx.vt, ctx.w, ctx.h).catch(function () { return placeholderPoster(size.width, size.height); }).then(function (poster) {
          return { blob: blob, mime: 'video/mp4', codec: 'avc', width: size.width, height: size.height,
                   duration_ms: Math.round(ctx.duration * 1000), poster: poster, transcoded: mode === 'transcode', audioDropped: audioDropped };
        });
      }, function (e) {
        if (e && (e.name === 'ConversionCanceledError' || (signal && signal.aborted))) throw err('CANCELED', 'Canceled');
        throw e;
      });
    });
  }

  // Can this browser play a stored clip? Used by the player to offer a fallback.
  function canPlay(codec) {
    if (!codec || codec === 'avc') return true;
    var v = document.createElement('video');
    var probe = { hevc: 'video/mp4; codecs="hvc1.1.6.L93.B0"', vp9: 'video/mp4; codecs="vp09.00.10.08"', av1: 'video/mp4; codecs="av01.0.04M.08"' }[codec];
    return probe ? v.canPlayType(probe) !== '' : true;
  }

  window.CWVideo = { prepare: prepare, canPlay: canPlay, scrubLocation: scrubLocation };
})();
