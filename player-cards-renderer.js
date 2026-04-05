/**
 * player-cards-renderer.js
 *
 * Renders Godspeed Vault trading cards inside the parent portal.
 * Players WITH custom art get full card treatment (3D flip, gloss, stats back).
 * Players WITHOUT art get a metallic steel shimmer placeholder card.
 *
 * Data: hardcoded roster with image paths + stats from card-preview.html.
 * Future: pull stats from Supabase player_game_stats / practice_grades.
 *
 * No emojis. No decorative icons. Text/SVG/CSS only.
 */
(function () {
  'use strict';

  /* ── Card Art Registry ───────────────────────────────────── */
  /* Only players with custom artwork get an image entry.       */

  var CARD_ART = {
    'Quest':  { image: 'src/assets/athletes/quest_scott_monster.png', lastname: 'Scott' },
    'Ashton': { image: 'src/assets/athletes/ashton_comic.jpg',        lastname: 'Bowman' },
    'A.D.':   { image: 'src/assets/athletes/ad_tuiono_99.png',        lastname: 'Tuiono' },
  };

  /* ── Full Roster ─────────────────────────────────────────── */

  var ROSTER = [
    { name: 'Quest',   jersey: 4,  pos: 'G',  stats: { PPG: '6.5', SPG: '4.0', APG: '5.0', GRD: '8.8' }, games: [{ opp: 'vs. Weeks', stat: '5 PTS, 3 STL' }, { opp: 'Dec 20 Tourney', stat: '8 PTS, 5 STL' }, { opp: 'Trend', stat: 'Rising' }] },
    { name: 'Ashton',  jersey: 2,  pos: 'SG', stats: { PPG: '3.0', STL: '1.0', REB: '1.0', GRD: '7.6' }, games: [{ opp: 'vs. Weeks', stat: '3 PTS, 100% FT' }, { opp: '@ Practice 5', stat: 'Defensive Anchor' }, { opp: 'Trend', stat: 'Steady Growth' }] },
    { name: 'Aiden',   jersey: 1,  pos: 'G'  },
    { name: 'Cassius', jersey: 3,  pos: 'G'  },
    { name: 'A.D.',    jersey: 99, pos: 'PF', stats: { PPG: '—', APG: '—', REB: '—', GRD: '—' }, games: [{ opp: 'vs. TBD', stat: '— PTS' }, { opp: '@ TBD', stat: '— PTS' }, { opp: 'Trend', stat: 'Rising' }] },
    { name: 'Howard',  jersey: 5,  pos: 'C'  },
    { name: 'Anton',   jersey: 12, pos: 'PG' },
    { name: 'Emory',   jersey: 7,  pos: 'SF' },
    { name: 'Junior',  jersey: 9,  pos: 'G'  },
    { name: 'Kyrie',   jersey: 10, pos: 'G'  },
    { name: 'Oliver',  jersey: 11, pos: 'SF' },
    { name: 'Khaliq',  jersey: 12, pos: 'PF' },
  ];

  /* ── Inject Styles (once) ────────────────────────────────── */

  function injectStyles() {
    if (document.getElementById('gs-vault-styles')) return;
    var s = document.createElement('style');
    s.id = 'gs-vault-styles';
    s.textContent = [
      '@keyframes gs-vault-shine{0%{transform:translateX(-150%) skewX(-15deg)}50%{transform:translateX(150%) skewX(-15deg)}100%{transform:translateX(150%) skewX(-15deg)}}',
      '@keyframes gs-vault-shimmer{0%{background-position:-400px 0}100%{background-position:400px 0}}',
      '@keyframes gs-vault-pulse{0%{opacity:0.4}50%{opacity:0.7}100%{opacity:0.4}}',
      '@keyframes gs-vault-fadein{0%{opacity:0;transform:translateY(16px)}100%{opacity:1;transform:translateY(0)}}',
      '.gs-card-wrap{perspective:1000px;cursor:pointer;width:240px;height:340px;flex-shrink:0;}',
      '.gs-card-inner{position:relative;width:100%;height:100%;transition:transform 0.7s;transform-style:preserve-3d;}',
      '.gs-card-wrap.is-flipped .gs-card-inner{transform:rotateY(180deg);}',
      '.gs-card-face{position:absolute;inset:0;width:100%;height:100%;backface-visibility:hidden;border-radius:14px;overflow:hidden;}',
      '.gs-card-back{transform:rotateY(180deg);}',
      '.gs-card-gloss{position:absolute;inset:0;background:linear-gradient(to right,transparent,rgba(255,255,255,0.2),transparent);width:200%;transform:translateX(-150%) skewX(-12deg);animation:gs-vault-shine 3s infinite linear;pointer-events:none;z-index:20;}',
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ── Card with Art (full trading card) ───────────────────── */

  function artCard(player, art, idx) {
    var id = 'gs-vc-' + idx;
    var statsArr = player.stats ? Object.keys(player.stats) : [];
    var gamesArr = player.games || [];

    var front =
      '<div class="gs-card-face" style="background:#000;border:1px solid rgba(255,255,255,0.15);">' +
        '<img src="' + art.image + '" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:top;opacity:1;transition:transform 0.5s;z-index:0;" />' +
        '<div style="position:absolute;inset-x:0;bottom:0;height:66%;background:linear-gradient(to top,#000,rgba(0,0,0,0.8),transparent);z-index:1;"></div>' +
        '<div style="position:relative;z-index:10;display:flex;flex-direction:column;height:100%;padding:12px;">' +
          // Top bar
          '<div style="display:flex;justify-content:space-between;align-items:flex-start;">' +
            '<div style="background:rgba(0,0,0,0.5);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.15);border-radius:8px;padding:4px 10px;">' +
              '<div style="font-size:7px;font-weight:900;letter-spacing:0.25em;color:#4cc9f0;text-transform:uppercase;">Godspeed</div>' +
              '<div style="font-size:8px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:0.1em;">Mythic</div>' +
            '</div>' +
            '<div style="font-size:3rem;font-weight:900;font-style:italic;color:transparent;background:linear-gradient(to bottom,#fff,#999);-webkit-background-clip:text;background-clip:text;line-height:1;-webkit-text-stroke:1px rgba(255,255,255,0.2);">' + player.jersey + '</div>' +
          '</div>' +
          // Bottom name
          '<div style="margin-top:auto;">' +
            '<div style="font-size:1.6rem;font-weight:900;color:#fff;text-transform:uppercase;letter-spacing:-0.03em;line-height:0.9;font-style:italic;transform:skewX(-6deg);">' +
              player.name + '<br>' +
              '<span style="color:transparent;background:linear-gradient(to right,#4cc9f0,#f72585);-webkit-background-clip:text;background-clip:text;">' + (art.lastname || '') + '</span>' +
            '</div>' +
            '<div style="text-align:center;margin-top:10px;">' +
              '<span style="font-size:7px;font-weight:700;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.15em;border:1px solid rgba(255,255,255,0.1);padding:3px 12px;border-radius:20px;">Flip for Stats</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="gs-card-gloss"></div>' +
        '<div style="position:absolute;inset:0;border:2px solid rgba(255,255,255,0.12);border-radius:14px;pointer-events:none;z-index:30;"></div>' +
      '</div>';

    // Back
    var back =
      '<div class="gs-card-face gs-card-back" style="background:#0a0a0a;border:1px solid rgba(255,255,255,0.15);padding:16px;display:flex;flex-direction:column;">' +
        '<div style="position:absolute;inset:0;background:linear-gradient(135deg,#0a0a0a,#111);z-index:0;"></div>' +
        '<div style="position:relative;z-index:1;display:flex;flex-direction:column;height:100%;">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:10px;margin-bottom:12px;">' +
            '<div style="font-size:0.9rem;font-weight:900;color:#fff;font-style:italic;text-transform:uppercase;">Season Stats</div>' +
            '<div style="font-size:0.6rem;font-weight:700;color:#4cc9f0;letter-spacing:0.15em;">2025-26</div>' +
          '</div>';

    if (statsArr.length > 0) {
      back += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">';
      statsArr.forEach(function (key) {
        back += '<div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:10px 6px;text-align:center;">' +
          '<div style="font-size:1.4rem;font-weight:900;color:#fff;">' + player.stats[key] + '</div>' +
          '<div style="font-size:7px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.15em;font-weight:700;">' + key + '</div>' +
        '</div>';
      });
      back += '</div>';
    }

    if (gamesArr.length > 0) {
      back += '<div style="font-size:8px;color:rgba(255,255,255,0.35);text-transform:uppercase;font-weight:700;letter-spacing:0.1em;margin-bottom:6px;">Recent</div>' +
        '<div style="display:flex;flex-direction:column;gap:4px;">';
      gamesArr.forEach(function (g) {
        back += '<div style="display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.04);padding:6px 8px;border-radius:6px;font-size:0.7rem;">' +
          '<span style="color:rgba(255,255,255,0.5);">' + g.opp + '</span>' +
          '<span style="color:#fff;font-weight:700;">' + g.stat + '</span>' +
        '</div>';
      });
      back += '</div>';
    }

    back += '</div></div>';

    return '<div class="gs-card-wrap" style="animation:gs-vault-fadein 0.4s ease-out ' + (idx * 0.08) + 's both;" onclick="this.classList.toggle(\'is-flipped\')">' +
      '<div class="gs-card-inner">' + front + back + '</div></div>';
  }

  /* ── Steel Shimmer Card (no-art placeholder) ─────────────── */

  function steelCard(player, idx) {
    return '<div class="gs-card-wrap" style="animation:gs-vault-fadein 0.4s ease-out ' + (idx * 0.08) + 's both;cursor:default;">' +
      '<div style="position:relative;width:100%;height:100%;border-radius:14px;overflow:hidden;' +
        'background:linear-gradient(135deg,#2a2d33 0%,#3e434d 25%,#6b7280 50%,#3e434d 75%,#2a2d33 100%);' +
        'box-shadow:0 8px 32px rgba(0,0,0,0.4),inset 0 1px 0 rgba(255,255,255,0.1);' +
        'border:1px solid rgba(255,255,255,0.08);">' +

        // Shimmer sweep
        '<div style="position:absolute;inset:0;pointer-events:none;' +
          'background:linear-gradient(90deg,transparent 0%,rgba(255,255,255,0.04) 35%,rgba(255,255,255,0.12) 50%,rgba(255,255,255,0.04) 65%,transparent 100%);' +
          'background-size:800px 100%;animation:gs-vault-shimmer 3.5s ease-in-out infinite;"></div>' +

        // Brushed metal texture
        '<div style="position:absolute;inset:0;pointer-events:none;opacity:0.03;' +
          'background:repeating-linear-gradient(90deg,#fff 0px,transparent 1px,transparent 3px);"></div>' +

        '<div style="position:relative;z-index:1;display:flex;flex-direction:column;height:100%;padding:16px;justify-content:space-between;">' +

          // Top: Godspeed badge + jersey
          '<div style="display:flex;justify-content:space-between;align-items:flex-start;">' +
            '<div style="background:rgba(0,0,0,0.3);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:4px 10px;">' +
              '<div style="font-size:7px;font-weight:900;letter-spacing:0.25em;color:rgba(255,255,255,0.3);text-transform:uppercase;">Godspeed</div>' +
              '<div style="font-size:8px;font-weight:700;color:rgba(255,255,255,0.25);text-transform:uppercase;letter-spacing:0.1em;">Unrevealed</div>' +
            '</div>' +
            '<div style="font-size:2.8rem;font-weight:900;font-style:italic;color:rgba(255,255,255,0.08);line-height:1;">' + player.jersey + '</div>' +
          '</div>' +

          // Center: silhouette placeholder
          '<div style="flex:1;display:flex;align-items:center;justify-content:center;">' +
            '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" style="opacity:0.1;">' +
              '<circle cx="12" cy="8" r="4" fill="rgba(255,255,255,0.5)"/>' +
              '<path d="M4 20c0-4 4-7 8-7s8 3 8 7" fill="rgba(255,255,255,0.3)"/>' +
            '</svg>' +
          '</div>' +

          // Bottom: name + position
          '<div>' +
            '<div style="font-size:1.5rem;font-weight:900;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:-0.02em;line-height:1;font-style:italic;transform:skewX(-6deg);">' +
              player.name +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:8px;margin-top:8px;">' +
              '<span style="font-size:7px;font-weight:700;color:rgba(255,255,255,0.25);text-transform:uppercase;letter-spacing:0.1em;border:1px solid rgba(255,255,255,0.08);padding:3px 10px;border-radius:20px;">' + player.pos + '</span>' +
              '<span style="font-size:7px;font-weight:600;color:rgba(255,255,255,0.15);letter-spacing:0.06em;">CARD COMING SOON</span>' +
            '</div>' +
          '</div>' +

        '</div>' +

        // Inner border
        '<div style="position:absolute;inset:0;border:2px solid rgba(255,255,255,0.05);border-radius:14px;pointer-events:none;z-index:30;"></div>' +
      '</div></div>';
  }

  /* ── Render All Cards ────────────────────────────────────── */

  function renderPlayerCards() {
    var root = document.getElementById('player-cards-root');
    var cta = document.getElementById('player-cards-cta');
    if (!root) return;

    injectStyles();

    var html = '';
    ROSTER.forEach(function (player, idx) {
      var art = CARD_ART[player.name];
      if (art) {
        html += artCard(player, art, idx);
      } else {
        html += steelCard(player, idx);
      }
    });
    root.innerHTML = html;
    if (cta) cta.style.display = 'block';
  }

  /* ── Init ────────────────────────────────────────────────── */

  window.renderPlayerCards = renderPlayerCards;

  // Hook into portal view switcher
  var origSwitch = window.switchPortalView;
  if (origSwitch) {
    window.switchPortalView = function (viewName, linkElement) {
      origSwitch.call(this, viewName, linkElement);
      if (viewName === 'player-cards') renderPlayerCards();
    };
  }
})();
