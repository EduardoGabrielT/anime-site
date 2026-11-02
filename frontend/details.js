document.addEventListener("DOMContentLoaded", async () => {
  console.log("🚀 [Animebom] details.js iniciado!");

  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");

  const animePoster = document.getElementById("animePoster");
  const animeTitle = document.getElementById("animeTitle");
  const animeRating = document.getElementById("animeRating");
  const animeEpisodes = document.getElementById("animeEpisodes");
  const animeYear = document.getElementById("animeYear");
  const animeType = document.getElementById("animeType");
  const animeSynopsis = document.getElementById("animeSynopsis");

  const episodesContainer = document.getElementById("episodesContainer");
  const playerContainer = document.getElementById("playerContainer");
  const currentEpLabel = document.getElementById("currentEpLabel");

  if (!id) {
    console.error("❌ Nenhum ID fornecido na URL!");
    return;
  }

  let titleText = "";

  // Função infalível de tradução otimizada para PT-BR
  async function traduzirParaPt(texto) {
    if (!texto || texto === "Sem sinopse disponível.") return texto;
    try {
      const textoLimpo = texto.replace(/<[^>]*>?/gm, '').trim();
      // Utiliza o motor de tradução estável
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(textoLimpo)}&langpair=en|pt-BR`;
      const res = await fetch(url);
      const data = await res.json();
      if (data && data.responseData && data.responseData.translatedText) {
        let traduzido = data.responseData.translatedText;
        // Evita retornar mensagem de erro da API caso ultrapasse limite
        if (!traduzido.includes("MYMEMORY WARNING")) {
          return traduzido;
        }
      }
    } catch (e) {
      console.warn("⚠️ Erro na tradução, mantendo original:", e);
    }
    return texto; // Retorna o original se houver qualquer instabilidade
  }

  try {
    console.log(`📡 Buscando metadados do anime ID: ${id}...`);
    const res = await fetch(`http://localhost:3000/anime/${id}`);
    const resJson = await res.json();
    
    const anime = resJson?.data || resJson;

    if (anime) {
      if (animePoster && (anime.images?.jpg?.large_image_url || anime.coverImage?.large)) {
        animePoster.src = anime.images?.jpg?.large_image_url || anime.coverImage?.large;
      }

      titleText = anime.title?.romaji || anime.title?.english || (typeof anime.title === "string" ? anime.title : "Anime");
      
      if (animeTitle) animeTitle.textContent = titleText;
      if (animeRating) animeRating.textContent = anime.score || anime.averageScore || "N/A";
      if (animeEpisodes) animeEpisodes.textContent = anime.episodes || "N/A";
      if (animeYear) animeYear.textContent = anime.year || anime.seasonYear || "N/A";
      if (animeType) animeType.textContent = anime.type || anime.format || "TV";

      const sinopseOriginal = anime.synopsis || anime.description || "Sem sinopse disponível.";
      if (animeSynopsis) {
        animeSynopsis.textContent = "Traduzindo sinopse para o português...";
        const sinopseTraduzida = await traduzirParaPt(sinopseOriginal);
        animeSynopsis.textContent = sinopseTraduzida;
      }
    }

  } catch (err) {
    console.warn("⚠️ Não foi possível carregar metadados do Node.js:", err);
    if (animeTitle) animeTitle.textContent = "Carregando...";
  }

  carregarEpisodios(titleText || id);

  async function carregarEpisodios(nomeOuId) {
    if (!episodesContainer) return;

    episodesContainer.innerHTML = '<span style="color:#ff6b00; font-size:0.85rem;">Conectando ao serviço de episódios...</span>';

    const slug = String(nomeOuId).toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").trim();
    const primeiraPalavra = slug.split("_")[0];
    const termos = [slug, primeiraPalavra, nomeOuId].filter(Boolean);
    let episodes = [];

    for (const termo of termos) {
      try {
        console.log(`🔍 [Backend] Consultando episódios para: "${termo}"`);
        const res = await fetch(`http://localhost:3000/api/episodes?anime=${encodeURIComponent(termo)}`);
        const resJson = await res.json();
        const data = resJson.data || resJson;

        if (Array.isArray(data) && data.length > 0) {
          episodes = data;
          console.log(`✅ [Backend] ${episodes.length} episódios encontrados!`);
          break;
        }
      } catch (err) {
        console.warn(`Erro ao buscar termo ${termo}:`, err);
      }
    }

    if (episodes.length === 0) {
      episodesContainer.innerHTML = '<span style="color:#888; font-size:0.85rem;">Nenhum episódio localizado para este título ainda.</span>';
      return;
    }

    episodesContainer.innerHTML = "";

    episodes.forEach((ep, idx) => {
      const btn = document.createElement("button");
      btn.className = "ep-btn";
      btn.textContent = `EP ${ep.number}`;

      btn.addEventListener("click", () => {
        document.querySelectorAll(".ep-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        tocarEpisodio(ep);
      });

      episodesContainer.appendChild(btn);

      if (idx === 0) {
        btn.classList.add("active");
        tocarEpisodio(ep);
      }
    });
  }

  async function tocarEpisodio(ep) {
    console.log(`▶️ Carregando Player do Episódio ${ep.number}...`);
    if (currentEpLabel) currentEpLabel.textContent = `Reproduzindo Episódio ${ep.number}`;
    if (playerContainer) playerContainer.innerHTML = '<div style="color:#ff6b00;">Carregando vídeo...</div>';

    if (ep.iframe) {
      playerContainer.innerHTML = ep.iframe;
      return;
    }

    try {
      const res = await fetch(`http://localhost:3000/api/player?url=${encodeURIComponent(ep.episode_url || ep.url)}`);
      const data = await res.json();

      if (data && data.iframe) {
        playerContainer.innerHTML = data.iframe;
      } else {
        playerContainer.innerHTML = '<div style="color:#888;">Vídeo indisponível para este player.</div>';
      }
    } catch (err) {
      console.error("❌ Erro ao buscar iframe:", err);
      if (playerContainer) playerContainer.innerHTML = '<div style="color:#ff4444;">Erro ao conectar com o player de vídeo.</div>';
    }
  }
});