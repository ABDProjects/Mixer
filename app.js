const API_URL = "https://azuracast.aidanbray.com/api/nowplaying/mixer";
const API_ORIGIN = "https://azuracast.aidanbray.com";
const STREAM_URL = "https://azuracast.aidanbray.com/listen/mixer/radio.mp3";
const REQUESTS_URL = `${API_ORIGIN}/api/station/mixer/requests`;
const REFRESH_MS = 15000;
const VOLUME_STORAGE_KEY = "mixer-radio-volume";
const VISUALIZER_STORAGE_KEY = "mixer-visualizer-enabled";

const audio = document.querySelector("#radioAudio");
const playButton = document.querySelector("#playButton");
const playIcon = document.querySelector("#playIcon");
const songTitle = document.querySelector("#songTitle");
const artistName = document.querySelector("#artistName");
const onAir = document.querySelector("#onAir");
const coverArt = document.querySelector("#coverArt");
const coverArtNext = document.querySelector("#coverArtNext");
const coverWrap = document.querySelector("#coverWrap");
const artBackground = document.querySelector("#artBackground");
const listenerCount = document.querySelector("#listenerCount");
const volumeSlider = document.querySelector("#volumeSlider");
const historyButton = document.querySelector("#historyButton");
const requestButton = document.querySelector("#requestButton");
const historyPanel = document.querySelector("#historyPanel");
const requestPanel = document.querySelector("#requestPanel");
const historyList = document.querySelector("#historyList");
const requestMessage = document.querySelector("#requestMessage");
const requestList = document.querySelector("#requestList");
const requestSearch = document.querySelector("#requestSearch");
const visualizerCanvas = document.querySelector("#visualizer");
const visualizerToggle = document.querySelector("#visualizerToggle");
const topActions = document.querySelector(".top-actions");
const menuToggle = document.querySelector("#menuToggle");
const integrationsButton = document.querySelector("#integrationsButton");
const radioPageButton = document.querySelector("#radioPageButton");
const integrationsPage = document.querySelector("#integrationsPage");
const apiPage = document.querySelector("#apiPage");
const apiPageButton = document.querySelector("#apiPageButton");
const integrationsPageButton = document.querySelector("#integrationsPageButton");
const miniPlayButton = document.querySelector("#miniPlayButton");
const miniPlayIcon = document.querySelector("#miniPlayIcon");
const miniArt = document.querySelector("#miniArt");
const miniTitle = document.querySelector("#miniTitle");
const miniArtist = document.querySelector("#miniArtist");
let visibleArtwork = coverArt;
let incomingArtwork = coverArtNext;
let activeArtworkUrl = "";
let requestLoadPromise;
let availableRequests = [];
let audioContext;
let analyser;
let audioSource;
let visualizerFrame;
let visualizerEnabled = false;

function setVolume(value) {
  const volume = Math.max(0, Math.min(100, Number(value)));
  audio.volume = volume / 100;
  volumeSlider.value = volume;
  volumeSlider.style.background = `linear-gradient(to right, var(--accent) 0%, var(--accent) ${volume}%, rgba(255,255,255,.2) ${volume}%, rgba(255,255,255,.2) 100%)`;
  try {
    window.localStorage.setItem(VOLUME_STORAGE_KEY, String(volume));
  } catch (error) {
    console.warn("Could not save volume preference:", error);
  }
}

function applyArtwork(url) {
  if (!url || url === activeArtworkUrl) return;
  const image = new Image();
  image.onload = () => {
    incomingArtwork.src = url;
    miniArt.src = url;
    incomingArtwork.classList.add("ready");
    visibleArtwork.classList.remove("ready");
    coverWrap.classList.add("has-art");
    [visibleArtwork, incomingArtwork] = [incomingArtwork, visibleArtwork];
    activeArtworkUrl = url;

    artBackground.style.opacity = ".18";
    window.setTimeout(() => {
      artBackground.style.backgroundImage = `url("${url}")`;
      artBackground.style.opacity = ".34";
    }, 220);
  };
  image.src = url;
}

function updatePlayer(data) {
  const { station, now_playing: nowPlaying, live, is_online: online } = data;
  const song = nowPlaying?.song;
  if (song) {
    songTitle.textContent = song.title || song.text || "Unknown track";
    artistName.textContent = song.artist || station?.name || "MIXER";
    miniTitle.textContent = song.title || song.text || "Unknown track";
    miniArtist.textContent = song.artist || station?.name || "MIXER";
    applyArtwork(song.art);
  }

  const isLive = Boolean(live?.is_live);
  const presenter = live?.streamer_name?.trim();
  onAir.textContent = isLive ? `LIVE DJ · ${presenter || "ON AIR"}` : "ON AIR · AUTODJ";
  const listeners = station?.listeners?.current ?? data.listeners?.current;
  const nextListenerCount = String(listeners ?? "—");
  if (listenerCount.textContent !== nextListenerCount) {
    listenerCount.textContent = nextListenerCount;
    listenerCount.classList.remove("count-change");
    void listenerCount.offsetWidth;
    listenerCount.classList.add("count-change");
  }
  listenerCount.parentElement.setAttribute("aria-label", `${listeners ?? "Unknown"} listeners`);
  renderHistory(data.song_history || []);
}

function resizeVisualizer() {
  const ratio = window.devicePixelRatio || 1;
  const { width, height } = visualizerCanvas.getBoundingClientRect();
  visualizerCanvas.width = Math.round(width * ratio);
  visualizerCanvas.height = Math.round(height * ratio);
  visualizerCanvas.getContext("2d").setTransform(ratio, 0, 0, ratio, 0, 0);
}

async function setUpVisualizer() {
  if (analyser) {
    await audioContext.resume();
    return true;
  }

  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = .84;
    audioSource = audioContext.createMediaElementSource(audio);
    audioSource.connect(analyser);
    analyser.connect(audioContext.destination);
    await audioContext.resume();
    resizeVisualizer();
    return true;
  } catch (error) {
    console.warn("Could not enable the audio visualizer:", error);
    return false;
  }
}

function drawVisualizer() {
  if (!visualizerEnabled || !analyser) return;
  const context = visualizerCanvas.getContext("2d");
  const { width, height } = visualizerCanvas.getBoundingClientRect();
  const samples = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(samples);
  context.clearRect(0, 0, width, height);

  const barCount = 56;
  const gap = 4;
  const barWidth = (width - gap * (barCount - 1)) / barCount;
  const baseline = height - 22;
  const gradient = context.createLinearGradient(0, baseline - height * .34, 0, baseline);
  gradient.addColorStop(0, "rgba(255,255,255,0)");
  gradient.addColorStop(1, "rgba(255,255,255,.82)");
  context.fillStyle = gradient;
  let lowTotal = 0;
  for (let index = 0; index < 10; index += 1) lowTotal += samples[index];
  const lowEnergy = lowTotal / 10;

  for (let index = 0; index < barCount; index += 1) {
    const sampleIndex = Math.floor((index / (barCount - 1)) * samples.length * .42);
    const localEnergy = (samples[sampleIndex] + samples[sampleIndex + 1] + samples[sampleIndex + 2] + samples[sampleIndex + 3]) / 4;
    const amplitude = Math.max(6, ((localEnergy * .72 + lowEnergy * .28) / 255) * height * .32);
    const x = index * (barWidth + gap);
    context.fillRect(x, baseline - amplitude, barWidth, amplitude);
  }
  visualizerFrame = window.requestAnimationFrame(drawVisualizer);
}

async function setVisualizer(active) {
  visualizerEnabled = active;
  document.body.classList.toggle("visualizer-on", active);
  visualizerToggle.setAttribute("aria-pressed", String(active));
  visualizerToggle.querySelector("span").textContent = active ? "VISUALS ON" : "VISUALS";
  try {
    window.localStorage.setItem(VISUALIZER_STORAGE_KEY, String(active));
  } catch (error) {
    console.warn("Could not save visualizer preference:", error);
  }

  window.cancelAnimationFrame(visualizerFrame);
  if (active && await setUpVisualizer()) drawVisualizer();
}

function renderHistory(history) {
  historyList.replaceChildren();
  if (!history.length) {
    historyList.textContent = "No recently played tracks are available.";
    return;
  }

  history.forEach((entry) => {
    const song = entry.song || {};
    const row = document.createElement("div");
    row.className = "history-item";
    row.style.animationDelay = `${Math.min(history.indexOf(entry) * 45, 220)}ms`;
    const art = song.art ? document.createElement("img") : document.createElement("div");
    art.className = song.art ? "" : "history-art";
    if (song.art) { art.src = song.art; art.alt = ""; }
    const copy = document.createElement("div");
    const title = document.createElement("strong");
    const artist = document.createElement("span");
    title.textContent = song.title || song.text || "Unknown track";
    artist.textContent = song.artist || "MIXER";
    copy.append(title, artist);
    row.append(art, copy);
    historyList.append(row);
  });
}

async function loadRequests() {
  if (requestLoadPromise) return requestLoadPromise;
  requestList.textContent = "Loading requests…";
  requestLoadPromise = (async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(REQUESTS_URL, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error(`Requests request failed (${response.status})`);
      availableRequests = await response.json();
      renderRequests();
    } catch (error) {
      console.warn("Could not load MIXER requests:", error);
      requestList.textContent = "Requests could not be loaded right now. Please reopen this panel to try again.";
      requestLoadPromise = undefined;
    } finally {
      window.clearTimeout(timeout);
    }
  })();
  return requestLoadPromise;
}

function renderRequests() {
  requestList.replaceChildren();
  const query = requestSearch.value.trim().toLowerCase();
  const requests = availableRequests.filter((request) => {
    const song = request.song || {};
    return !query || [song.title, song.artist, song.album, song.text]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(query));
  });
  if (!requests.length) {
    requestList.textContent = query ? "No requests match that search." : "No songs are currently available to request.";
    return;
  }

  requests.forEach((request, index) => {
    const song = request.song || {};
    const row = document.createElement("div");
    row.className = "request-item";
    row.style.animationDelay = `${Math.min(index * 40, 260)}ms`;
    const art = song.art ? document.createElement("img") : document.createElement("div");
    art.className = song.art ? "" : "request-art";
    if (song.art) { art.src = song.art; art.alt = ""; }
    const copy = document.createElement("div");
    copy.className = "request-song";
    const title = document.createElement("strong");
    const artist = document.createElement("span");
    title.textContent = song.title || song.text || "Unknown track";
    artist.textContent = song.artist || "MIXER";
    copy.append(title, artist);
    const submit = document.createElement("button");
    submit.className = "request-submit";
    submit.type = "button";
    submit.textContent = "REQUEST";
    submit.addEventListener("click", () => submitRequest(request, song, submit));
    row.append(art, copy, submit);
    requestList.append(row);
  });
}

async function submitRequest(request, song, button) {
  button.disabled = true;
  button.textContent = "SENDING";
  try {
    const response = await fetch(`${API_ORIGIN}${request.request_url}`, { method: "POST" });
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    button.textContent = "SENT";
    requestMessage.textContent = `Request sent: ${song.title || song.text || "song"}.`;
  } catch (error) {
    console.warn("Could not submit song request:", error);
    button.disabled = false;
    button.textContent = "REQUEST";
    requestMessage.textContent = "That request could not be sent. Please try again later.";
  }
}

async function getNowPlaying() {
  try {
    const response = await fetch(`${API_URL}?_=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Metadata request failed (${response.status})`);
    updatePlayer(await response.json());
  } catch (error) {
    console.warn("Could not load MIXER metadata:", error);
  }
}

async function togglePlayback() {
  if (audio.paused) {
    try {
      audio.src = `${STREAM_URL}?live=${Date.now()}`;
      audio.load();
      await audio.play();
    } catch (error) {
      console.warn("Could not start radio stream:", error);
    }
  } else {
    audio.pause();
  }
}

playButton.addEventListener("click", togglePlayback);
miniPlayButton.addEventListener("click", togglePlayback);
volumeSlider.addEventListener("input", (event) => setVolume(event.target.value));
audio.addEventListener("playing", () => {
  playIcon.classList.replace("fa-play", "fa-pause");
  miniPlayIcon.classList.replace("fa-play", "fa-pause");
  playButton.setAttribute("aria-label", "Pause MIXER live radio");
  miniPlayButton.setAttribute("aria-label", "Pause MIXER live radio");
  if (visualizerEnabled) {
    setUpVisualizer().then(() => {
      window.cancelAnimationFrame(visualizerFrame);
      drawVisualizer();
    });
  }
});
audio.addEventListener("pause", () => {
  playIcon.classList.replace("fa-pause", "fa-play");
  miniPlayIcon.classList.replace("fa-pause", "fa-play");
  playButton.setAttribute("aria-label", "Play MIXER live radio");
  miniPlayButton.setAttribute("aria-label", "Play MIXER live radio");
});
audio.addEventListener("error", () => {
});

historyButton.addEventListener("click", () => historyPanel.showModal());
requestButton.addEventListener("click", () => {
  requestPanel.showModal();
  loadRequests();
});
requestSearch.addEventListener("input", renderRequests);
visualizerToggle.addEventListener("click", () => setVisualizer(!visualizerEnabled));
function setActionMenu(open) {
  topActions.classList.toggle("menu-open", open);
  menuToggle.setAttribute("aria-expanded", String(open));
  menuToggle.setAttribute("aria-label", open ? "Close extra controls" : "Open extra controls");
}
menuToggle.addEventListener("click", () => setActionMenu(!topActions.classList.contains("menu-open")));
function setPage(page, updateHash = true) {
  const showingIntegrations = page === "integrations";
  const showingApi = page === "api";
  document.body.classList.toggle("integrations-open", showingIntegrations || showingApi);
  document.body.classList.toggle("api-open", showingApi);
  integrationsPage.setAttribute("aria-hidden", String(!showingIntegrations));
  apiPage.setAttribute("aria-hidden", String(!showingApi));
  if (updateHash) window.location.hash = showingApi ? "api" : showingIntegrations ? "integrations" : "";
}
integrationsButton.addEventListener("click", () => {
  setActionMenu(false);
  setPage("integrations");
});
radioPageButton.addEventListener("click", () => setPage("radio"));
apiPageButton.addEventListener("click", () => setPage("api"));
integrationsPageButton.addEventListener("click", () => setPage("integrations"));
window.addEventListener("hashchange", () => setPage(window.location.hash === "#api" ? "api" : window.location.hash === "#integrations" ? "integrations" : "radio", false));
document.addEventListener("click", (event) => {
  if (topActions.classList.contains("menu-open") && !topActions.contains(event.target)) setActionMenu(false);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setActionMenu(false);
});
window.addEventListener("resize", resizeVisualizer);
function closePanel(panel) {
  if (panel.classList.contains("is-closing")) return;
  panel.classList.add("is-closing");
  window.setTimeout(() => {
    panel.close();
    panel.classList.remove("is-closing");
  }, 200);
}
document.querySelectorAll(".panel-close").forEach((button) => {
  button.addEventListener("click", () => closePanel(button.closest("dialog")));
});
document.querySelectorAll(".panel").forEach((panel) => {
  panel.addEventListener("cancel", (event) => {
    event.preventDefault();
    closePanel(panel);
  });
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch((error) => {
      console.warn("Could not register the MIXER service worker:", error);
    });
  });
}

getNowPlaying();
loadRequests();
let savedVolume;
let savedVisualizer;
try {
  savedVolume = window.localStorage.getItem(VOLUME_STORAGE_KEY);
  savedVisualizer = window.localStorage.getItem(VISUALIZER_STORAGE_KEY);
} catch (error) {
  console.warn("Could not read saved volume preference:", error);
}
setVolume(savedVolume ?? volumeSlider.value);
if (savedVisualizer === "true") setVisualizer(true);
setPage(window.location.hash === "#api" ? "api" : window.location.hash === "#integrations" ? "integrations" : "radio", false);
window.setInterval(getNowPlaying, REFRESH_MS);
