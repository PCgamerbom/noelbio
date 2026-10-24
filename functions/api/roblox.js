const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: JSON_HEADERS,
  });
}

// Retry com backoff exponencial para 429/5xx
async function robloxFetch(url, options = {}, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(url, {
      ...options,
      headers: {
        Accept: "application/json",
        User-Agent: "NOEL-SPACE-Bio",
        ...options.headers,
      },
    });

    if (response.ok) return response.json();

    // 429 (rate limit) ou 5xx → retry com backoff
    if (response.status === 429 || response.status >= 500) {
      if (attempt < retries) {
        const delay = Math.pow(2, attempt) * 500 + Math.random() * 200;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
    }

    throw new Error(`Roblox API respondeu HTTP ${response.status}`);
  }
}

export async function onRequestGet({ request, env, ctx }) {
  const url = new URL(request.url);
  const username = url.searchParams.get("username") || "PCgamerbom";

  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    return json({ error: "Nome de usuário inválido." }, 400);
  }

  // --- CACHE: evita chamar o Roblox a cada request ---
  const cacheKey = `roblox-profile-${username.toLowerCase()}`;
  const cache = caches.default;

  const cached = await cache.match(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    // 1. Lookup por username
    const usersData = await robloxFetch(
      "https://users.roblox.com/v1/usernames/users",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          usernames: [username],
          excludeBannedUsers: false,
        }),
      }
    );

    const user = usersData.data?.[0];
    if (!user) {
      return json({ error: `Usuário "${username}" não encontrado.` }, 404);
    }

    // 2. Thumbnail do avatar
    let avatarUrl = null;
    try {
      const thumbnails = await robloxFetch(
        `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${user.id}&size=150x150&format=Png&isCircular=false`
      );
      avatarUrl = thumbnails.data?.[0]?.imageUrl || null;
    } catch (e) {
      console.error("Erro ao buscar avatar:", e.message);
    }

    // 3. Presença
    let presence = null;
    let presenceError = null;
    try {
      const presenceData = await robloxFetch(
        "https://presence.roblox.com/v1/presence/users",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userIds: [user.id] }),
        }
      );
      presence = presenceData.userPresences?.[0] || null;
    } catch (e) {
      presenceError = e.message;
    }

    const body = {
      user: {
        id: user.id,
        name: user.name,
        displayName: user.displayName,
        avatarUrl,
      },
      presence,
      presenceError,
    };

    const response = json(body);

    // Cache por 5 minutos (presença pode mudar, mas evita 429)
    const cacheTtl = 5 * 60; // 5 min
    ctx.waitUntil(
      cache.put(cacheKey, response.clone(), {
        // Cache API do Cloudflare usa "ttl" via Cache-Control no response
        // Alternativa: usar KV se precisar de TTL mais preciso
      })
    );

    return response;
  } catch (error) {
    console.error("Erro na função Roblox:", error);
    return json(
      { error: "Não foi possível consultar a API do Roblox.", details: error.message },
      502
    );
  }
}   
