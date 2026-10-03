import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Smilefjeskartet",
    short_name: "Smilefjes",
    description: "Mattilsynets smilefjestilsyn for serveringssteder i Norge – på kart.",
    start_url: "/",
    display: "standalone",
    background_color: "#fff8ec",
    theme_color: "#fff8ec",
    lang: "nb",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
