// /api/spotify-playlist.js
//
// Reads a PUBLIC Spotify playlist's tracklist using Spotify's Client
// Credentials flow (app-only auth — no user login, no 5-user cap).
//
// SETUP — in Vercel > Settings > Environment Variables, add:
//   SPOTIFY_CLIENT_ID
//   SPOTIFY_CLIENT_SECRET
// (both from developer.spotify.com/dashboard), then redeploy.
//
// Usage:
//   GET /api/spotify-playlist?url=<spotify playlist url>
//   -> { name, count, tracks: [{title, artist}, ...] }
//
// Add &debug=1 to get raw diagnostics when something goes wrong.
//
// NOTES ON SPOTIFY QUIRKS (learned the hard way):
//  * The `fields=` filter is unreliable — Spotify has deprecated parts of
//    it and it can silently return {} instead of data. We don't use it.
//  * `market=` is effectively required; without it many playlist items
//    come back with a null `track` object.
//  * Spotify-owned editorial/algorithmic playlists (Top 50, Discover
//    Weekly, Daily Mix, "Made For You", most 37i9dQZF... IDs) are blocked
//    from third-party API access and will 404 no matter what.

const MARKET = "US"; // any valid ISO country works; needed or tracks come back null

async function readErr(res) {
  try {
    const body = await res.json();
    return (body && body.error && (body.error.message || body.error)) || JSON.stringify(body).slice(0, 200);
  } catch (e) {
    try { return (await res.text()).slice(0, 200); } catch (e2) { return "(no body)"; }
  }
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");

  const url = req.query.url;
  const debug = req.query.debug === "1";

  if (!url || typeof url !== "string") {
    res.status(400).json({ error: "Missing ?url= parameter." });
    return;
  }

  const match = url.match(/playlist\/([a-zA-Z0-9]+)/);
  if (!match) {
    res.status(400).json({ error: "That doesn't look like a Spotify playlist link." });
    return;
  }
  const playlistId = match[1];

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    res.status(500).json({
      error: "Server is missing Spotify credentials. Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in Vercel's settings, then redeploy."
    });
    return;
  }

  try {
    // ---- 1. App-only access token -------------------------------------
    const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
      },
      body: "grant_type=client_credentials",
    });
    if (!tokenRes.ok) {
      res.status(502).json({
        error: "Couldn't authenticate with Spotify — double-check the Client ID and Secret.",
        detail: debug ? await readErr(tokenRes) : undefined,
      });
      return;
    }
    const { access_token: accessToken } = await tokenRes.json();
    const authHeader = { Authorization: `Bearer ${accessToken}` };

    // ---- 2. Playlist metadata (no `fields` — it's unreliable) ----------
    const metaRes = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistId}?market=${MARKET}`,
      { headers: authHeader }
    );
    if (metaRes.status === 404) {
      res.status(404).json({
        error: "Spotify returned 404. Either the playlist isn't public, or it's a Spotify-owned playlist (Top 50, Discover Weekly, Daily Mix, etc.) — those are blocked from API access. Try one of your own public playlists.",
        detail: debug ? await readErr(metaRes) : undefined,
      });
      return;
    }
    if (!metaRes.ok) {
      res.status(502).json({
        error: `Spotify couldn't return that playlist (HTTP ${metaRes.status}).`,
        detail: debug ? await readErr(metaRes) : undefined,
      });
      return;
    }
    const meta = await metaRes.json();
    const playlistName = meta.name || "Imported playlist";

    // ---- 3. Tracks, paginated -----------------------------------------
    const tracks = [];
    let nullTrackCount = 0;
    let nextUrl = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100&market=${MARKET}`;
    let pages = 0;
    let pageError = null;

    while (nextUrl && pages < 25) {
      const tRes = await fetch(nextUrl, { headers: authHeader });
      if (!tRes.ok) {
        // Don't silently swallow this — it's the difference between
        // "playlist is empty" and "Spotify rejected the request".
        pageError = `HTTP ${tRes.status}: ${await readErr(tRes)}`;
        break;
      }
      const tData = await tRes.json();
      const items = tData.items || [];
      for (const item of items) {
        const t = item && item.track;
        if (!t || !t.name) { nullTrackCount++; continue; } // local files, removed, or region-blocked
        tracks.push({
          title: t.name,
          artist: (t.artists || []).map((a) => a.name).join(", "),
        });
      }
      nextUrl = tData.next;
      pages++;
    }

    if (!tracks.length) {
      res.status(502).json({
        error: pageError
          ? `Spotify rejected the track request — ${pageError}`
          : `Found the playlist "${playlistName}", but no readable tracks came back${nullTrackCount ? ` (${nullTrackCount} items were local files or unavailable)` : ""}.`,
        name: playlistName,
        tracks: [],
        debug: debug ? { pages, nullTrackCount, pageError, totalReported: meta.tracks && meta.tracks.total } : undefined,
      });
      return;
    }

    res.status(200).json({
      name: playlistName,
      count: tracks.length,
      tracks,
      debug: debug ? { pages, nullTrackCount, totalReported: meta.tracks && meta.tracks.total } : undefined,
    });
  } catch (err) {
    res.status(500).json({
      error: "Something went wrong talking to Spotify.",
      detail: debug ? String(err && err.message || err) : undefined,
    });
  }
};
