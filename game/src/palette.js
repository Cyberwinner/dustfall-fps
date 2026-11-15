// The look plan, in one place. Dusk in a foundry yard: a cold indigo sky over
// rust and concrete, lit by amber sodium lamps, with one teal signal colour
// for the bomb sites. The same names are the CSS custom properties in index.html.
export const PALETTE = {
  sky: '#171a2b',
  fog: '#14161f',
  ground: '#2c303b',
  concrete: '#464b57',
  wall: '#4a4238',
  rust: '#6e4a33',
  rustDark: '#54382a',
  steel: '#5c6670',
  crate: '#7a5a40',
  crateDark: '#5d4630',
  ink: '#e8e2d4',
  muted: '#8a8f9d',
  amber: '#f5a623',
  amberDim: '#b97d1a',
  teal: '#3fb8a6',
  danger: '#e5484d',
  bot: '#c96a3b',
  botDark: '#7d3f22',
};

export function shade(name) {
  return PALETTE[name];
}
