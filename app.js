const fileInput = document.getElementById("fileInput");
const fileButton = document.getElementById("fileButton");
const fileName = document.getElementById("fileName");
const statusText = document.getElementById("statusText");
const searchInput = document.getElementById("searchInput");
const groupFilter = document.getElementById("groupFilter");
const sortSelect = document.getElementById("sortSelect");
const channelList = document.getElementById("channelList");
const countText = document.getElementById("countText");
const playerTitle = document.getElementById("playerTitle");
const playerGroup = document.getElementById("playerGroup");
const playerUrl = document.getElementById("playerUrl");
const video = document.getElementById("video");
const placeholder = document.getElementById("placeholder");
const openButton = document.getElementById("openButton");
const copyButton = document.getElementById("copyButton");

let allItems = [];
let filteredItems = [];
let activeId = null;

function updateStatus(text) {
  statusText.textContent = text;
}

function isLikelyHls(url) {
  if (!url) {
    return false;
  }
  const lower = url.toLowerCase();
  return lower.includes(".m3u8") || lower.includes(".m3u");
}

function canPlayNativeHls() {
  return video.canPlayType("application/vnd.apple.mpegurl") !== "";
}

function splitExtinf(line) {
  let inQuote = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      inQuote = !inQuote;
      continue;
    }
    if (ch === ',' && !inQuote) {
      return {
        meta: line.slice(0, i),
        title: line.slice(i + 1).trim(),
      };
    }
  }
  return { meta: line, title: "" };
}

function parseAttributes(meta) {
  const attrs = {};
  const regex = /([a-zA-Z0-9-]+)="([^"]*)"/g;
  let match;
  while ((match = regex.exec(meta))) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

function parseM3U(text) {
  const lines = text.split(/\r?\n/);
  const items = [];
  let current = null;

  for (const lineRaw of lines) {
    const line = lineRaw.trim();
    if (!line) {
      continue;
    }
    if (line.startsWith("#EXTM3U")) {
      continue;
    }
    if (line.startsWith("#EXTINF")) {
      const { meta, title } = splitExtinf(line);
      const attrs = parseAttributes(meta);
      current = {
        id: `${items.length}-${Math.random().toString(16).slice(2)}`,
        name: title || attrs["tvg-name"] || "Unbenannt",
        group: attrs["group-title"] || "Ohne Kategorie",
        logo: attrs["tvg-logo"] || "",
        raw: line,
        url: "",
      };
      continue;
    }
    if (!line.startsWith("#") && current) {
      current.url = line;
      items.push(current);
      current = null;
    }
  }

  return items;
}

function applyFilters() {
  const term = searchInput.value.trim().toLowerCase();
  const group = groupFilter.value;

  filteredItems = allItems.filter((item) => {
    const matchesGroup = !group || item.group === group;
    const haystack = `${item.name} ${item.group}`.toLowerCase();
    const matchesSearch = !term || haystack.includes(term);
    return matchesGroup && matchesSearch;
  });

  const sortMode = sortSelect.value;
  filteredItems.sort((a, b) => {
    if (sortMode === "name-desc") {
      return b.name.localeCompare(a.name, "de");
    }
    if (sortMode === "group-asc") {
      const groupCompare = a.group.localeCompare(b.group, "de");
      return groupCompare !== 0 ? groupCompare : a.name.localeCompare(b.name, "de");
    }
    return a.name.localeCompare(b.name, "de");
  });

  renderList();
}

function renderList() {
  channelList.innerHTML = "";
  countText.textContent = `${filteredItems.length} Einträge`;

  if (filteredItems.length === 0) {
    const empty = document.createElement("div");
    empty.className = "meta";
    empty.textContent = "Keine Treffer. Passe die Suche oder Kategorie an.";
    channelList.appendChild(empty);
    return;
  }

  filteredItems.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "channel-item" + (item.id === activeId ? " active" : "");

    const logo = document.createElement("div");
    logo.className = "channel-logo";
    if (item.logo) {
      const img = document.createElement("img");
      img.src = item.logo;
      img.alt = item.name;
      logo.appendChild(img);
    } else {
      logo.textContent = item.name.slice(0, 2).toUpperCase();
    }

    const info = document.createElement("div");
    info.className = "channel-info";

    const name = document.createElement("div");
    name.className = "channel-name";
    name.textContent = item.name;

    const group = document.createElement("div");
    group.className = "channel-group";
    group.textContent = item.group;

    info.appendChild(name);
    info.appendChild(group);

    button.appendChild(logo);
    button.appendChild(info);

    button.addEventListener("click", () => selectItem(item));

    channelList.appendChild(button);
  });
}

function setPlayerState(enabled) {
  openButton.disabled = !enabled;
  copyButton.disabled = !enabled;
}

function selectItem(item) {
  activeId = item.id;
  playerTitle.textContent = item.name;
  playerGroup.textContent = item.group;
  playerUrl.textContent = item.url;
  placeholder.style.display = "none";
  setPlayerState(true);
  updateStatus("Lade Stream...");

  if (video.hls) {
    video.hls.destroy();
    video.hls = null;
  }

  const isHls = isLikelyHls(item.url);
  let readyToPlay = true;

  if (isHls) {
    if (window.Hls && window.Hls.isSupported()) {
      const hls = new window.Hls({
        lowLatencyMode: true,
      });
      hls.on(window.Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          updateStatus("Stream Fehler (CORS/HTTP blockiert).");
        }
      });
      hls.loadSource(item.url);
      hls.attachMedia(video);
      video.hls = hls;
    } else if (canPlayNativeHls()) {
      video.src = item.url;
    } else {
      updateStatus("HLS wird nicht unterstützt. Bitte hls.js laden oder Safari nutzen.");
      readyToPlay = false;
    }
  } else {
    video.src = item.url;
  }

  if (location.protocol === "https:" && item.url.startsWith("http://")) {
    updateStatus("HTTP-Stream blockiert im HTTPS-Kontext.");
  }

  if (readyToPlay) {
    video.play().catch(() => {
      // Autoplay can be blocked; user can press play manually.
    });
  }

  renderList();
}

function populateGroups(items) {
  const groups = Array.from(new Set(items.map((item) => item.group))).sort((a, b) =>
    a.localeCompare(b, "de")
  );

  groupFilter.innerHTML = '<option value="">Alle Kategorien</option>';
  for (const group of groups) {
    const option = document.createElement("option");
    option.value = group;
    option.textContent = group;
    groupFilter.appendChild(option);
  }
}

function loadPlaylist(text, displayName) {
  allItems = parseM3U(text);
  populateGroups(allItems);
  applyFilters();
  fileName.textContent = displayName || "M3U geladen";
  updateStatus(`${allItems.length} Streams geladen`);
  setPlayerState(false);
  placeholder.style.display = "grid";
  playerTitle.textContent = "Auswahl";
  playerGroup.textContent = "Keine Kategorie";
  playerUrl.textContent = "Kein Stream geladen";
  video.removeAttribute("src");
}

function handleFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    loadPlaylist(reader.result, file.name);
  };
  reader.readAsText(file);
}

fileButton.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (file) {
    handleFile(file);
  }
});

searchInput.addEventListener("input", applyFilters);
groupFilter.addEventListener("change", applyFilters);
sortSelect.addEventListener("change", applyFilters);

openButton.addEventListener("click", () => {
  if (playerUrl.textContent && playerUrl.textContent.startsWith("http")) {
    window.open(playerUrl.textContent, "_blank");
  }
});

copyButton.addEventListener("click", async () => {
  const url = playerUrl.textContent;
  if (!url || url === "Kein Stream geladen") {
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    updateStatus("Link kopiert");
  } catch (err) {
    updateStatus("Kopieren nicht möglich");
  }
});

video.addEventListener("error", () => {
  updateStatus("Stream konnte nicht geladen werden (CORS/HTTP blockiert).");
});

function setupDragAndDrop() {
  document.addEventListener("dragover", (event) => {
    event.preventDefault();
  });
  document.addEventListener("drop", (event) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) {
      handleFile(file);
    }
  });
}

async function tryAutoLoad() {
  const target = "/ÖmersIPTV.m3u";
  try {
    const response = await fetch(target);
    if (!response.ok) {
      updateStatus("ÖmersIPTV.m3u nicht im Root gefunden.");
      return;
    }
    const text = await response.text();
    loadPlaylist(text, target);
  } catch (err) {
    updateStatus("Auto-Load fehlgeschlagen (Root nicht erreichbar).");
  }
}

setupDragAndDrop();
tryAutoLoad();
