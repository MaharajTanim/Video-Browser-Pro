// Global variables
let allVideos = [];
let currentTheme = localStorage.getItem("theme") || "light";
let favorites = JSON.parse(localStorage.getItem("favorites")) || [];
let playlists = JSON.parse(localStorage.getItem("playlists")) || [];
let videoTags = JSON.parse(localStorage.getItem("videoTags")) || {};
let currentVideo = null;
let playbackSpeed = 1;
let showFavoritesOnly = false;
let batchMode = false;
let selectedVideos = new Set();
let compareMode = false;
let activePlaylist = null; // Currently loaded playlist
let currentDirectoryHandle = null; // Store current folder handle

// Initialize theme
document.documentElement.setAttribute("data-theme", currentTheme);

// IndexedDB helpers for storing directory handles
function openHandlesDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("FolderHandlesDB", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("handles")) {
        db.createObjectStore("handles", { keyPath: "name" });
      }
    };
  });
}

function saveHandleToDB(db, name, handle) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["handles"], "readwrite");
    const store = transaction.objectStore("handles");
    const request = store.put({ name, handle });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function getHandleFromDB(db, name) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["handles"], "readonly");
    const store = transaction.objectStore("handles");
    const request = store.get(name);
    request.onsuccess = () => resolve(request.result?.handle);
    request.onerror = () => reject(request.error);
  });
}

// Restore folder handles from IndexedDB on load
(async function restoreFolderHandles() {
  try {
    const db = await openHandlesDB();
    for (let i = 0; i < playlists.length; i++) {
      if (playlists[i].folderName && !playlists[i].folderHandle) {
        const handle = await getHandleFromDB(db, playlists[i].name);
        if (handle) {
          playlists[i].folderHandle = handle;
        }
      }
    }
  } catch (e) {
    console.log("Could not restore folder handles:", e);
  }
})();

// Generates a thumbnail for a video file
async function generateThumbnail(videoFile) {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    video.preload = "metadata";
    video.src = URL.createObjectURL(videoFile);

    video.onloadedmetadata = () => {
      // Seek to 1 second for the thumbnail
      video.currentTime = Math.min(1, video.duration / 4);
    };

    video.onseeked = () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL("image/jpeg");
      resolve({
        thumbnail: dataUrl,
        duration: video.duration,
        resolution: `${video.videoWidth}x${video.videoHeight}`,
      });
      URL.revokeObjectURL(video.src);
    };

    video.onerror = () => {
      resolve({
        thumbnail: "",
        duration: 0,
        resolution: "0x0",
      });
    };
  });
}

// Processes video files and generates their thumbnails and metadata
async function processVideos(files) {
  return Promise.all(
    files.map(async (video) => {
      const { thumbnail, duration, resolution } = await generateThumbnail(
        video.file,
      );
      const videoId = `${video.file.name}_${video.file.size}_${video.file.lastModified}`;
      return {
        ...video,
        id: videoId,
        thumbnail,
        meta: {
          duration,
          resolution,
          created: video.file.lastModified,
          size: video.file.size,
        },
        isFavorite: favorites.includes(videoId),
      };
    }),
  );
}

// Formats video duration from seconds to MM:SS or HH:MM:SS
function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${remainingSeconds
      .toString()
      .padStart(2, "0")}`;
  }
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

// Format file size
function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
  if (bytes < 1024 * 1024 * 1024)
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}

// Update statistics
function updateStats(videos) {
  const count = videos.length;
  const totalSize = videos.reduce((sum, v) => sum + v.meta.size, 0);
  const totalDuration = videos.reduce((sum, v) => sum + v.meta.duration, 0);

  document.getElementById("videoCount").textContent = `${count} video${
    count !== 1 ? "s" : ""
  }`;
  document.getElementById("totalSize").textContent = formatSize(totalSize);
  document.getElementById("totalDuration").textContent =
    formatDuration(totalDuration);
}

// Filters, sorts, and displays the videos
function updateDisplay() {
  const searchQuery = document.getElementById("search").value.toLowerCase();
  const sortBy = document.getElementById("sort").value;
  const formatFilter = document.getElementById("formatFilter").value;
  const qualityFilter = document.getElementById("qualityFilter").value;

  let filtered = allVideos.filter((video) => {
    const matchesSearch = video.file.name.toLowerCase().includes(searchQuery);
    const extension = video.file.name.split(".").pop().toLowerCase();
    const matchesFormat = formatFilter === "all" || extension === formatFilter;
    const matchesFavorite = !showFavoritesOnly || video.isFavorite;
    const matchesPlaylist =
      !activePlaylist || activePlaylist.videos.includes(video.id);

    // Quality filter
    let matchesQuality = true;
    if (qualityFilter !== "all") {
      const [width, height] = video.meta.resolution.split("x").map(Number);
      const maxDim = Math.max(width, height);
      switch (qualityFilter) {
        case "4k":
          matchesQuality = maxDim >= 2160;
          break;
        case "1080p":
          matchesQuality = maxDim >= 1080 && maxDim < 2160;
          break;
        case "720p":
          matchesQuality = maxDim >= 720 && maxDim < 1080;
          break;
        case "sd":
          matchesQuality = maxDim < 720;
          break;
      }
    }

    return (
      matchesSearch &&
      matchesFormat &&
      matchesFavorite &&
      matchesQuality &&
      matchesPlaylist
    );
  });

  filtered.sort((a, b) => {
    switch (sortBy) {
      case "name":
        return a.file.name.localeCompare(b.file.name);
      case "date":
        return b.meta.created - a.meta.created;
      case "size":
        return b.meta.size - a.meta.size;
      case "duration":
        return b.meta.duration - a.meta.duration;
      default:
        return 0;
    }
  });

  displayVideos(filtered);
  updateStats(filtered);
}

// Displays video cards in the container
async function displayVideos(videos) {
  const container = document.getElementById("videoContainer");
  container.innerHTML = "";

  videos.forEach((video, index) => {
    const card = document.createElement("div");
    card.className = "video-card";
    card.style.animationDelay = `${index * 0.05}s`;

    const extension = video.file.name.split(".").pop().toUpperCase();
    const favoriteClass = video.isFavorite ? "active" : "";

    card.innerHTML = `
      <div class="video-thumbnail">
        <img src="${video.thumbnail}" alt="Thumbnail">
        <div class="thumbnail-overlay">
          <div class="play-button">▶</div>
          <div class="video-duration">${formatDuration(
            video.meta.duration,
          )}</div>
          <div class="video-format-badge">${extension}</div>
        </div>
      </div>
      <div class="card-content">
        <div class="video-info">
          <h3 title="${video.file.name}">${video.file.name}</h3>
          <div class="video-meta">
            <span class="meta-item">📐 ${video.meta.resolution}</span>
            <span class="meta-item">📦 ${formatSize(video.meta.size)}</span>
            <span class="meta-item">📅 ${new Date(
              video.meta.created,
            ).toLocaleDateString()}</span>
          </div>
        </div>
        <div class="card-actions">
          <button class="favorite-btn ${favoriteClass}" data-video-id="${
            video.id
          }" title="Favorite">⭐</button>
          <button class="playlist-add-btn" data-video-id="${
            video.id
          }" title="Add to Playlist">➕</button>
        </div>
      </div>
    `;

    // When a video card is clicked, play the video in the modal
    card
      .querySelector(".video-thumbnail")
      .addEventListener("click", () => playVideo(video));

    // Favorite button
    card.querySelector(".favorite-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFavorite(video.id);
    });

    // Playlist add button
    card.querySelector(".playlist-add-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      showPlaylistModal(video.id);
    });

    container.appendChild(card);
  });
}

// Toggle favorite status
function toggleFavorite(videoId) {
  const index = favorites.indexOf(videoId);
  if (index > -1) {
    favorites.splice(index, 1);
  } else {
    favorites.push(videoId);
  }
  localStorage.setItem("favorites", JSON.stringify(favorites));

  // Update video object
  const video = allVideos.find((v) => v.id === videoId);
  if (video) video.isFavorite = !video.isFavorite;

  updateDisplay();
}

// Opens the modal and plays the selected video file
function playVideo(video) {
  currentVideo = video;
  const videoModal = document.getElementById("videoModal");
  const videoPlayer = document.getElementById("mainVideoPlayer");
  const videoTitle = document.getElementById("currentVideoTitle");

  videoPlayer.src = URL.createObjectURL(video.file);
  videoPlayer.playbackRate = playbackSpeed;
  videoTitle.textContent = video.file.name;
  videoModal.style.display = "flex";

  // Update favorite button state
  const favoriteBtn = document.getElementById("favoriteBtn");
  favoriteBtn.classList.toggle("active", video.isFavorite);
}

// Close modal function
function closeVideoModal() {
  const videoModal = document.getElementById("videoModal");
  const videoPlayer = document.getElementById("mainVideoPlayer");
  videoPlayer.pause();
  URL.revokeObjectURL(videoPlayer.src);
  videoPlayer.src = "";
  videoModal.style.display = "none";
  currentVideo = null;
}

// Close modal when clicking the close button or outside modal content
document
  .querySelector("#videoModal .close")
  .addEventListener("click", closeVideoModal);

window.addEventListener("click", (event) => {
  const videoModal = document.getElementById("videoModal");
  if (event.target === videoModal) {
    closeVideoModal();
  }

  const playlistModal = document.getElementById("playlistModal");
  if (event.target === playlistModal) {
    playlistModal.style.display = "none";
  }
});

// Picture-in-Picture
document.getElementById("pipBtn").addEventListener("click", async () => {
  const videoPlayer = document.getElementById("mainVideoPlayer");
  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    } else {
      await videoPlayer.requestPictureInPicture();
    }
  } catch (error) {
    console.error("PiP error:", error);
  }
});

// Playback speed control
document.getElementById("speedBtn").addEventListener("click", () => {
  const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
  const currentIndex = speeds.indexOf(playbackSpeed);
  playbackSpeed = speeds[(currentIndex + 1) % speeds.length];

  const videoPlayer = document.getElementById("mainVideoPlayer");
  videoPlayer.playbackRate = playbackSpeed;
  document.getElementById("speedBtn").textContent = `${playbackSpeed}x`;
});

// Fullscreen
document.getElementById("fullscreenBtn").addEventListener("click", () => {
  const videoWrapper = document.querySelector(".video-player-wrapper");
  if (!document.fullscreenElement) {
    videoWrapper.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
});

// Favorite from player
document.getElementById("favoriteBtn").addEventListener("click", () => {
  if (currentVideo) {
    toggleFavorite(currentVideo.id);
    document.getElementById("favoriteBtn").classList.toggle("active");
  }
});

// Toggle between dark and light themes
document.getElementById("themeToggle").addEventListener("click", () => {
  currentTheme = currentTheme === "light" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", currentTheme);
  localStorage.setItem("theme", currentTheme);
});

// Toggle between grid and list views
document.getElementById("viewToggle").addEventListener("click", () => {
  document.getElementById("videoContainer").classList.toggle("list-view");
});

// Toggle favorites filter
document.getElementById("favoritesToggle").addEventListener("click", (e) => {
  showFavoritesOnly = !showFavoritesOnly;
  e.target.classList.toggle("active", showFavoritesOnly);
  updateDisplay();
});

// Update display when search input or sort option changes
document.getElementById("search").addEventListener("input", updateDisplay);
document.getElementById("sort").addEventListener("change", updateDisplay);
document
  .getElementById("formatFilter")
  .addEventListener("change", updateDisplay);

// Playlist management
document.getElementById("playlistBtn").addEventListener("click", () => {
  const modal = document.getElementById("playlistModal");
  if (modal) {
    modal.style.display = "flex";
    displayPlaylists();
  }
});

// Close playlist modal - handled by the general modal close handler below

function displayPlaylists() {
  const listContainer = document.getElementById("playlistList");
  listContainer.innerHTML = "";

  if (playlists.length === 0) {
    listContainer.innerHTML =
      '<p class="no-playlists">No playlists yet. Create one!</p>';
    return;
  }

  playlists.forEach((playlist, index) => {
    const item = document.createElement("div");
    item.className = "playlist-item";
    const folderInfo = playlist.folderName
      ? `<small>📁 ${playlist.folderName}</small>`
      : "";
    const videoCount = playlist.videos
      ? `${playlist.videos.length} videos`
      : "Folder path";
    item.innerHTML = `
      <div class="playlist-info">
        <h4>${playlist.name}</h4>
        ${folderInfo}
        <span>${videoCount}</span>
      </div>
      <div class="playlist-actions">
        <button onclick="loadPlaylist(${index})">Load</button>
        <button onclick="deletePlaylist(${index})">Delete</button>
      </div>
    `;
    listContainer.appendChild(item);
  });
}

document.getElementById("createPlaylist").addEventListener("click", () => {
  const name = document.getElementById("playlistName").value.trim();
  if (!name) {
    alert("Please enter a playlist name");
    return;
  }

  playlists.push({ name, videos: [] });
  localStorage.setItem("playlists", JSON.stringify(playlists));
  document.getElementById("playlistName").value = "";
  displayPlaylists();
});

document.getElementById("savePlaylist").addEventListener("click", async () => {
  const name = document.getElementById("playlistName").value.trim();
  if (!name) {
    alert("Please enter a playlist name");
    return;
  }

  if (!currentDirectoryHandle) {
    alert("Please select a folder first!");
    return;
  }

  // Request permission to store the directory handle
  const permission = await currentDirectoryHandle.queryPermission({
    mode: "read",
  });
  if (permission !== "granted") {
    const newPermission = await currentDirectoryHandle.requestPermission({
      mode: "read",
    });
    if (newPermission !== "granted") {
      alert("Permission denied to access folder");
      return;
    }
  }

  // Save the directory handle reference
  const folderName = currentDirectoryHandle.name;
  const newPlaylist = {
    name,
    folderName,
    folderHandle: currentDirectoryHandle,
    savedDate: Date.now(),
  };
  playlists.push(newPlaylist);

  // Save handle to IndexedDB
  try {
    const db = await openHandlesDB();
    await saveHandleToDB(db, name, currentDirectoryHandle);
  } catch (e) {
    console.error("Failed to save folder handle:", e);
  }

  localStorage.setItem(
    "playlists",
    JSON.stringify(
      playlists.map((p) => ({
        name: p.name,
        folderName: p.folderName,
        savedDate: p.savedDate,
      })),
    ),
  );

  document.getElementById("playlistName").value = "";
  displayPlaylists();
  alert(`Saved playlist: ${name}\nFolder: ${folderName}`);
});

window.loadPlaylist = async (index) => {
  const playlist = playlists[index];
  if (!playlist) {
    alert("Playlist not found!");
    return;
  }

  // Check if this is a folder-based playlist
  if (playlist.folderHandle) {
    try {
      document.getElementById("loading").style.display = "flex";
      document.getElementById("playlistModal").style.display = "none";

      // Request permission
      const permission = await playlist.folderHandle.queryPermission({
        mode: "read",
      });
      if (permission !== "granted") {
        const newPermission = await playlist.folderHandle.requestPermission({
          mode: "read",
        });
        if (newPermission !== "granted") {
          alert("Permission denied. Please re-add this playlist.");
          document.getElementById("loading").style.display = "none";
          return;
        }
      }

      // Load videos from the folder
      const files = await readDirectory(playlist.folderHandle);
      allVideos = await processVideos(files);
      currentDirectoryHandle = playlist.folderHandle;

      activePlaylist = null;
      showFavoritesOnly = false;
      updateDisplay();

      // Show success indicator
      const indicator = document.getElementById("playlistIndicator");
      indicator.textContent = `📋 ${playlist.name} (${allVideos.length} videos)`;
      indicator.style.display = "inline-block";
      indicator.style.cursor = "pointer";
      indicator.title = "Loaded from folder";
      indicator.onclick = () => {
        indicator.style.display = "none";
      };

      document.getElementById("loading").style.display = "none";
    } catch (error) {
      console.error("Error loading playlist:", error);
      alert(
        "Failed to load playlist. The folder may have been moved or deleted.",
      );
      document.getElementById("loading").style.display = "none";
    }
  } else if (playlist.videos) {
    // Old-style playlist with video IDs
    activePlaylist = playlist;
    showFavoritesOnly = false;
    updateDisplay();

    const indicator = document.getElementById("playlistIndicator");
    indicator.textContent = `📋 ${playlist.name}`;
    indicator.style.display = "inline-block";
    indicator.style.cursor = "pointer";
    indicator.title = "Click to show all videos";
    indicator.onclick = clearPlaylist;

    document.getElementById("playlistModal").style.display = "none";
  }
};
window.clearPlaylist = () => {
  activePlaylist = null;
  const indicator = document.getElementById("playlistIndicator");
  indicator.style.display = "none";
  updateDisplay();
};

window.deletePlaylist = (index) => {
  if (confirm("Delete this playlist?")) {
    // If deleting the active playlist, clear it first
    if (activePlaylist && playlists[index] === activePlaylist) {
      clearPlaylist();
    }
    playlists.splice(index, 1);
    localStorage.setItem("playlists", JSON.stringify(playlists));
    displayPlaylists();
  }
};

// Keyboard shortcuts
document.addEventListener("keydown", (e) => {
  const videoPlayer = document.getElementById("mainVideoPlayer");
  const videoModal = document.getElementById("videoModal");

  // Only handle shortcuts when video is playing
  if (videoModal.style.display !== "flex") {
    // Global shortcut for search
    if (e.ctrlKey && e.key === "f") {
      e.preventDefault();
      document.getElementById("search").focus();
    }
    return;
  }

  switch (e.key) {
    case " ":
      e.preventDefault();
      videoPlayer.paused ? videoPlayer.play() : videoPlayer.pause();
      break;
    case "f":
    case "F":
      e.preventDefault();
      document.getElementById("fullscreenBtn").click();
      break;
    case "p":
    case "P":
      e.preventDefault();
      document.getElementById("pipBtn").click();
      break;
    case "ArrowLeft":
      e.preventDefault();
      videoPlayer.currentTime = Math.max(0, videoPlayer.currentTime - 5);
      break;
    case "ArrowRight":
      e.preventDefault();
      videoPlayer.currentTime = Math.min(
        videoPlayer.duration,
        videoPlayer.currentTime + 5,
      );
      break;
    case "ArrowUp":
      e.preventDefault();
      videoPlayer.volume = Math.min(1, videoPlayer.volume + 0.1);
      break;
    case "ArrowDown":
      e.preventDefault();
      videoPlayer.volume = Math.max(0, videoPlayer.volume - 0.1);
      break;
    case "Escape":
      closeVideoModal();
      break;
  }
});

// Keyboard shortcuts toggle
document.getElementById("toggleShortcuts").addEventListener("click", () => {
  document.querySelector(".shortcuts-content").classList.toggle("show");
});

// Drag and drop support
const dropOverlay = document.getElementById("dropOverlay");

["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
  document.body.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

["dragenter", "dragover"].forEach((eventName) => {
  document.body.addEventListener(
    eventName,
    () => {
      dropOverlay.classList.add("active");
    },
    false,
  );
});

["dragleave", "drop"].forEach((eventName) => {
  document.body.addEventListener(
    eventName,
    () => {
      dropOverlay.classList.remove("active");
    },
    false,
  );
});

document.body.addEventListener("drop", handleDrop, false);

async function handleDrop(e) {
  const dt = e.dataTransfer;
  const files = [...dt.files].filter((file) => {
    const ext = file.name.split(".").pop().toLowerCase();
    return ["mp4", "mov", "avi", "mkv", "webm", "ogg", "flv", "wmv"].includes(
      ext,
    );
  });

  if (files.length > 0) {
    document.getElementById("loading").style.display = "flex";
    const videoFiles = files.map((file) => ({ file }));
    allVideos = await processVideos(videoFiles);
    updateDisplay();
    document.getElementById("loading").style.display = "none";
  }
}

// Folder selection handler using the File System Access API
document.getElementById("selectFolder").addEventListener("click", async () => {
  try {
    const directoryHandle = await window.showDirectoryPicker();
    currentDirectoryHandle = directoryHandle; // Store the handle
    document.getElementById("loading").style.display = "flex";

    const files = await readDirectory(directoryHandle);
    allVideos = await processVideos(files);
    updateDisplay();

    document.getElementById("loading").style.display = "none";
  } catch (error) {
    console.error("Error accessing directory:", error);
    document.getElementById("loading").style.display = "none";
  }
});

// Reads the directory and returns an array of video file objects
async function readDirectory(directoryHandle) {
  const validExtensions = [
    "mp4",
    "mov",
    "avi",
    "mkv",
    "webm",
    "ogg",
    "flv",
    "wmv",
  ];
  const files = [];

  for await (const entry of directoryHandle.values()) {
    if (entry.kind === "file") {
      const file = await entry.getFile();
      const extension = file.name.split(".").pop().toLowerCase();
      if (validExtensions.includes(extension)) {
        files.push({ file });
      }
    }
  }
  return files;
}

// ==================== NEW FEATURES ====================

// Batch Operations
document.getElementById("batchBtn").addEventListener("click", () => {
  batchMode = !batchMode;
  selectedVideos.clear();
  document.getElementById("batchBar").style.display = batchMode
    ? "flex"
    : "none";
  document.getElementById("batchBtn").classList.toggle("active", batchMode);
  updateDisplay();
});

document.getElementById("batchCancel").addEventListener("click", () => {
  batchMode = false;
  selectedVideos.clear();
  document.getElementById("batchBar").style.display = "none";
  document.getElementById("batchBtn").classList.remove("active");
  updateDisplay();
});

document.getElementById("batchSelectAll").addEventListener("click", () => {
  allVideos.forEach((v) => selectedVideos.add(v.id));
  updateDisplay();
  updateBatchInfo();
});

document.getElementById("batchDeselectAll").addEventListener("click", () => {
  selectedVideos.clear();
  updateDisplay();
  updateBatchInfo();
});

document.getElementById("batchAddToFavorites").addEventListener("click", () => {
  selectedVideos.forEach((id) => {
    if (!favorites.includes(id)) favorites.push(id);
  });
  localStorage.setItem("favorites", JSON.stringify(favorites));
  allVideos.forEach((v) => (v.isFavorite = favorites.includes(v.id)));
  updateDisplay();
});

document
  .getElementById("batchRemoveFromFavorites")
  .addEventListener("click", () => {
    selectedVideos.forEach((id) => {
      const index = favorites.indexOf(id);
      if (index > -1) favorites.splice(index, 1);
    });
    localStorage.setItem("favorites", JSON.stringify(favorites));
    allVideos.forEach((v) => (v.isFavorite = favorites.includes(v.id)));
    updateDisplay();
  });

document.getElementById("batchAddTags").addEventListener("click", () => {
  if (selectedVideos.size === 0) {
    alert("Please select videos first");
    return;
  }
  currentVideo = { id: Array.from(selectedVideos) };
  document.getElementById("tagsModal").style.display = "flex";
});

document.getElementById("batchDelete").addEventListener("click", () => {
  if (selectedVideos.size === 0) return;
  if (confirm(`Delete ${selectedVideos.size} video(s) from the list?`)) {
    allVideos = allVideos.filter((v) => !selectedVideos.has(v.id));
    selectedVideos.clear();
    updateDisplay();
  }
});

function updateBatchInfo() {
  document.getElementById("selectedCount").textContent =
    `${selectedVideos.size} selected`;
}

// Compare Videos
document.getElementById("compareBtn").addEventListener("click", () => {
  const select1 = document.getElementById("compareVideo1");
  const select2 = document.getElementById("compareVideo2");
  select1.innerHTML = '<option value="">Select video...</option>';
  select2.innerHTML = '<option value="">Select video...</option>';

  allVideos.forEach((video) => {
    const option1 = document.createElement("option");
    option1.value = video.id;
    option1.textContent = video.file.name;
    select1.appendChild(option1);

    const option2 = document.createElement("option");
    option2.value = video.id;
    option2.textContent = video.file.name;
    select2.appendChild(option2);
  });

  document.getElementById("compareModal").style.display = "flex";
});

document.getElementById("compareVideo1").addEventListener("change", (e) => {
  const video = allVideos.find((v) => v.id === e.target.value);
  if (video) {
    const player = document.getElementById("comparePlayer1");
    player.src = URL.createObjectURL(video.file);
    document.getElementById("compareInfo1").innerHTML = `
      <p><strong>Resolution:</strong> ${video.meta.resolution}</p>
      <p><strong>Duration:</strong> ${formatDuration(video.meta.duration)}</p>
      <p><strong>Size:</strong> ${formatSize(video.meta.size)}</p>
      <p><strong>Format:</strong> ${video.file.name
        .split(".")
        .pop()
        .toUpperCase()}</p>
    `;
  }
});

document.getElementById("compareVideo2").addEventListener("change", (e) => {
  const video = allVideos.find((v) => v.id === e.target.value);
  if (video) {
    const player = document.getElementById("comparePlayer2");
    player.src = URL.createObjectURL(video.file);
    document.getElementById("compareInfo2").innerHTML = `
      <p><strong>Resolution:</strong> ${video.meta.resolution}</p>
      <p><strong>Duration:</strong> ${formatDuration(video.meta.duration)}</p>
      <p><strong>Size:</strong> ${formatSize(video.meta.size)}</p>
      <p><strong>Format:</strong> ${video.file.name
        .split(".")
        .pop()
        .toUpperCase()}</p>
    `;
  }
});

document.getElementById("syncPlayback").addEventListener("change", (e) => {
  const player1 = document.getElementById("comparePlayer1");
  const player2 = document.getElementById("comparePlayer2");

  if (e.target.checked) {
    player1.addEventListener("play", () => player2.play());
    player1.addEventListener("pause", () => player2.pause());
    player1.addEventListener(
      "seeked",
      () => (player2.currentTime = player1.currentTime),
    );
  } else {
    player1.removeEventListener("play", () => player2.play());
    player1.removeEventListener("pause", () => player2.pause());
    player1.removeEventListener(
      "seeked",
      () => (player2.currentTime = player1.currentTime),
    );
  }
});

// Tags Management
document.getElementById("tagsBtn").addEventListener("click", () => {
  document.getElementById("tagsModal").style.display = "flex";
  displayPopularTags();
});

document.getElementById("addTagsBtn").addEventListener("click", () => {
  const input = document.getElementById("tagInput");
  const tags = input.value
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t);

  if (tags.length === 0) return;

  if (Array.isArray(currentVideo.id)) {
    // Batch mode
    currentVideo.id.forEach((id) => {
      if (!videoTags[id]) videoTags[id] = [];
      tags.forEach((tag) => {
        if (!videoTags[id].includes(tag)) videoTags[id].push(tag);
      });
    });
  } else {
    // Single video
    if (!videoTags[currentVideo.id]) videoTags[currentVideo.id] = [];
    tags.forEach((tag) => {
      if (!videoTags[currentVideo.id].includes(tag))
        videoTags[currentVideo.id].push(tag);
    });
  }

  localStorage.setItem("videoTags", JSON.stringify(videoTags));
  input.value = "";
  document.getElementById("tagsModal").style.display = "none";
  updateDisplay();
});

function displayPopularTags() {
  const allTags = {};
  Object.values(videoTags).forEach((tags) => {
    tags.forEach((tag) => (allTags[tag] = (allTags[tag] || 0) + 1));
  });

  const popular = Object.entries(allTags)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const container = document.getElementById("popularTagsList");
  container.innerHTML = popular
    .map(
      ([tag, count]) =>
        `<span class="tag clickable" onclick="document.getElementById('tagInput').value += '${tag},';">${tag} (${count})</span>`,
    )
    .join("");
}

// Loop Video
document.getElementById("loopBtn").addEventListener("click", () => {
  const player = document.getElementById("mainVideoPlayer");
  player.loop = !player.loop;
  document.getElementById("loopBtn").classList.toggle("active", player.loop);
});

// Snapshot
document.getElementById("snapshotBtn").addEventListener("click", () => {
  const video = document.getElementById("mainVideoPlayer");
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0);

  canvas.toBlob(
    (blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `snapshot-${Date.now()}.jpg`;
      a.click();
      URL.revokeObjectURL(url);
    },
    "image/jpeg",
    0.95,
  );
});

// Export/Import
document.getElementById("exportBtn").addEventListener("click", () => {
  document.getElementById("exportModal").style.display = "flex";
});

document.getElementById("exportFavorites").addEventListener("click", () => {
  downloadJSON({ favorites }, "favorites.json");
});

document.getElementById("exportPlaylists").addEventListener("click", () => {
  downloadJSON({ playlists }, "playlists.json");
});

document.getElementById("exportTags").addEventListener("click", () => {
  downloadJSON({ videoTags }, "tags.json");
});

document.getElementById("exportAll").addEventListener("click", () => {
  downloadJSON({ favorites, playlists, videoTags }, "video-browser-data.json");
});

document.getElementById("importData").addEventListener("click", () => {
  const file = document.getElementById("importFile").files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.favorites) {
        favorites = data.favorites;
        localStorage.setItem("favorites", JSON.stringify(favorites));
      }
      if (data.playlists) {
        playlists = data.playlists;
        localStorage.setItem("playlists", JSON.stringify(playlists));
      }
      if (data.videoTags) {
        videoTags = data.videoTags;
        localStorage.setItem("videoTags", JSON.stringify(videoTags));
      }
      alert("Data imported successfully!");
      updateDisplay();
    } catch (error) {
      alert("Error importing data: " + error.message);
    }
  };
  reader.readAsText(file);
});

function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Close additional modals
document.querySelectorAll(".modal .close").forEach((closeBtn) => {
  closeBtn.addEventListener("click", () => {
    closeBtn.closest(".modal").style.display = "none";
  });
});

// Close modals when clicking outside
document.querySelectorAll(".modal").forEach((modal) => {
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.style.display = "none";
    }
  });
});

// ==================== MENU TOGGLE FUNCTIONALITY ====================
const menuToggle = document.getElementById("menuToggle");
const menuOverlay = document.getElementById("menuOverlay");
const controlsMenu = document.getElementById("controlsMenu");

function toggleMenu() {
  menuToggle.classList.toggle("active");
  controlsMenu.classList.toggle("open");
  menuOverlay.classList.toggle("active");
  document.body.style.overflow = controlsMenu.classList.contains("open")
    ? "hidden"
    : "";
}

function closeMenu() {
  menuToggle.classList.remove("active");
  controlsMenu.classList.remove("open");
  menuOverlay.classList.remove("active");
  document.body.style.overflow = "";
}

menuToggle.addEventListener("click", toggleMenu);
menuOverlay.addEventListener("click", closeMenu);

// Close menu when clicking on a control that typically filters/changes view
controlsMenu.addEventListener("click", (e) => {
  const target = e.target;
  // Close menu when interacting with buttons or selects (but not checkboxes)
  if (
    (target.tagName === "BUTTON" || target.tagName === "SELECT") &&
    window.innerWidth <= 968
  ) {
    setTimeout(closeMenu, 300); // Small delay for better UX
  }
});

// Close menu on window resize if it becomes large enough
window.addEventListener("resize", () => {
  if (window.innerWidth > 968) {
    closeMenu();
  }
});
