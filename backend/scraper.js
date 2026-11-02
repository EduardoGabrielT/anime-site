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
  return query
    .replace(/\b(season|\bpart\b|\btv\b|shippuden|dublado|legendado|\d+ª\s*temporada|\d+(nd|rd|th|st)\s*season)\b/gi, "")
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

    $(".items article, article.item, .animation-2 article").each((_, el) => {
      const linkEl = $(el).find("a").first();
      let href = linkEl.attr("href") || "";
      const imgEl = $(el).find("img").first();
      let img = imgEl.attr("data-src") || imgEl.attr("src") || "";
      const title = $(el).find(".entry-title, .title, h3, h2").text().trim() || linkEl.attr("title") || "";
      const lang = $(el).find(".calidad, .badge, .lang").text().trim() || "Legendado";

      if (href && href.includes("/episodio/")) {
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

    return releases;
  } catch (err) {
    return [];
  }
}

export async function searchAnime(query) {
  const termoLimpo = cleanQuery(query);
  const rotas = [
    `${BASE_URL}/?s=${encodeURIComponent(termoLimpo)}`,
    `${BASE_URL}/?s=${encodeURIComponent(query.trim())}`
  ];

  for (const url of rotas) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (!res.ok) continue;

      const html = await res.text();
      const $ = cheerio.load(html);
      const items = $("article.item, .items article, .result-item").toArray();

      for (const el of items) {
        const link = $(el).find("a").first();
        let href = link.attr("href") || "";
        const titleFound = $(el).find(".title, .entry-title, h3").text().trim();

        if (href && (href.includes("/anime/") || href.includes("/animes/")) && !href.includes("/episodio/")) {
          const score = stringSimilarity(query, titleFound);
          if (score >= 0.45 || titleFound.toLowerCase().includes(termoLimpo.toLowerCase())) {
            if (!href.startsWith("http")) href = BASE_URL + href;
            return href;
          }
        }
      }
    } catch (err) {}
  }
  return null;
}

export async function getEpisodesFromUrl(animeUrl) {
  try {
    const res = await fetch(animeUrl, { headers: HEADERS });
    if (!res.ok) return [];

    const html = await res.text();
    const $ = cheerio.load(html);
    const episodes = [];
    const urlsVistas = new Set();

    const seasonBlocks = $("#seasons .se-c, .seasonbody").toArray();

    if (seasonBlocks.length > 0) {
      seasonBlocks.forEach((block, index) => {
        let seasonNum = index + 1;
        const seasonTitle = $(block).find(".se-q, .title").text().trim();
        const seasonMatch = seasonTitle.match(/(\d+)/);
        if (seasonMatch) seasonNum = parseInt(seasonMatch[1], 10);

        $(block).find("li a, a").each((_, a) => {
          let href = $(a).attr("href");
          if (!href || !href.includes("/episodio/") || urlsVistas.has(href)) return;
          urlsVistas.add(href);

          if (!href.startsWith("http")) href = BASE_URL + href;

          const texto = $(a).text().trim();
          const numMatch = texto.match(/(\d+)/) || href.match(/episodio-(\d+)/i);
          const epNum = numMatch ? parseInt(numMatch[1], 10) : (episodes.length + 1);

          episodes.push({
            season: seasonNum,
            number: epNum,
            title: `Episódio ${epNum}`,
            url: href
          });
        });
      });
    }

    if (episodes.length === 0) {
      $("a[href*='/episodio/']").each((idx, a) => {
        let href = $(a).attr("href");
        if (!href || urlsVistas.has(href)) return;
        urlsVistas.add(href);

        if (!href.startsWith("http")) href = BASE_URL + href;

        const texto = $(a).text().trim();
        const numMatch = texto.match(/(\d+)/) || href.match(/episodio-(\d+)/i);
        const epNum = numMatch ? parseInt(numMatch[1], 10) : (idx + 1);

        const tempMatch = href.match(/temporada-(\d+)/i) || href.match(/season-(\d+)/i);
        const seasonNum = tempMatch ? parseInt(tempMatch[1], 10) : 1;

        episodes.push({
          season: seasonNum,
          number: epNum,
          title: `Episódio ${epNum}`,
          url: href
        });
      });
    }

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