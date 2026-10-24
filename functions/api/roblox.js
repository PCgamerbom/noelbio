export async function onRequestGet({ request }) {
  const corsHeaders = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  };

  try {
    const url = new URL(request.url);
    const username = url.searchParams.get("username") || "PCgamerbom";

    // 1. Encontrar o usuário pelo nome
    const userResponse = await fetch(
      "https://users.roblox.com/v1/usernames/users",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          usernames: [username],
          excludeBannedUsers: true
        })
      }
    );

    if (!userResponse.ok) {
      throw new Error("Não foi possível consultar os usuários do Roblox.");
    }

    const userData = await userResponse.json();
    const user = userData.data?.[0];

    if (!user) {
      return Response.json(
        { error: "Usuário do Roblox não encontrado." },
        { status: 404, headers: corsHeaders }
      );
    }

    // 2. Buscar o avatar
    const avatarResponse = await fetch(
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${user.id}&size=150x150&format=Png&isCircular=true`
    );

    let avatarUrl = null;

    if (avatarResponse.ok) {
      const avatarData = await avatarResponse.json();
      avatarUrl = avatarData.data?.[0]?.imageUrl || null;
    }

    // 3. Consultar a presença do usuário
    const presenceResponse = await fetch(
      "https://presence.roblox.com/v1/presence/users",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          userIds: [user.id]
        })
      }
    );

    let presence = null;

    if (presenceResponse.ok) {
      const presenceData = await presenceResponse.json();
      presence = presenceData.userPresences?.[0] || null;
    }

    // 4. Retornar os dados para o site
    return Response.json(
      {
        user: {
          id: user.id,
          name: user.name,
          displayName: user.displayName,
          avatarUrl
        },
        presence
      },
      { headers: corsHeaders }
    );

  } catch (error) {
    return Response.json(
      {
        error: "Erro ao consultar a API do Roblox.",
        details: error.message
      },
      { status: 502, headers: corsHeaders }
    );
  }
}
