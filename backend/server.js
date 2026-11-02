import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { searchAnime, getEpisodesFromUrl, extractIframe, getLatestReleasesFromHome } from "./scraper.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_FILE = path.join(__dirname, "episodes_db.json");

const app = express();
const PORT = 3000;

app.use(cors({ origin: "*" }));
app.use(express.json());

const translationCache = new Map();

function getStoredEpisodes() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, "utf-8");
      return JSON.parse(data) || [];
    }
  } catch (err) {}
  return [];
}

function saveEpisodes(episodes) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(episodes, null, 2), "utf-8");
  } catch (err) {}
}

let latestEpisodesDB = getStoredEpisodes();

app.get("/", (req, res) => {
  res.json({ status: "Backend rodando 🚀" });
});

app.get("/api/latest-releases", async (req, res) => {
  try {
    const releases = await getLatestReleasesFromHome();
    res.json({ data: releases });
  } catch (err) {
    res.json({ data: [] });
  }
});

app.get("/api/episodes", async (req, res) => {
  latestEpisodesDB = getStoredEpisodes();
  const animeQuery = req.query.anime;

  if (!animeQuery) {
    return res.json({ data: latestEpisodesDB });
  }

  const termo = String(animeQuery).toLowerCase().replace(/[:\-_]/g, " ").trim();
  const palavrasChave = termo.split(/\s+/).filter(p => p.length >= 3);

  const filtrados = latestEpisodesDB.filter(ep => {
    const titleLower = ep.title.toLowerCase();
    if (titleLower.includes(termo)) return true;
    if (palavrasChave.length > 0) {
      return palavrasChave.every(palavra => titleLower.includes(palavra));
    }
    return false;
  });

  if (filtrados.length > 0) {
    return res.json({ data: filtrados });
  }

  try {
    const animeUrl = await searchAnime(animeQuery);
    if (!animeUrl) return res.json({ data: [] });

    const episodes = await getEpisodesFromUrl(animeUrl);
    if (!episodes || episodes.length === 0) return res.json({ data: [] });

    const novos = episodes.map(ep => ({
      id: latestEpisodesDB.length + 1,
      title: `${animeQuery} ${ep.title}`,
      episode_url: ep.url,
      number: ep.number,
      season: ep.season || 1,
      lang: "Legendado",
      servers: [],
      created_at: new Date()
    }));

    latestEpisodesDB.push(...novos);
    saveEpisodes(latestEpisodesDB);

    return res.json({ data: novos });
  } catch (err) {
    return res.json({ data: [] });
  }
});

app.get("/api/player", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).json({ error: "Parâmetro url ausente." });

  latestEpisodesDB = getStoredEpisodes();
  const ep = latestEpisodesDB.find(e => e.episode_url === targetUrl);

  if (ep && ep.servers && Array.isArray(ep.servers) && ep.servers.length > 0) {
    return res.json({ servers: ep.servers });
  }

  try {
    const result = await extractIframe(targetUrl);
    const servers = result?.servers || [];

    if (ep && servers.length > 0) {
      ep.servers = servers;
      saveEpisodes(latestEpisodesDB);
    }

    res.json({ servers });
  } catch (err) {
    res.json({ servers: [] });
  }
});

async function fetchAniList(query, variables = {}) {
  const response = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ query, variables })
  });

  if (!response.ok) throw new Error(`Erro AniList: ${response.status}`);
  const result = await response.json();
  return result.data;
}

async function translateToPortuguese(text, animeId) {
  if (!text || text === "Sinopse não disponível.") return text;
  if (translationCache.has(animeId)) return translationCache.get(animeId);

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=pt&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
    });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && Array.isArray(data[0])) {
        const translatedText = data[0].map(item => item[0]).join("");
        if (translatedText.trim().length > 0) {
          translationCache.set(animeId, translatedText);
          return translatedText;
        }
      }
    }
  } catch (err) {}
  return text;
}

function formatAnimeData(anime) {
  if (!anime) return null;
  return {
    mal_id: anime.id,
    title: anime.title?.romaji || anime.title?.english || anime.title?.native || "Sem título",
    images: {
      jpg: {
        image_url: anime.coverImage?.large || anime.coverImage?.medium || "",
        large_image_url: anime.coverImage?.extraLarge || anime.coverImage?.large || ""
      }
    },
    score: anime.averageScore ? (anime.averageScore / 10).toFixed(1) : "8.5",
    episodes: anime.episodes || "N/A",
    year: anime.seasonYear || anime.startDate?.year || "TV",
    type: anime.format || "TV",
    synopsis: anime.description ? anime.description.replace(/<[^>]*>?/gm, "").replace(/\(Source:.*?\)/gi, "").trim() : "Sinopse não disponível."
  };
}

app.get("/anime/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const query = `
      query ($id: Int) {
        Media(id: $id, type: ANIME) {
          id
          title { romaji english }
          coverImage { large extraLarge medium }
          episodes
          averageScore
          seasonYear
          startDate { year }
          format
          description
        }
      }
    `;

    const data = await fetchAniList(query, { id });
    const formatted = formatAnimeData(data.Media);

    if (formatted && formatted.synopsis) {
      formatted.synopsis = await translateToPortuguese(formatted.synopsis, id);
    }

    res.json({ data: formatted });
  } catch (error) {
    res.status(500).json({ error: "Erro ao buscar detalhes" });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🔥 Backend rodando na porta ${PORT}`);
});