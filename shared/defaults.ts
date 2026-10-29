export interface DefaultImage {
  id: string;
  title: string;
  alt: string;
  url: string;
  width: number;
  height: number;
  accent: string;
}

export const DEFAULT_IMAGES: DefaultImage[] = [
  {
    id: "golden-hour",
    title: "Golden Hour",
    alt: "Layered hills and a still lake beneath a warm apricot sky",
    url: "/defaults/golden-hour.svg",
    width: 1600,
    height: 1000,
    accent: "#d89a67",
  },
  {
    id: "moonlit-garden",
    title: "Moonlit Garden",
    alt: "A pale moon above a dark garden of leaves and blossoms",
    url: "/defaults/moonlit-garden.svg",
    width: 1600,
    height: 1000,
    accent: "#8d7f9f",
  },
  {
    id: "the-long-road",
    title: "The Long Road",
    alt: "A winding coastal road between green cliffs and a blue sea",
    url: "/defaults/the-long-road.svg",
    width: 1600,
    height: 1000,
    accent: "#7f9b8d",
  },
  {
    id: "sunday-morning",
    title: "Sunday Morning",
    alt: "Two cups of coffee, a small vase of flowers and sunlight on a table",
    url: "/defaults/sunday-morning.svg",
    width: 1600,
    height: 1000,
    accent: "#c58c78",
  },
];

export function defaultImageById(id: string): DefaultImage | undefined {
  return DEFAULT_IMAGES.find((image) => image.id === id);
}
