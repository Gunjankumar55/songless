# Songless

**Name the song from 0.2 seconds of it.**

A browser game built because a group of us were bored and wanted to know who
actually recognises the songs they claim to love. No app, no account, no
downloads — one page, one audio element, 1,760 songs.

[**Play it**](https://songlesss.vercel.app/) · [Mirror on GitHub Pages](https://gunjankumar55.github.io/songless/)

![HTML](https://img.shields.io/badge/HTML-single%20file-E34F26?style=flat-square&logo=html5&logoColor=white)
![CSS](https://img.shields.io/badge/CSS-handwritten-1572B6?style=flat-square&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-vanilla-F7DF1E?style=flat-square&logo=javascript&logoColor=black)
![Vercel](https://img.shields.io/badge/Deploy-Vercel-000000?style=flat-square&logo=vercel&logoColor=white)

---

## The idea

Music quizzes are either trivia nights, where you wait for the host, or apps
that want your Spotify login before they let you guess anything. We wanted the
opposite: press play, hear a fifth of a second, and find out whether you know
the song or you just know the chorus.

So the rule became unforgiving on purpose — the clip starts at **0.2 seconds**
and only grows when you fail.

## How it plays

| Attempt | Clip you hear |
| --- | --- |
| 1 | 0.2 s |
| 2 | 0.5 s |
| 3 | 2 s |
| 4 | 4 s |
| 5 | 8 s |
| 6 | 16 s |

- Press **play** (or **space**) to hear the current clip as many times as you like.
- Type to search; suggestions are limited to the crate you are playing, so a
  guess is always a song that is actually in the pool.
- Six attempts. A wrong guess moves you up a step; **Skip** burns one.
- Wrong guesses stay on screen, so you can see how close you were.
- Win or lose, the reveal shows the artwork and a **Hear it** button that plays
  the full preview.

Open **Players** to run a scoreboard for a room: add names, tap `+1` when
somebody gets it. It lives in memory, so it resets with the page.

## Crates

| Crate | Songs |
| --- | --- |
| Eng Pop Rap | 118 |
| Eng Mix | 604 |
| Punjabi | 76 |
| Hindi | 833 |
| Sad Songs | 198 |
| **All (deduplicated)** | **1,760** |

Plus any public Spotify playlist you import, which becomes a crate of its own.

## Import your own playlist

Paste a public Spotify playlist link and the game reads its tracklist, then
saves it to your browser as a new tab. It is a plain fetch to a serverless
function:

```
GET /api/spotify-playlist?url=<public playlist url>
-> { name, count, tracks: [{ title, artist }, ...] }
```

The function authenticates with Spotify's client-credentials flow (app-only, no
user login), pages through the tracks, and skips local files and
region-blocked items. Spotify-owned playlists — Top 50, Discover Weekly, Daily
Mix — are blocked from third-party API access and will always fail; your own
public playlists work.

Setup on Vercel: add `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` from the
[Spotify developer dashboard](https://developer.spotify.com/dashboard), then
redeploy. Append `&debug=1` to the request for raw diagnostics.

## How the audio works

The game hosts no audio. For each song it searches the public iTunes Search API
and uses the 30-second preview that comes back:

```
song title + artist
      |
iTunes Search API (limit 3)
      |
first result with a previewUrl
      |
<audio> -> seek to 0 -> play for the scheduled window
```

That keeps the repository text-only and the whole game in one file. The cost is
dependence on iTunes: if a track has no preview, the round moves on to the next
candidate, and if a whole crate has nothing playable the console says so instead
of hanging.

Replays are driven by a generation counter — every press invalidates the timers
and animation frames from the previous one, so spamming space restarts the clip
cleanly rather than letting a stale timeout blank the progress bar mid-play.

## Run it locally

```bash
# no build step, no dependencies
python -m http.server 8000
# open http://localhost:8000
```

Opening `index.html` directly also works for the game itself. Playlist import
does not, because it needs the `/api` function — use Vercel for that.

On Windows, `start index.html` is enough.

## Deploy

| Part | Host | Notes |
| --- | --- | --- |
| Page | Vercel (or GitHub Pages) | static `index.html` |
| `/api/spotify-playlist` | Vercel | Node serverless function |

The GitHub Pages mirror serves the page only; the import panel reports that the
API is missing, which is the intended behaviour.

## Project layout

```
index.html                the whole game: markup, theme, engine, data
api/spotify-playlist.js   public-playlist reader (Vercel serverless)
```

`songless.html` in the history is the first draft, replaced by `index.html` on
9 August 2026.

## Limits

- Previews are 30 seconds and depend on iTunes availability per region.
- The catalogue is hand-written; nothing validates that a title matches a real
  release, so an occasional lookup finds the wrong version or nothing at all.
- The visit counter is a free public counter — it counts page loads, not people,
  and falls back to a per-device number when the service is unreachable.
- Scores and imported playlists live in the browser, not on a server.

## Author

Gunjankumar Choudhari — [GitHub](https://github.com/Gunjankumar55)

## License

MIT
