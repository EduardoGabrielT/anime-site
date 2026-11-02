import * as cheerio from "cheerio";

const BASE_URL = "https://animesonlinecc.to";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Referer": "https://animesonlinecc.to/"
};

function stringSimilarity(s1, s2) {
  const clean = s => s.toLowerCase().replace(/[:\-_!?,./()[\]"']/g, " ").replace(/\s+/g, " ").trim();
  const w1 = clean(s1).split(" ").filter(w => w.length > 2);
  const w2 = clean(s2).split(" ").filter(w => w.length > 2);
  if (!w1.length || !w2.length) return 0;

  let matches = 0;
  w1.forEach(word => {
    if (w2.some(w => w.includes(word) || word.includes(w))) matches++;
  });
  return matches / Math.max(w1.length, 1);
}

function cleanQuery(query) {
  // Mantém os termos úteis e evita apagar palavras essenciais de subtítulos
  return query
    .replace(/\b(season|\bpart\b|\btv\b|shippuden|dublado|legendado|\d+ª\s*temporada)\b/gi, "")
    .replace(/[:\-_!?,./()[\]"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function getLatestReleasesFromHome() {
  try {
    const res = await fetch(BASE_URL, { headers: HEADERS });
    if (!res.ok) return [];

    const html = await res.text();
    const $ = cheerio.load(html);
    const releases = [];
    const urlsVistas = new Set();

    $(".items article, article.item, .animation-2 article, .result-item, li.item").each((_, el) => {
      const linkEl = $(el).find("a").first();
      let href = linkEl.attr("href") || "";
      const imgEl = $(el).find("img").first();
      let img = imgEl.attr("data-src") || imgEl.attr("src") || "";
      const title = $(el).find(".title, .entry-title, h3, h2").text().trim() || linkEl.attr("title") || "";
      const lang = $(el).find(".calidad, .badge, .lang").text().trim() || "Legendado";

      if (href && href.includes("/episodio/") && !urlsVistas.has(href)) {
        urlsVistas.add(href);
        if (!href.startsWith("http")) href = BASE_URL + href;
        if (img.startsWith("//")) img = "https:" + img;

        releases.push({
          title: title.replace(/\s+/g, " "),
          episode_url: href,
          image: img,
          lang: lang.includes("Dub") ? "Dublado" : "Legendado"
        });
      }
    });

    return releases.slice(0, 12);
  } catch (err) {
    return [];
  }
}

export async function searchAnime(query) {
  const termoLimpo = cleanQuery(query);
  const qTrim = query.trim();

  // Múltiplas rotas de busca para garantir flexibilidade máxima na origem
  const rotas = [
    `${BASE_URL}/?s=${encodeURIComponent(qTrim)}`,
    `${BASE_URL}/?s=${encodeURIComponent(termoLimpo)}`,
    `${BASE_URL}/anime/?s=${encodeURIComponent(qTrim)}`
  ];

  if (qTrim.length === 1) {
    rotas.unshift(`${BASE_URL}/anime/?letra=${qTrim.toLowerCase()}`);
  }

  for (const url of rotas) {
    if (!url.includes("?s=%20") && url.length > BASE_URL.length + 3) {
      try {
        const res = await fetch(url, { headers: HEADERS });
        if (!res.ok) continue;

        const html = await res.text();
        const $ = cheerio.load(html);
        const items = $("article.item, .items article, .result-item, .search-page .item").toArray();

        for (const el of items) {
          const link = $(el).find("a").first();
          let href = link.attr("href") || "";
          const titleFound = $(el).find(".title, .entry-title, h3").text().trim();

          const isAnimePage = href && (href.includes("/anime/") || href.includes("/animes/")) && !href.includes("/episodio/");

          if (isAnimePage) {
            if (qTrim.length === 1) {
              if (!href.startsWith("http")) href = BASE_URL + href;
              return href;
            }

            const score = stringSimilarity(qTrim, titleFound);
            // Critério flexível para aceitar variações de subtítulos como "Beerus"
            if (score >= 0.2 || titleFound.toLowerCase().includes(termoLimpo.toLowerCase()) || termoLimpo.toLowerCase().includes(titleFound.toLowerCase())) {
              if (!href.startsWith("http")) href = BASE_URL + href;
              return href;
            }
          }
        }
      } catch (err) {}
    }
  }
  return null;
}

export async function getEpisodesFromUrl(animeUrl) {
  try {
    const res = await fetch(animeUrl, { headers: HEADERS });
    if (!res.ok) return [];

    const html = await res.text();
    const $ = cheerio.load(html);
    const episodiosMap = new Map();

    const urlParts = animeUrl.split("/").filter(Boolean);
    const animeSlug = urlParts[urlParts.length - 1] || "";

    const seasonBlocks = $("#seasons .se-c, .seasons-items .se-c, .episodiosList").toArray();

    if (seasonBlocks.length > 0) {
      seasonBlocks.forEach((block, index) => {
        const seasonTitle = $(block).find(".se-q, .title, span").text().trim();
        const seasonMatch = seasonTitle.match(/(\d+)/);
        const seasonNum = seasonMatch ? parseInt(seasonMatch[1], 10) : (index + 1);

        $(block).find("a[href*='/episodio/']").each((_, a) => {
          let href = $(a).attr("href");
          if (!href) return;
          if (!href.startsWith("http")) href = BASE_URL + href;

          const matchEpUrl = href.match(/episodio[^\d]*(\d+)/i) || href.match(/\/(\d+)\/?$/);
          const epNum = matchEpUrl ? parseInt(matchEpUrl[1], 10) : null;
          if (!epNum) return;

          const chaveUnica = `s${seasonNum}e${epNum}`;

          if (!episodiosMap.has(chaveUnica)) {
            episodiosMap.set(chaveUnica, {
              season: seasonNum,
              number: epNum,
              title: `Episódio ${epNum}`,
              url: href
            });
          }
        });
      });
    }

    if (episodiosMap.size === 0) {
      $("a[href*='/episodio/']").each((_, a) => {
        let href = $(a).attr("href");
        if (!href) return;
        if (!href.startsWith("http")) href = BASE_URL + href;

        const matchEpUrl = href.match(/episodio[^\d]*(\d+)/i) || href.match(/\/(\d+)\/?$/);
        const epNum = matchEpUrl ? parseInt(matchEpUrl[1], 10) : null;
        if (!epNum) return;

        const tempMatch = href.match(/temporada[^\d]*(\d+)/i) || href.match(/season[^\d]*(\d+)/i);
        const seasonNum = tempMatch ? parseInt(tempMatch[1], 10) : 1;

        const chaveUnica = `s${seasonNum}e${epNum}`;

        if (!episodiosMap.has(chaveUnica)) {
          episodiosMap.set(chaveUnica, {
            season: seasonNum,
            number: epNum,
            title: `Episódio ${epNum}`,
            url: href
          });
        }
      });
    }

    let episodes = Array.from(episodiosMap.values());

    episodes.sort((a, b) => {
      if (a.season !== b.season) return a.season - b.season;
      return a.number - b.number;
    });

    return episodes;
  } catch (err) {
    return [];
  }
}

export async function extractIframe(episodeUrl) {
  try {
    const res = await fetch(episodeUrl, { headers: HEADERS });
    if (!res.ok) return { servers: [] };

    const html = await res.text();
    const $ = cheerio.load(html);
    const servers = [];

    const playOptions = $(".playex, [data-post], .dooplay_player_option").toArray();
    for (let i = 0; i < playOptions.length; i++) {
      const opt = playOptions[i];
      const post = $(opt).attr("data-post");
      const nume = $(opt).attr("data-nume") || $(opt).attr("data-option") || String(i + 1);
      const type = $(opt).attr("data-type") || "tv";
      const serverName = $(opt).find(".title, span").text().trim() || `Servidor ${i + 1}`;

      if (post && nume) {
        try {
          const ajaxUrl = `${BASE_URL}/wp-admin/admin-ajax.php`;
          const formData = new URLSearchParams();
          formData.append("action", "doo_player_ajax");
          formData.append("post", post);
          formData.append("nume", nume);
          formData.append("type", type);

          const ajaxRes = await fetch(ajaxUrl, {
            method: "POST",
            headers: {
              ...HEADERS,
              "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
              "X-Requested-With": "XMLHttpRequest"
            },
            body: formData.toString()
          });

          if (ajaxRes.ok) {
            const ajaxData = await ajaxRes.json();
            const rawUrl = ajaxData.embed_url || ajaxData;

            if (typeof rawUrl === "string" && rawUrl.includes("http")) {
              let cleanUrl = rawUrl;
              const match = rawUrl.match(/src=["'](.*?)["']/);
              if (match) cleanUrl = match[1];
              if (cleanUrl.startsWith("//")) cleanUrl = "https:" + cleanUrl;

              servers.push({
                name: serverName,
                embed_url: cleanUrl
              });
            }
          }
        } catch (e) {}
      }
    }

    if (servers.length === 0) {
      $("iframe, embed").each((idx, el) => {
        let src = $(el).attr("src") || $(el).attr("data-src") || "";
        if (src && !src.includes("about:blank") && !src.includes("ads") && !src.includes("google")) {
          if (src.startsWith("//")) src = "https:" + src;
          servers.push({
            name: `Servidor ${idx + 1}`,
            embed_url: src
          });
        }
      });
    }

    return { servers };
  } catch (err) {
    return { servers: [] };
  }
}