import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AA Extractor",
    short_name: "AA Extractor",
    description: "Extract text and data from documents on the front page.",
    start_url: "/",
    display: "standalone",
    background_color: "#07090f",
    theme_color: "#07090f",
    icons: [
      {
        src: "/icon-32.png",
        sizes: "32x32",
        type: "image/png",
      },
    ],
  };
}
