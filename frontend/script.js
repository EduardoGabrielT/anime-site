const searchInput = document.getElementById("search");
const grid = document.querySelector(".grid");
const genreSelect = document.getElementById("genre");
const loadMoreBtn = document.getElementById("loadMore");

let page = 1;
let isLoading = false;

function renderAnimes(animes, clear = false) {
  if (!grid) return;
  if (clear) grid.innerHTML = "";

  if (!animes || animes.length === 0) {
    if (clear) grid.innerHTML = "<p style='color: white; text-align: center; width: 100%;'>Nenhum anime encontrado.</p>";
    return;
  }

  animes.forEach((anime, index) => {
    // Compatibilidade para suportar tanto os dados do AniList/Top quanto os do Scraper de Últimos Lançamentos
    const imageUrl = anime.image || anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || "";
    const title = anime.title || "Sem título";
    const episodeUrl = anime.episode_url;
    const malId = anime.mal_id;

    // Se for item de lançamento do scraper, direciona para o player. Se for catálogo, vai para os detalhes.
    const linkDestino = episodeUrl 
      ? `player.html?url=${encodeURIComponent(episodeUrl)}&title=${encodeURIComponent(title)}&index=${index}`
      : `details.html?id=${malId}`;

    grid.innerHTML += `
      <a href="${linkDestino}" class="card">
        <span class="tag">${anime.lang || 'TOP'}</span>
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
    // Buscando diretamente da rota correta de últimos lançamentos do seu backend
    const res = await fetch(`http://localhost:3000/api/latest-releases`);
    if (!res.ok) throw new Error(`HTTP error: ${res.status}`);

    const data = await res.json();
    // Exibe todos os itens retornados pelo scraper (os 21 lançamentos) sem travar em 12
    renderAnimes(data.data, page === 1);
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
        const res = await fetch(`http://localhost:3000/api/episodes?anime=${encodeURIComponent(query)}`);
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