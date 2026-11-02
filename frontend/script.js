const searchInput = document.getElementById("search");
const grid = document.querySelector(".grid");
const genreSelect = document.getElementById("genre");
const loadMoreBtn = document.getElementById("loadMore");

let page = 1;
const limit = 24;
let isLoading = false;

function renderAnimes(animes, clear = false) {
  if (!grid) return;
  if (clear) grid.innerHTML = "";

  if (!animes || animes.length === 0) {
    if (clear) grid.innerHTML = "<p style='color: white; text-align: center; width: 100%;'>Nenhum anime encontrado.</p>";
    return;
  }

  animes.forEach(anime => {
    const imageUrl = anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || "";
    const title = anime.title || "Sem título";
    const id = anime.mal_id;

    grid.innerHTML += `
      <a href="details.html?id=${id}" class="card">
        <span class="tag">TOP</span>
        <img src="${imageUrl}" alt="${title}" loading="lazy">
        <p>${title}</p>
      </a>
    `;
  });
}

async function carregarAnimes() {
  if (isLoading) return;
  isLoading = true;

  try {
    const res = await fetch(`http://localhost:3000/top-anime?page=${page}`);
    if (!res.ok) throw new Error(`HTTP error: ${res.status}`);

    const data = await res.json();
    renderAnimes(data.data?.slice(0, limit), page === 1);
  } catch (err) {
    console.error("Erro ao carregar animes:", err);
  } finally {
    isLoading = false;
  }
}

carregarAnimes();

if (loadMoreBtn) {
  loadMoreBtn.addEventListener("click", () => {
    page++;
    carregarAnimes();
  });
}

if (searchInput) {
  let searchTimeout;
  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
      const query = searchInput.value.trim();

      if (query.length < 3) {
        page = 1;
        carregarAnimes();
        return;
      }

      try {
        const res = await fetch(`http://localhost:3000/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        renderAnimes(data.data, true);
      } catch (err) {
        console.error("Erro na busca:", err);
      }
    }, 300);
  });
}

if (genreSelect) {
  genreSelect.addEventListener("change", async () => {
    const genre = genreSelect.value;

    if (!genre) {
      page = 1;
      carregarAnimes();
      return;
    }

    try {
      const res = await fetch(`http://localhost:3000/genre?id=${encodeURIComponent(genre)}`);
      const data = await res.json();
      renderAnimes(data.data, true);
    } catch (err) {
      console.error("Erro no gênero:", err);
    }
  });
}

window.addEventListener("scroll", () => {
  if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 200) {
    if (!isLoading) {
      page++;
      carregarAnimes();
    }
  }
});