export default async function handler(req, res) {
    if (req.method !== "GET") {
        return res.status(405).json({
            error: "Method not allowed"
        });
    }

    const username = String(
        req.query.username || "PCgamerbom"
    ).trim();

    if (!username || username.length > 20) {
        return res.status(400).json({
            error: "Invalid username"
        });
    }

    try {
        // Find the Roblox user by username
        const userResponse = await fetch(
            "https://users.roblox.com/v1/usernames/users",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    usernames: [username],
                    excludeBannedUsers: false
                })
            }
        );

        if (!userResponse.ok) {
            throw new Error("Roblox user lookup failed");
        }

        const userData = await userResponse.json();
        const user = userData.data?.[0];

        if (!user) {
            return res.status(404).json({
                error: "Roblox user not found"
            });
        }

        // Get the user's avatar thumbnail
        let avatarUrl = null;

        try {
            const avatarResponse = await fetch(
                `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${user.id}&size=150x150&format=Png&isCircular=true`
            );

            if (avatarResponse.ok) {
                const avatarData = await avatarResponse.json();
                avatarUrl = avatarData.data?.[0]?.imageUrl || null;
            }
        } catch (error) {
            console.error("Avatar lookup failed:", error);
        }

        // Get public Roblox presence
        let presence = null;

        try {
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

            if (presenceResponse.ok) {
                const presenceData = await presenceResponse.json();
                presence = presenceData.userPresences?.[0] || null;
            }
        } catch (error) {
            console.error("Presence lookup failed:", error);
        }

        // Return only the public profile information needed by the site
        res.setHeader(
            "Cache-Control",
            "public, s-maxage=30, stale-while-revalidate=60"
        );

        return res.status(200).json({
            user: {
                id: user.id,
                name: user.name,
                displayName: user.displayName,
                avatarUrl
            },
            presence
        });

    } catch (error) {
        console.error("Roblox API error:", error);

        return res.status(502).json({
            error: "Unable to retrieve Roblox profile data"
        });
    }
}