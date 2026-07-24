const config = {
  openrouterKey: process.env.OPENROUTER_API_KEY,
  baseUrl: 'https://openrouter.ai/api/v1',
  httpReferer: process.env.OPENROUTER_HTTP_REFERER,
  xTitle: process.env.OPENROUTER_X_TITLE,
  models: [
    'google/gemma-4-26b-a4b-it:free',
  ],
  provider: {
    sort: {
      by: "throughput",
      partition: "none"
    }
  },
  temperature: 0.2,
  topK: 2,
};

export default config;