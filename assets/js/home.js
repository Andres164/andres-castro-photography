async function setRandomHeroImage() {
  const photos = await apiFetch("/photos");
  if (!photos.length) return;

  const randomPhoto = photos[Math.floor(Math.random() * photos.length)];
  const { mediumUrl } = await apiFetch(`/${randomPhoto.image_uri}`);

  const heroImg = document.getElementById("hero-img");
  heroImg.src = mediumUrl;

  heroImg.onload = () => {
    heroImg.classList.remove("opacity-0");
  };
}

async function resolveSignedUrl(relativeImageUri) {
  const data = await apiFetch(`/${relativeImageUri}`); // [2]
  return data.mediumUrl;
}

async function loadAlbums() {
  const albums = await apiFetch("/albums/"); // [1][4]

  const wrapper = document.getElementById("album-swiper-wrapper");

  wrapper.innerHTML = albums.map(album => `
    <div class="swiper-slide">
      <a href="album.html?id=${album.id}" class="block">
        <div class="slide-media" data-album-id="${album.id}">
          <img class="bg-blur" />
          <img class="fg-contain" />
        </div>
        <div class="text-center mt-3">
          <h2 class="text-xl font-semibold text-white">${album.title}</h2>
        </div>
      </a>
    </div>
  `).join("");

  new Swiper(".swiper", {
    loop: true,
    navigation: {
      nextEl: ".swiper-button-next",
      prevEl: ".swiper-button-prev",
    },
  });

  // Resolver cada portada en paralelo
  await Promise.all(albums.map(async (album) => {
    try {
      const url = await resolveSignedUrl(album.coverImageUri); // [1]
      const container = document.querySelector(`[data-album-id="${album.id}"]`);
      const bgImg = container.querySelector(".bg-blur");
      const fgImg = container.querySelector(".fg-contain");

      bgImg.src = url;
      fgImg.src = url;

      fgImg.onload = () => container.classList.add("loaded");
    } catch (e) {
      console.error(`No se pudo cargar portada del álbum ${album.id}`, e);
    }
  }));
}

setRandomHeroImage().catch(err => console.error("Error cargando hero:", err));
loadAlbums().catch(err => console.error("Error cargando álbumes:", err));