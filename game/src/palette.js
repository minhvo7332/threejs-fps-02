// MERIDIAN PROTOCOL — palette. One dusk-foundry look for the whole game: cold
// concrete and steel, hazard orange for the objective, team blue vs ember red.
// Every colour the game or the HUD uses comes from here, so the scene reads as
// one place instead of a pile of boxes.
export const PALETTE = {
  canvas: '#0e141b', // sky / fog
  ground: '#232d36', // floor slabs
  groundAlt: '#1d262f', // alternating floor slabs
  wall: '#2c3944', // perimeter walls
  wallDark: '#222d37', // interior wall segments
  container: '#3a4a38', // green steel containers
  containerB: '#4a3b2c', // rust-brown containers
  crate: '#5a4a2e', // wooden crates
  crateB: '#3d4a55', // steel crates
  accent: '#ff7a1a', // hazard orange: sites, crosshair accents
  siteA: '#ffb020', // site A floor marking
  siteB: '#ff5a2a', // site B floor marking
  team: '#35a7ff', // Vanguard (player team)
  enemy: '#ff4d4d', // Hollow (enemy team)
  ink: '#eef2f5', // HUD text
  muted: '#8b98a5', // HUD secondary text
  panel: '#141c24', // HUD panels
  hairline: '#2e3a45', // HUD borders
  health: '#58d68d', // health bar
  money: '#ffd23e', // money readout
};

export function hex(name) {
  return PALETTE[name];
}
