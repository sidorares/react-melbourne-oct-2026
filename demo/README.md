# react-x11 stress demo

A scripted trailer for [react-x11](https://github.com/sidorares/react-x11)
and [@react-x11/components](https://github.com/sidorares/react-x11-components):
every component in one native window, driven by a script, nothing recorded.
Title cards between shots, then a code editor edited mid-file, a
million-row table, a rich text editor, a kanban dragged about, a vector-tile
map flight, a flow graph re-wired, six pages of charts, markdown streamed, an
HTML magazine, video, a galaxy in 3D, a terminal flood, the smaller
components, and six scenes at once. Each shot's frames and dropped frames
are printed to the terminal, not drawn in the window.

## Running it

Needs a Mac (react-x11's native backend) or an X server, Bun 1.4 or Node
20.19+, `ffmpeg` on `PATH` for the video shot's clip, and a network the
first time, for the map's OpenStreetMap tiles.

```bash
npm install
npm run prefetch   # optional: fetch the map tiles and make the clip up front
npm start          # under Bun; `npm run start:node` under Node
```

It opens on the title and waits there, preparing its data, until you press
Start — or Return, Space, → or Page Down, which is what a presentation
clicker sends. `npm start -- --autostart` plays at once.

`main.tsx` lists every flag — `--only=map,flow`, `--from=charts`,
`--speed=0.5`, `--size=1920x1080`, `--loop`, `--exit`, `--snapshots=dir`
and the rest — and why each part of the trailer is built the way it is.

The map tiles are cached in the temp directory (`REACT_X11_MAPS_TILE_CACHE`
moves them), and the clip next to them, so a second run starts at once.
