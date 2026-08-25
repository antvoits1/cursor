export type SearchHit = {
  title: string;
  url: string;
  snippet: string;
  source: "duckduckgo" | "bing" | "wikipedia";
};

export type ScrapedPage = SearchHit & {
  description: string;
  headings: string[];
  text: string;
  fields: { key: string; value: string }[];
  error?: string;
};
