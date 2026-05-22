# PSAT4U Rive Mascot

Place the production mascot file here:

```text
public/rive/psat-cat.riv
```

Expected Rive setup:

- Artboard: `PsatCat`
- State Machine: `CatState`
- Number inputs: `mood`, `level`
- Boolean input: `hasFood`
- Trigger inputs: `tap`, `feed`, `train`, `levelUp`, `checkIn`, `sleepy`

The app checks for `/rive/psat-cat.riv` at runtime. If the file is missing or fails to load, it falls back to the built-in Canvas cat so the UI remains usable offline.

`mascot-reference.png` is a generated visual direction reference for the final Rive mascot. Use it for silhouette, palette, and study-pet mood, not as a runtime asset.
