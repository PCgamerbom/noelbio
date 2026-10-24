const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: JSON_HEADERS
  });
}

async function robloxFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Accept": "application/json",
      "User-Agent": "NOEL-SPACE-Bio",
      ...options.headers
    }
  });

  if (!response.ok) {
    throw new Error(`Roblox API respondeu HTTP ${response.status}`);
  }

  return response.json();
}

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const username = url.searchParams.get("username") || "PCgamerbom";

  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    return json({ error: "Nome de usuário inválido." }, 400);
  }

  try {
    // 1. Encontrar o usuário pelo nome.
    const usersData = await robloxFetch(
      "https://users.roblox.com/v1/usernames/users",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          usernames: [username],
          excludeBannedUsers: false
        })
      }
    );

    const user = usersData.data?.[0];

    if (!user) {
      return json({ error: `Usuário "${username}" não encontrado.` }, 404);
    }

    // 2. Buscar a miniatura do avatar.
    let avatarUrl = null;

    try {
      const thumbnails = await robloxFetch(
        `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${user.id}&size=150x150&format=Png&isCircular=false`
      );

      avatarUrl = thumbnails.data?.[0]?.imageUrl || null;
    } catch (error) {
      console.error("Erro ao buscar avatar:", error.message);
    }

    // 3. Buscar a presença. Se falhar, o perfil continua funcionando.
    let presence = null;
    let presenceError = null;

    try {
      const presenceData = await robloxFetch(
        "https://presence.roblox.com/v1/presence/users",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userIds: [user.id] })
        }
      );

      presence = presenceData.userPresences?.[0] || null;
    } catch (error) {
      presenceError = error.message;
      console.error("Erro ao buscar presença:", error.message);
    }

    return json({
      user: {
        id: user.id,
        name: user.name,
        displayName: user.displayName,
        avatarUrl
      },
      presence,
      presenceError
    });
  } catch (error) {
    console.error("Erro na função Roblox:", error);

    return json({
      error: "Não foi possível consultar a API do Roblox.",
      details: error.message
    }, 502);
  }
}
