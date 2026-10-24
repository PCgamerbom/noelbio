const USER_ID = "2281180949";

async function fetchJson(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        Accept: "application/json",
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });

    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    const rawText = await response.text();

    let payload;
    if (rawText) {
      try {
        payload = JSON.parse(rawText);
      } catch {
        payload = null;
      }
    }

    if (!response.ok) {
      const message = payload && typeof payload === "object" && payload.error
        ? String(payload.error)
        : rawText && rawText.length < 300
          ? rawText.trim()
          : `Roblox respondeu HTTP ${response.status}`;

      throw new Error(message);
    }

    if (
      rawText &&
      payload === null &&
      !contentType.includes("application/json") &&
      !contentType.includes("+json")
    ) {
      throw new Error("Resposta da API do Roblox não foi JSON válido.");
    }

    return payload ?? {};
  } finally {
    clearTimeout(timer);
  }
}

function normalizeStatus(type) {
  const value = Number(type || 0);
  const map = {
    0: "Offline",
    1: "Online",
    2: "Em um jogo",
    3: "No Roblox Studio",
  };
  return map[value] || "Status desconhecido";
}

async function getProfile() {
  const profileResponse = await fetchJson(`https://users.roblox.com/v1/users/${USER_ID}`);

  const user = profileResponse && typeof profileResponse === "object" ? profileResponse : {};
  let presenceType = 0;
  let status = "Offline";
  let game = null;
  let groups = [];
  let avatar = null;

  try {
    const presenceResponse = await fetchJson(
      "https://presence.roblox.com/v1/presence/users",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: [Number(USER_ID)] }),
      }
    );

    const p = presenceResponse?.userPresences?.[0];

    if (p) {
      presenceType = Number(p.userPresenceType || 0);
      status = normalizeStatus(presenceType);

      if (presenceType === 2 && p.placeId) {
        try {
          const place = await fetchJson(
            `https://apis.roblox.com/universes/v1/places/${p.placeId}/universe`
          );

          if (place && place.universeId) {
            const details = await fetchJson(
              `https://games.roblox.com/v1/games?universeIds=${place.universeId}`
            );

            const g = details?.data?.[0];

            if (g) {
              game = {
                name: g.name || "Jogo do Roblox",
                creatorName: g.creator?.name || "Desconhecido",
                creatorType: g.creator?.type || "",
                playing: Number.isFinite(g.playing) ? g.playing : null,
                visits: Number.isFinite(g.visits) ? g.visits : null,
                url: `https://www.roblox.com/games/${p.placeId}`,
                image: null,
              };

              try {
                const thumbs = await fetchJson(
                  `https://thumbnails.roblox.com/v1/games/icons?universeIds=${place.universeId}&returnPolicy=PlaceHolder&size=512x512&format=Png&isCircular=false`
                );
                game.image = thumbs?.data?.[0]?.imageUrl || null;
              } catch {}
            }
          }
        } catch {}
      }
    }
  } catch {}

  try {
    const roleData = await fetchJson(
      `https://groups.roblox.com/v1/users/${USER_ID}/groups/roles`
    );

    groups = (roleData?.data || [])
      .filter(
        (item) =>
          item?.role?.rank === 255 || /owner|dono/i.test(item?.role?.name || "")
      )
      .map((item) => ({
        name: item?.group?.name || "Grupo do Roblox",
        description: item?.group?.description || "",
        memberCount: Number.isFinite(item?.group?.memberCount)
          ? item.group.memberCount
          : null,
        url: `https://www.roblox.com/communities/${item?.group?.id || ""}`,
      }));
  } catch {}

  try {
    const thumb = await fetchJson(
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${USER_ID}&size=420x420&format=Png&isCircular=false`
    );
    avatar = thumb?.data?.[0]?.imageUrl || null;
  } catch {}

  return {
    id: USER_ID,
    username: user.name || "PCgamerbom",
    displayName: user.displayName || user.name || "Noelzin",
    profileUrl: `https://www.roblox.com/users/${USER_ID}/profile`,
    created: user.created || null,
    avatar,
    presenceType,
    status,
    game,
    groups,
    updatedAt: new Date().toISOString(),
  };
}

export async function onRequest(context) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  };

  if (context.request.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "Método não permitido." }),
      { status: 405, headers: { ...headers, Allow: "GET" } }
    );
  }

  try {
    const profile = await getProfile();
    return new Response(JSON.stringify(profile), { status: 200, headers });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "Não foi possível consultar a API pública do Roblox.",
        details: String(error?.message || error),
      }),
      { status: 502, headers }
    );
  }
}
