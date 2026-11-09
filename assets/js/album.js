const params = new URLSearchParams(location.search);
const albumId = params.get("id");

const CONTENT_TYPE_EXT = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
};

function getExtension(contentType) {
  return CONTENT_TYPE_EXT[contentType] || "jpg";
}

function formatTakenAt(takenAt) {
  if (!takenAt) return null;
  return new Date(takenAt).toLocaleDateString("es-MX", {
    year: "numeric", month: "2-digit", day: "2-digit",
  });
}

async function resolveSignedUrl(relativeImageUri) {
  const data = await apiFetch(`/${relativeImageUri}`);
  return data.mediumUrl;
}

// --- Limitador simple de concurrencia, para no disparar N requests a la vez ---
async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let index = 0;

  async function next() {
    const current = index++;
    if (current >= items.length) return;
    results[current] = await worker(items[current], current);
    return next();
  }

  const runners = Array.from({ length: Math.min(limit, items.length) }, next);
  await Promise.all(runners);
  return results;
}

let currentAlbum = null;
let lightbox = null;

async function loadAlbum() {
  currentAlbum = await apiFetch(`/albums/${albumId}`);

  document.getElementById("album-title").textContent = currentAlbum.title;
  document.getElementById("album-description").textContent = currentAlbum.description || "";

  const dateEl = document.getElementById("album-date");
  const formatted = formatTakenAt(currentAlbum.takenAt);
  if (formatted) {
    dateEl.textContent = formatted;
  } else {
    dateEl.remove();
  }

  await renderGrid(currentAlbum.photos);
  initLightbox();
}

async function renderGrid(photos) {
  const grid = document.getElementById("photo-grid");

  grid.innerHTML = photos.map(photo => `
    <a href="#" class="grid-photo-item glightbox" data-type="image" data-photo-id="${photo.id}" data-gallery="album">
      <img data-photo-id-img="${photo.id}" alt="" />
    </a>
  `).join("");

  // Resolvemos los thumbnails en lotes de 4 para no saturar
  await runWithConcurrency(photos, 4, async (photo) => {
    try {
      const url = await resolveSignedUrl(photo.imageUri);
      const link = document.querySelector(`.glightbox[data-photo-id="${photo.id}"]`);
      const img = link.querySelector("img");

      link.href = url; // GLightbox usará esto como imagen a mostrar
      img.src = url;
      img.onload = () => img.classList.add("loaded");
    } catch (e) {
      console.error(`No se pudo cargar foto ${photo.id}`, e);
    }
  });
}

function initLightbox() {
  lightbox = GLightbox({
    selector: ".glightbox",
    touchNavigation: true,
    loop: true,
  });

  const toolbar = document.getElementById("lightbox-toolbar");
  const downloadBtn = document.getElementById("lightbox-download-btn");
  const shareBtn = document.getElementById("lightbox-share-btn");

  let activePhotoId = null;

  lightbox.on("slide_changed", ({ current }) => {
    activePhotoId = current.slideNode.querySelector(".glightbox")?.dataset.photoId
      || current.slideConfig?.photoId
      || current.slideNode.dataset.photoId;

    // GLightbox guarda el elemento original en current.slideNode; recuperamos el id desde el DOM original
    const sourceEl = document.querySelectorAll(".glightbox")[current.index];
    activePhotoId = sourceEl?.dataset.photoId;
  });

  lightbox.on("open", () => {
    toolbar.classList.remove("hidden");
    toolbar.classList.add("flex");
  });

  lightbox.on("close", () => {
    toolbar.classList.add("hidden");
    toolbar.classList.remove("flex");
  });

  downloadBtn.addEventListener("click", () => {
    if (activePhotoId) downloadPhoto(activePhotoId);
  });

  shareBtn.addEventListener("click", async () => {
    if (!activePhotoId) return;
    const shareUrl = `${location.origin}${location.pathname}?id=${albumId}&photo=${activePhotoId}`;

    if (navigator.share) {
      navigator.share({ title: currentAlbum.title, url: shareUrl }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(shareUrl);
      alert("Enlace copiado al portapapeles");
    }
  });
}

// --- Descarga individual ---
async function downloadPhoto(photoId) {
  try {
    const meta = await apiFetch(`/photos/${photoId}`);
    const { originalUrl } = await apiFetch(`/photos/${photoId}/image`);

    const blob = await fetch(originalUrl).then(r => r.blob());
    const filename = `${meta.title}.${getExtension(meta.content_type)}`;

    saveAs(blob, filename);
  } catch (e) {
    console.error("Error al descargar la foto:", e);
    alert("No se pudo descargar la foto. Revisa la consola para más detalles.");
  }
}

// --- Descarga del álbum completo en ZIP ---
document.getElementById("download-all-btn").addEventListener("click", downloadAlbumZip);

async function downloadAlbumZip() {
  const btn = document.getElementById("download-all-btn");
  const status = document.getElementById("download-all-status");

  btn.disabled = true;
  status.classList.remove("hidden");

  try {
    const zip = new JSZip();
    const photos = currentAlbum.photos;
    let completed = 0;

    await runWithConcurrency(photos, 3, async (photo) => {
      const meta = await apiFetch(`/photos/${photo.id}`);
      const { originalUrl } = await apiFetch(`/photos/${photo.id}/image`);
      const blob = await fetch(originalUrl).then(r => r.blob());

      const filename = `${meta.title}.${getExtension(meta.content_type)}`;
      zip.file(filename, blob);

      completed++;
      status.textContent = `Descargando ${completed}/${photos.length}...`;
    });

    status.textContent = "Comprimiendo...";
    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, `${currentAlbum.title}.zip`);

    status.textContent = "¡Listo!";
  } catch (e) {
    console.error("Error generando el zip:", e);
    status.textContent = "Ocurrió un error. Revisa la consola.";
  } finally {
    btn.disabled = false;
    setTimeout(() => status.classList.add("hidden"), 3000);
  }
}

loadAlbum().catch(err => console.error("Error cargando álbum:", err));