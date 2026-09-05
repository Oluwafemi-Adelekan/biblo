/* The face you wear in Biblo. Thirty characters from the 3D pack
   Femi picked, each named in the house voice: palette words and
   things worth eating. */

export const AVATARS: { id: string; name: string }[] = [
  { id: "1", name: "Sunset" },
  { id: "2", name: "Melon" },
  { id: "3", name: "Pebble" },
  { id: "4", name: "Mango" },
  { id: "5", name: "Clover" },
  { id: "6", name: "Dumpling" },
  { id: "7", name: "Cocoa" },
  { id: "8", name: "Sprout" },
  { id: "9", name: "Tomato" },
  { id: "10", name: "Biscuit" },
  { id: "11", name: "Plum" },
  { id: "12", name: "Sunny" },
  { id: "13", name: "Olive" },
  { id: "14", name: "Berry" },
  { id: "15", name: "Pepper" },
  { id: "16", name: "Custard" },
  { id: "17", name: "Moss" },
  { id: "18", name: "Zobo" },
  { id: "19", name: "Agbalumo" },
  { id: "20", name: "Suya" },
  { id: "21", name: "Kola" },
  { id: "22", name: "Ginger" },
  { id: "23", name: "Tangerine" },
  { id: "24", name: "Coconut" },
  { id: "25", name: "Puff-puff" },
  { id: "26", name: "Chin-chin" },
  { id: "27", name: "Ube" },
  { id: "28", name: "Garri" },
  { id: "29", name: "Okra" },
  { id: "30", name: "Ember" },
];

export const avatarSrc = (id: string) => `/avatars/${id}.png`;

export const isAvatar = (id: string) => AVATARS.some((a) => a.id === id);

/* Each face gets a tile: quiet pastels a step off the app's ground,
   cycled so neighbours never match. Ink reads on every one. */
const TILES = [
  "oklch(0.87 0.08 84)", // amber
  "oklch(0.85 0.06 250)", // periwinkle
  "oklch(0.88 0.06 20)", // blush
  "oklch(0.86 0.07 150)", // mint
  "oklch(0.88 0.05 310)", // lilac
  "oklch(0.87 0.09 55)", // peach
];

export const avatarTile = (id: string) => {
  const i = AVATARS.findIndex((a) => a.id === id);
  return TILES[(i >= 0 ? i : 0) % TILES.length];
};

export const avatarName = (id: string) =>
  AVATARS.find((a) => a.id === id)?.name ?? "";
