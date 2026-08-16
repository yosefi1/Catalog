/**
 * Self-contained offline HTML catalog generator.
 * No CDN, no fetch(), works from file:// after ZIP extract.
 */

export interface ExportDevicePhotoRef {
  photoType: string;
  label: string;
  /** Relative path from index.html, e.g. images/EQ-0001/main.jpg */
  path: string;
}

export interface ExportDeviceRecord {
  inventoryId: string;
  deviceName: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  assetTag: string;
  deviceType: string;
  location: string;
  room: string;
  area: string;
  owner: string;
  notes: string;
  createdAt: number;
  updatedAt: number;
  photos: ExportDevicePhotoRef[];
  thumbPath: string | null;
}

export interface ExportCatalogData {
  title: string;
  exportedAt: string;
  devices: ExportDeviceRecord[];
}

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildCatalogHtml(data: ExportCatalogData): string {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light" />
<title>${escapeHtml(data.title)}</title>
<style>
:root {
  --bg: #f3f5f7;
  --surface: #ffffff;
  --ink: #15202b;
  --muted: #5b6b7a;
  --line: #d7dee5;
  --accent: #0d6e6e;
  --accent-soft: #e6f3f3;
  --shadow: 0 1px 2px rgba(21,32,43,.06), 0 8px 24px rgba(21,32,43,.06);
  --radius: 12px;
  --mono: "Cascadia Mono", "Segoe UI Mono", Consolas, monospace;
  --sans: "Segoe UI", system-ui, -apple-system, sans-serif;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: var(--sans);
  color: var(--ink);
  background:
    radial-gradient(1200px 500px at 10% -10%, #dceeee 0%, transparent 55%),
    radial-gradient(900px 400px at 100% 0%, #e8eef4 0%, transparent 50%),
    var(--bg);
  min-height: 100vh;
}
button, input, select { font: inherit; }
.app { max-width: 1180px; margin: 0 auto; padding: 20px 16px 64px; }
.header {
  display: flex; flex-wrap: wrap; gap: 16px;
  align-items: flex-end; justify-content: space-between;
  margin-bottom: 18px;
}
.brand h1 {
  margin: 0; font-size: clamp(1.6rem, 3vw, 2.1rem); letter-spacing: -0.02em;
}
.brand p { margin: 6px 0 0; color: var(--muted); font-size: .95rem; }
.stats {
  display: grid; grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px; margin-bottom: 16px;
}
.stat {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--radius); padding: 12px 14px; box-shadow: var(--shadow);
}
.stat .n { font-size: 1.35rem; font-weight: 700; color: var(--accent); }
.stat .l { color: var(--muted); font-size: .82rem; margin-top: 2px; }
.toolbar {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--radius); padding: 12px; box-shadow: var(--shadow);
  display: grid; gap: 10px; margin-bottom: 14px;
  position: sticky; top: 0; z-index: 20;
}
.search {
  width: 100%; padding: 12px 14px; border: 1px solid var(--line);
  border-radius: 10px; background: #fafbfc;
}
.search:focus { outline: 2px solid color-mix(in srgb, var(--accent) 35%, white); border-color: var(--accent); }
.filters {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px;
}
.filters select, .filters .sortwrap select {
  width: 100%; padding: 10px 12px; border-radius: 10px;
  border: 1px solid var(--line); background: #fff;
}
.meta-row {
  display: flex; flex-wrap: wrap; gap: 10px; align-items: center;
  justify-content: space-between; color: var(--muted); font-size: .9rem;
}
.list {
  display: flex; flex-direction: column; gap: 8px;
}
.row {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: 10px; overflow: hidden; box-shadow: var(--shadow);
}
.row-main {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr) auto;
  gap: 12px; align-items: center;
  padding: 10px 12px; cursor: pointer; width: 100%;
  border: 0; background: transparent; text-align: left; color: inherit;
}
.row-main:hover { background: #f7fafb; }
.thumb {
  width: 56px; height: 56px; border-radius: 8px; object-fit: cover;
  background: #e8eef2; border: 1px solid var(--line);
}
.thumb.placeholder {
  display: grid; place-items: center; color: var(--muted); font-size: .7rem;
}
.row-body { min-width: 0; }
.row-title {
  display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline;
  font-weight: 650;
}
.inv {
  font-family: var(--mono); color: var(--accent); font-size: .92rem;
}
.name { font-size: 1rem; }
.row-sub {
  margin-top: 3px; color: var(--muted); font-size: .86rem;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.chev {
  color: var(--muted); transition: transform .18s ease; font-size: 1.1rem;
}
.row.open .chev { transform: rotate(90deg); }
.details {
  display: none; border-top: 1px solid var(--line);
  padding: 14px 14px 16px; background: #fbfcfd;
}
.row.open .details { display: block; }
.detail-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px 16px; margin-bottom: 12px;
}
.field .k { display: block; color: var(--muted); font-size: .75rem; text-transform: uppercase; letter-spacing: .04em; }
.field .v { font-size: .95rem; margin-top: 2px; word-break: break-word; }
.field.serial .v { font-family: var(--mono); font-weight: 650; font-size: 1.05rem; }
.notes {
  background: #fff; border: 1px solid var(--line); border-radius: 8px;
  padding: 10px 12px; margin-bottom: 12px; white-space: pre-wrap;
}
.gallery {
  display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px;
}
.gal-item {
  width: 96px; border: 0; padding: 0; background: transparent; cursor: pointer;
  text-align: left;
}
.gal-item img {
  width: 96px; height: 72px; object-fit: cover; border-radius: 8px;
  border: 1px solid var(--line); display: block;
}
.gal-item span {
  display: block; font-size: .72rem; color: var(--muted); margin-top: 4px;
}
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
.btn {
  border: 1px solid var(--line); background: #fff; color: var(--ink);
  border-radius: 999px; padding: 10px 14px; cursor: pointer; font-weight: 600;
}
.btn.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
.btn:hover { filter: brightness(0.98); }
.empty {
  text-align: center; padding: 48px 16px; color: var(--muted);
  background: var(--surface); border: 1px dashed var(--line); border-radius: var(--radius);
}
.modal-backdrop, .lb-backdrop {
  position: fixed; inset: 0; background: rgba(10, 18, 24, .55);
  display: none; align-items: center; justify-content: center; z-index: 50;
  padding: 16px;
}
.modal-backdrop.open, .lb-backdrop.open { display: flex; }
.modal {
  width: min(920px, 100%); max-height: min(92vh, 960px);
  overflow: auto; background: var(--surface); border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0,0,0,.28); padding: 18px;
}
.modal-head {
  display: flex; justify-content: space-between; gap: 12px; align-items: flex-start;
  margin-bottom: 12px;
}
.modal-head h2 { margin: 0; font-size: 1.35rem; }
.modal-main-photo {
  width: 100%; max-height: 360px; object-fit: contain; background: #111;
  border-radius: 12px; margin-bottom: 12px;
}
.lb {
  position: relative; width: min(1100px, 100%); height: min(90vh, 900px);
  display: flex; align-items: center; justify-content: center;
}
.lb img {
  max-width: 100%; max-height: 100%; object-fit: contain;
  background: #000; border-radius: 8px;
}
.lb-nav, .lb-close {
  position: absolute; border: 0; background: rgba(255,255,255,.92);
  width: 44px; height: 44px; border-radius: 999px; cursor: pointer; font-size: 1.2rem;
  font-weight: 700;
}
.lb-close { top: -6px; right: -6px; }
.lb-prev { left: 8px; }
.lb-next { right: 8px; }
@media (max-width: 700px) {
  .stats { grid-template-columns: repeat(2, 1fr); }
  .row-main { grid-template-columns: 48px minmax(0,1fr) auto; }
  .thumb { width: 48px; height: 48px; }
}
</style>
</head>
<body>
<div class="app">
  <header class="header">
    <div class="brand">
      <h1>Equipment Inventory</h1>
      <p id="exportedAt"></p>
    </div>
  </header>
  <section class="stats" id="stats"></section>
  <section class="toolbar">
    <input class="search" id="search" type="search" placeholder="Search inventory ID, serial, name, manufacturer, location…" autocomplete="off" />
    <div class="filters">
      <select id="fLocation"><option value="">All locations</option></select>
      <select id="fManufacturer"><option value="">All manufacturers</option></select>
      <select id="fType"><option value="">All device types</option></select>
      <select id="fRoom"><option value="">All rooms</option></select>
      <select id="sortBy">
        <option value="inventoryId">Sort: Inventory ID</option>
        <option value="deviceName">Sort: Device Name</option>
        <option value="manufacturer">Sort: Manufacturer</option>
        <option value="model">Sort: Model</option>
        <option value="serialNumber">Sort: Serial</option>
        <option value="createdAt">Sort: Date Added</option>
        <option value="updatedAt">Sort: Last Modified</option>
      </select>
      <select id="sortDir">
        <option value="asc">Ascending</option>
        <option value="desc">Descending</option>
      </select>
    </div>
    <div class="meta-row">
      <span id="resultCount"></span>
      <span>Offline catalog · works without internet</span>
    </div>
  </section>
  <section class="list" id="list"></section>
</div>

<div class="modal-backdrop" id="modalBackdrop" role="dialog" aria-modal="true">
  <div class="modal" id="modal"></div>
</div>

<div class="lb-backdrop" id="lbBackdrop">
  <div class="lb">
    <button class="lb-close" id="lbClose" type="button" aria-label="Close">×</button>
    <button class="lb-nav lb-prev" id="lbPrev" type="button" aria-label="Previous">‹</button>
    <img id="lbImg" alt="" />
    <button class="lb-nav lb-next" id="lbNext" type="button" aria-label="Next">›</button>
  </div>
</div>

<script type="application/json" id="inventory-data">${json}</script>
<script>
(function () {
  "use strict";
  var DATA = JSON.parse(document.getElementById("inventory-data").textContent);
  var devices = DATA.devices || [];
  var openId = null;
  var lbPhotos = [];
  var lbIndex = 0;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fmtDate(ts) {
    try { return new Date(ts).toLocaleString(); } catch (e) { return ""; }
  }

  function unique(field) {
    var set = {};
    devices.forEach(function (d) {
      var v = (d[field] || "").trim();
      if (v) set[v] = true;
    });
    return Object.keys(set).sort(function (a, b) {
      return a.localeCompare(b);
    });
  }

  function fillSelect(id, values, allLabel) {
    var el = document.getElementById(id);
    values.forEach(function (v) {
      var o = document.createElement("option");
      o.value = v; o.textContent = v;
      el.appendChild(o);
    });
  }

  function matches(d, q) {
    if (!q) return true;
    q = q.toLowerCase();
    var hay = [
      d.inventoryId, d.deviceName, d.manufacturer, d.model,
      d.serialNumber, d.assetTag, d.location, d.room, d.notes
    ].join(" ").toLowerCase();
    return hay.indexOf(q) !== -1;
  }

  function filtered() {
    var q = document.getElementById("search").value.trim();
    var loc = document.getElementById("fLocation").value;
    var man = document.getElementById("fManufacturer").value;
    var typ = document.getElementById("fType").value;
    var room = document.getElementById("fRoom").value;
    var sortBy = document.getElementById("sortBy").value;
    var sortDir = document.getElementById("sortDir").value;
    var list = devices.filter(function (d) {
      if (loc && d.location !== loc) return false;
      if (man && d.manufacturer !== man) return false;
      if (typ && d.deviceType !== typ) return false;
      if (room && d.room !== room) return false;
      return matches(d, q);
    });
    list.sort(function (a, b) {
      var av = a[sortBy], bv = b[sortBy];
      var cmp;
      if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else cmp = String(av || "").localeCompare(String(bv || ""), undefined, { numeric: true, sensitivity: "base" });
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }

  function thumbHtml(d) {
    if (d.thumbPath) {
      return '<img class="thumb" src="' + esc(d.thumbPath) + '" alt="" loading="lazy" />';
    }
    return '<div class="thumb placeholder">No photo</div>';
  }

  function fieldsHtml(d) {
    var fields = [
      ["Manufacturer", d.manufacturer],
      ["Model", d.model],
      ["Serial", d.serialNumber, "serial"],
      ["Asset Tag", d.assetTag],
      ["Device Type", d.deviceType],
      ["Location", d.location],
      ["Room", d.room],
      ["Area / Bench / Rack", d.area],
      ["Owner / Team", d.owner],
      ["Date Added", fmtDate(d.createdAt)]
    ];
    return fields.map(function (f) {
      return '<div class="field ' + (f[2] || "") + '"><span class="k">' + esc(f[0]) + '</span><div class="v">' + esc(f[1] || "—") + '</div></div>';
    }).join("");
  }

  function galleryHtml(d) {
    if (!d.photos || !d.photos.length) return '<p style="color:var(--muted)">No photos</p>';
    return '<div class="gallery">' + d.photos.map(function (p, i) {
      return '<button class="gal-item" type="button" data-inv="' + esc(d.inventoryId) + '" data-idx="' + i + '">' +
        '<img src="' + esc(p.path) + '" alt="' + esc(p.label) + '" loading="lazy" />' +
        '<span>' + esc(p.label) + '</span></button>';
    }).join("") + '</div>';
  }

  function renderStats() {
    var locs = unique("location").length;
    var mans = unique("manufacturer").length;
    var cats = unique("deviceType").length;
    document.getElementById("stats").innerHTML =
      '<div class="stat"><div class="n">' + devices.length + '</div><div class="l">Total Devices</div></div>' +
      '<div class="stat"><div class="n">' + locs + '</div><div class="l">Locations</div></div>' +
      '<div class="stat"><div class="n">' + mans + '</div><div class="l">Manufacturers</div></div>' +
      '<div class="stat"><div class="n">' + cats + '</div><div class="l">Categories</div></div>';
    document.getElementById("exportedAt").textContent =
      "Exported " + (DATA.exportedAt ? new Date(DATA.exportedAt).toLocaleString() : "") +
      " · " + devices.length + " devices";
  }

  function render() {
    var list = filtered();
    document.getElementById("resultCount").textContent = list.length + " shown";
    var root = document.getElementById("list");
    if (!list.length) {
      root.innerHTML = '<div class="empty">No devices match your search/filters.</div>';
      return;
    }
    root.innerHTML = list.map(function (d) {
      var isOpen = openId === d.inventoryId;
      var sub = [d.manufacturer, d.model, d.serialNumber, d.location].filter(Boolean).join(" · ");
      return '<article class="row' + (isOpen ? " open" : "") + '" data-id="' + esc(d.inventoryId) + '">' +
        '<button class="row-main" type="button" data-toggle="' + esc(d.inventoryId) + '">' +
          thumbHtml(d) +
          '<div class="row-body"><div class="row-title"><span class="inv">' + esc(d.inventoryId) + '</span>' +
          '<span class="name">' + esc(d.deviceName || "Untitled") + '</span></div>' +
          '<div class="row-sub">' + esc(sub) + '</div></div>' +
          '<span class="chev">›</span></button>' +
        '<div class="details">' +
          '<div class="detail-grid">' + fieldsHtml(d) + '</div>' +
          (d.notes ? '<div class="notes"><strong>Notes</strong><div>' + esc(d.notes) + '</div></div>' : '') +
          '<div style="margin-bottom:8px;font-weight:650">Photos</div>' +
          galleryHtml(d) +
          '<div class="actions"><button class="btn primary" type="button" data-open-modal="' + esc(d.inventoryId) + '">Open Device View</button></div>' +
        '</div></article>';
    }).join("");
  }

  function findDevice(id) {
    for (var i = 0; i < devices.length; i++) if (devices[i].inventoryId === id) return devices[i];
    return null;
  }

  function openModal(id) {
    var d = findDevice(id);
    if (!d) return;
    var main = (d.photos || []).find(function (p) { return p.photoType === "main"; }) || (d.photos || [])[0];
    var html =
      '<div class="modal-head"><div><div class="inv">' + esc(d.inventoryId) + '</div>' +
      '<h2>' + esc(d.deviceName || "Untitled") + '</h2></div>' +
      '<button class="btn" type="button" id="modalClose">Close</button></div>' +
      (main ? '<img class="modal-main-photo" src="' + esc(main.path) + '" alt="" />' : '') +
      '<div class="detail-grid">' + fieldsHtml(d) + '</div>' +
      (d.notes ? '<div class="notes"><strong>Notes</strong><div>' + esc(d.notes) + '</div></div>' : '') +
      '<div style="margin-bottom:8px;font-weight:650">Photos</div>' + galleryHtml(d);
    document.getElementById("modal").innerHTML = html;
    document.getElementById("modalBackdrop").classList.add("open");
    document.getElementById("modalClose").onclick = closeModal;
  }

  function closeModal() {
    document.getElementById("modalBackdrop").classList.remove("open");
  }

  function openLightbox(inv, idx) {
    var d = findDevice(inv);
    if (!d || !d.photos || !d.photos.length) return;
    lbPhotos = d.photos;
    lbIndex = idx || 0;
    showLb();
  }

  function showLb() {
    var p = lbPhotos[lbIndex];
    if (!p) return;
    document.getElementById("lbImg").src = p.path;
    document.getElementById("lbImg").alt = p.label || "";
    document.getElementById("lbBackdrop").classList.add("open");
  }

  function closeLb() {
    document.getElementById("lbBackdrop").classList.remove("open");
  }

  function nextLb(delta) {
    if (!lbPhotos.length) return;
    lbIndex = (lbIndex + delta + lbPhotos.length) % lbPhotos.length;
    showLb();
  }

  document.getElementById("list").addEventListener("click", function (e) {
    var t = e.target;
    var toggle = t.closest("[data-toggle]");
    if (toggle) {
      var id = toggle.getAttribute("data-toggle");
      openId = openId === id ? null : id;
      render();
      return;
    }
    var modalBtn = t.closest("[data-open-modal]");
    if (modalBtn) {
      openModal(modalBtn.getAttribute("data-open-modal"));
      return;
    }
    var gal = t.closest(".gal-item");
    if (gal) {
      openLightbox(gal.getAttribute("data-inv"), Number(gal.getAttribute("data-idx")));
    }
  });

  document.getElementById("modalBackdrop").addEventListener("click", function (e) {
    var gal = e.target.closest(".gal-item");
    if (gal) {
      openLightbox(gal.getAttribute("data-inv"), Number(gal.getAttribute("data-idx")));
      return;
    }
    if (e.target === document.getElementById("modalBackdrop")) closeModal();
  });

  document.getElementById("lbClose").onclick = closeLb;
  document.getElementById("lbPrev").onclick = function () { nextLb(-1); };
  document.getElementById("lbNext").onclick = function () { nextLb(1); };
  document.getElementById("lbBackdrop").addEventListener("click", function (e) {
    if (e.target === document.getElementById("lbBackdrop")) closeLb();
  });

  document.addEventListener("keydown", function (e) {
    if (document.getElementById("lbBackdrop").classList.contains("open")) {
      if (e.key === "Escape") closeLb();
      if (e.key === "ArrowLeft") nextLb(-1);
      if (e.key === "ArrowRight") nextLb(1);
      return;
    }
    if (document.getElementById("modalBackdrop").classList.contains("open") && e.key === "Escape") {
      closeModal();
    }
  });

  ["search", "fLocation", "fManufacturer", "fType", "fRoom", "sortBy", "sortDir"].forEach(function (id) {
    document.getElementById(id).addEventListener("input", render);
    document.getElementById(id).addEventListener("change", render);
  });

  fillSelect("fLocation", unique("location"));
  fillSelect("fManufacturer", unique("manufacturer"));
  fillSelect("fType", unique("deviceType"));
  fillSelect("fRoom", unique("room"));
  renderStats();
  render();
})();
</script>
</body>
</html>`;
}
