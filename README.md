# ✦ Spark & the Map of Everywhere
An interactive **3D storybook** that teaches the big ideas of *Semantic Infrastructure*
to a curious ~10-year-old — using Three.js, point clouds, glowing particles, and a
friendly little guide named **Spark**.

## The twelve worlds

| # | World | Book chapter | Key idea |
|---|-------|-------------|----------|
| 1 | **The Big Idea** | Ch.1 | Paths matter more than things |
| 2 | **Boundaries** | Ch.2 | Inside / outside / depth |
| 3 | **Spherepop** | Ch.3–4 | Arithmetic by popping bubbles |
| 4 | **Gesture → Symbol** | Ch.10–13 | Wiggles freeze into letters |
| 5 | **Landscapes** | Ch.14 | Rolling into reachable valleys |
| 6 | **RSVP Fields** | Ch.18 | The Φ/v/S accessibility engine |
| 7 | **Cosmology** | Ch.19–20 | Universe settling into structure |
| 8 | **Finale** | All | Five windows, one idea |
| 9 | **Sheaf Theory** | Ch.17 | When stories can't all be true |
| 10 | **Logic Cube** | Ch.29 | AND/OR as lit corners of a hypercube |
| 11 | **CLIO** | Ch.15 | Constraints shrink the search cloud |
| 12 | **Yarncrawler** | Ch.26–28 | Repair agents keeping the network alive |

## Running

```bash
cd book
python3 -m http.server 8000
# open http://localhost:8000
```
Needs `http://` (not `file://`) for ES modules + Three.js CDN.

## Tech

- Three.js r160 via CDN (no build step)
- UnrealBloomPass for glow
- WebAudio API for zero-asset sound effects
- All scenes: additive point clouds + sprite glows
