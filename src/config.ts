const config = {
  openrouterKey: process.env.OPENROUTER_API_KEY,
  baseUrl: 'https://openrouter.ai/api/v1',
  httpReferer: process.env.OPENROUTER_HTTP_REFERER,
  xTitle: process.env.OPENROUTER_X_TITLE,
  models: [
    'meta-llama/llama-3.1-70b-instruct'
  ],
  provider: {
    sort: {
      by: "throughput",
      partition: "none"
    }
  },
  temperature: 0.2,
  topK: 1,
  defaultImagePath: '',
  sendImageToLlm: false,
  maxAttempts: 3,
  baseRetryDelayMs: 2000,
};

export default config;