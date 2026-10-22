/** Models Croo can download and run itself. They live in the data folder, never inside the app. */
export interface LocalModel {
  id: string
  /** What the model calls itself (shown in the app and told to the model). */
  name: string
  blurb: string
  url: string
  file: string
  bytes: number
  sha256: string
  /** Below this much memory it will swap and crawl. */
  minRamGB: number
}

export const LOCAL_MODELS: LocalModel[] = [
  {
    id: 'qwen3-4b',
    name: 'Qwen3 4B Instruct',
    blurb: 'Fast, good at conversation and light coding. Runs well on any Apple Silicon Mac with 8 GB or more.',
    url: 'https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen3-4B-Instruct-2507-Q4_K_M.gguf',
    file: 'Qwen3-4B-Instruct-2507-Q4_K_M.gguf',
    bytes: 2_497_281_120,
    sha256: '3605803b982cb64aead44f6c1b2ae36e3acdb41d8e46c8a94c6533bc4c67e597',
    minRamGB: 8,
  },
]

export const localModel = (id: string) => LOCAL_MODELS.find((m) => m.id === id)
