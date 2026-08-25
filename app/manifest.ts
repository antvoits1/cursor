import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Intelligence Extractor",
    short_name: "Extractor",
    description: "Search anything and scrape public people, phones, emails, and sources on the front page.",
    start_url: "/",
    display: "standalone",
    background_color: "#070605",
    theme_color: "#070605",
    icons: [
      {
        src: "/icon-32.png",
        sizes: "32x32",
        type: "image/png",
      },
    ],
  };
}
