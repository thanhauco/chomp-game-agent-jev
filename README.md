# Chomp Agent

A maze-chase game where the player is an agent that explains every move.

On each tile the agent publishes a small JSON document: which way it chose, how
likely it thought each legal move was to be the best one, and how confident it
was overall. You can watch it play, take over with the arrow keys, rewind to any
move and branch from there, pit two agents against each other, train your own
agent in the browser, or hand the controls to Claude through the API.

```json
{
  "answers": {
    "move": {
      "type": "choice",
      "choice": "up",
      "probabilities": {
        "up": 0.94,
        "down": 0.06
      },
      "confidence": 0.67
    }
  }
}
```

It is plain HTML, CSS and JavaScript: no build step, no framework, no runtime
dependencies. The Anthropic SDK is loaded from a CDN only when you choose the
Claude agent.

## Quick start

```bash
git clone https://github.com/thanhauco/chomp-game-agent-jev.git
cd chomp-game-agent-jev
python3 -m http.server 5173
```

Then open <http://localhost:5173>. `npm start` does the same with `npx serve`.
Opening `index.html` straight from disk also works for everything except the
Claude agent, which needs a real origin to call the API.

Run the tests (Node 18 or newer, no install needed):

```bash
npm test
```

## What you can do

| Tab | What it's for |
| --- | --- |
| **Play** | Watch an agent or play yourself. The panel shows the decision JSON for the move on screen, the probability and raw score of every legal move, and what happened (power pellet, lost life, and so on). |
| **Duel** | Two agents play the same maze from the same seed side by side, with a move cap and a verdict. |
| **Stats** | Calibration dashboard, visit and death heatmaps, and the leaderboard. |
| **Maze editor** | Paint your own maze, validate it, play it, and share it as a code or link. |
| **Train** | Train the Q-learning agent in the browser and watch its learning curve. |

### Features

1. **Model vs. model duels.** Same maze and seed, two agents, lockstep. The seed fixes the ghosts' dice, so differences come from the agents' choices.
2. **Claude as a player.** Paste an Anthropic API key and Claude plays. The page renders the board as text, asks for a structured JSON answer (move, per-move probabilities, one-sentence reason), and shows the reason and latency under the JSON.
3. **Reasoning overlay.** Tiles a ghost could reach within five moves are tinted red. A dashed line shows the path to the nearest pellet, and arrows around the chomper are sized by probability. Each move also gets a probability bar with its raw score.
4. **Replay export and import.** Download any game as JSON Lines, one decision per line. Importing replays the recorded choices from the seed and flags any move that disagrees with the file.
5. **Calibration dashboard.** A reliability diagram of "probability given to the chosen move" against "survived the next 10 moves", per agent, with an expected-calibration-error score and a table view.
6. **Heatmaps.** Where the chomper spends its time and where it gets caught, per maze. Overlay either map on the board, or compare both on the Stats tab.
7. **Maze editor.** Paint walls, pellets, power pellets, the ghost house and the start, with left-right mirroring and live validation. Share mazes as `CHOMP1.` codes or `#maze=` links.
8. **Leaderboard.** Every finished game is ranked, labeled human, agent or assisted (both moved in the same game). Filter by player type and by maze.
9. **Training in the browser.** Approximate Q-learning with eight features and epsilon-greedy exploration. You get a learning curve and a weights chart, and trained weights power the Q-learning agent.
10. **Sound and CRT mode.** Synthesized sound effects (no audio files) and an arcade look with outlined walls, scanlines and glow.

Plus the basics: rewind with the timeline, **Resume from this move** to branch
a new game from any point, four speeds, and a temperature slider that makes the
sampling agents greedier or more adventurous.

### Controls

| Input | Action |
| --- | --- |
| Arrow keys or WASD | Take control from the agent and steer (a turn is buffered until it's possible) |
| Swipe on the board | Same, on touch screens |
| Space | Pause or resume |
| Timeline | Scrub to any move, then **Play replay** or **Resume from this move** |

## The decision format

Every agent returns the same shape, which is what the panel prints and what
replay files store:

- `choice`: the move actually played (`up`, `down`, `left`, `right`, or `stay` when a human runs into a wall).
- `probabilities`: one entry per legal move, summing to 1.
- `confidence`: `1 - H(p) / ln(n)`, where `H` is the entropy of the probabilities and `n` the number of legal moves. It is 1 when the agent puts all its weight on one move and 0 when every move looks equally good. With `up: 0.94, down: 0.06` that gives 0.67, as in the example above.

## Agents

| Agent | How it decides |
| --- | --- |
| **BFS heuristic** | For each legal move, looks one tile ahead and runs a breadth-first search from there. It scores the move with a hand-tuned formula (food, distance to the nearest pellet, ghosts within 7 tiles, edible ghosts, turning back), converts scores to probabilities with a softmax at the chosen temperature, and samples. |
| **Q-learning** | The same look-ahead turned into eight features. Q(s, a) = w · f(s, a), learned by temporal-difference updates. Ships with pretrained weights. |
| **Claude (API)** | Sends an ASCII board plus ghost details to the Messages API and asks for a JSON-schema answer. |
| **Random walker** | Uniform over legal moves, mildly avoiding turning back. A floor for comparisons. |
| **You** | Keyboard or swipe. The BFS heuristic runs as an advisor, and the panel tells you when it would have gone another way. |

Average score over 20 held-out seeds (temperature 0.5, up to 3,000 moves each),
from `node scripts/pretrain.js 400 2026`:

| Agent | Mean score |
| --- | ---: |
| Q-learning (pretrained, 400 episodes) | 6,832 |
| BFS heuristic | 3,909 |
| Random walker | 680 |

### Using Claude

1. Choose **Claude (API)** in the Agent menu. The settings drawer opens.
2. Paste an Anthropic API key. It is kept in memory, or in this browser's localStorage if you tick **Remember the key on this device**. It is sent only to `api.anthropic.com`.
3. Choose a model: Claude Opus 5 (default), Claude Sonnet 5 or Claude Haiku 4.5. Then choose an effort level. Low is the fastest and the default.

Every move is one API request billed to your key. The game waits for each
answer, so Claude plays at the pace of the API rather than the speed setting.
Opus requests use the API's server-side refusal fallback
(`fallbacks: "default"`), so a request a safety classifier declines is retried
on a fallback model in the same call. If a request fails for any reason
(network, rate limit, bad key), the heuristic plays that move and the panel
says why.

This calls the API directly from the browser (`dangerouslyAllowBrowser`), which
is fine for a key you own on a page you run. Don't deploy it with a shared key
built in; put a small server in front of the API instead.

## Replay files

`.jsonl`, one JSON object per line:

```text
{"type":"header","format":"chomp-replay","version":1,"seed":2307884337,"lives":3,"maze":["###…"],"player":"agent","agent":"heuristic","moves":577,"score":2640,…}
{"type":"move","move":1,"by":"agent","agent":"heuristic","answers":{"move":{"type":"choice","choice":"left","probabilities":{"left":0.73,"right":0.27},"confidence":0.16}},"event":null,"score":10,"lives":3,"level":1,"pac":[8,15],"scores":{"left":10,"right":8.5}}
{"type":"ready","move":212,"event":"Ready"}
```

The engine is deterministic: the same seed and the same choices always produce
the same game. That is why a replay only needs the choices, and why import can
verify each line.

## Maze share codes

`CHOMP1.<width>x<height>.<data>`, where the data is the rows run-length encoded
(`#19` means nineteen walls) and then base64url encoded. Tiles:

| Tile | Meaning |
| --- | --- |
| `#` | Wall |
| `.` | Pellet (10 points) |
| `o` | Power pellet (50 points; ghosts become edible) |
| ` ` | Empty floor, e.g. the wrap-around tunnel |
| `-` | Ghost-house door (ghosts only) |
| `G` | Ghost-house floor; must be in the row right under the door |
| `P` | Chomper start |

Mazes can be 7 to 41 tiles in each direction. The validator explains anything
that would make a maze unplayable, such as unreachable pellets or a missing
door.

## What is stored, and where

Everything stays in your browser's localStorage under `chomp:` keys. Nothing is
uploaded.

| Key | Contents |
| --- | --- |
| `chomp:calibration` | Per-agent probability bins |
| `chomp:heatmap:<maze id>` | Visit and death counts per tile |
| `chomp:leaderboard` | Up to 200 finished games |
| `chomp:qweights` | Weights from browser training |
| `chomp:maze`, `chomp:editorRows` | Last custom maze played, editor draft |
| `chomp:claude` | Model, effort, and the API key only if you asked to remember it |
| `chomp:reasoning`, `chomp:heatmapMode`, `chomp:crt`, `chomp:sound`, `chomp:playerName` | Preferences |

Each Stats card has its own **Clear** link, and **Forget key** removes the
stored API key.

## Project layout

```text
index.html            page shell; loads scripts in dependency order
css/styles.css        design tokens (light, dark, CRT) and layout
js/core/              DOM-free: seeded RNG, storage, maze, engine, replay, calibration
js/agents/            decision format, heuristic, human, random, Claude, Q-learning
js/render/            canvas renderer, JSON panel
js/app/               session history and the app shell (loop, tabs, Play tab)
js/features/          one file per feature, each plugging into the app shell
scripts/pretrain.js   headless Q-learning run that produced the shipped weights
tests/                node:test suites for everything DOM-free
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for how the pieces fit together and how
to add an agent or a feature.

## Deploying

It is a static site. On GitHub: **Settings → Pages → Deploy from a branch →
`main` / root**. Any static host works the same way.

## License

[MIT](LICENSE)
