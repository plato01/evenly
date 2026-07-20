import { initWhisper } from 'whisper.rn';
import type { WhisperContext } from 'whisper.rn';
import { File, Paths } from 'expo-file-system/next';

const MODEL_FILENAME = 'ggml-tiny.bin';
const MODEL_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin';

let whisperCtx: WhisperContext | null = null;
let modelReady = false;
let downloading = false;

/** Check if model exists on disk */
function isModelDownloaded(): boolean {
  const file = new File(Paths.document, MODEL_FILENAME);
  return file.exists && file.size > 1_000_000;
}

/** Download model silently in background — call on app start */
export async function preloadWhisperModel(): Promise<void> {
  if (isModelDownloaded() || downloading) return;

  downloading = true;
  try {
    const file = new File(Paths.document, MODEL_FILENAME);
    const response = await fetch(MODEL_URL);
    if (!response.ok) return;

    const reader = response.body?.getReader();
    if (!reader) return;

    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.byteLength;
    }

    const combined = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    file.write(combined);
  } catch {
    // Silent failure — user can still use the app without voice
  } finally {
    downloading = false;
  }
}

/** Get the local file path of the model */
function getModelPath(): string {
  const file = new File(Paths.document, MODEL_FILENAME);
  return file.uri;
}

/** Initialize the Whisper context */
export async function getWhisperContext(): Promise<WhisperContext> {
  if (whisperCtx && modelReady) return whisperCtx;

  if (!isModelDownloaded()) {
    await preloadWhisperModel();
    if (!isModelDownloaded()) throw new Error('Voice model not available yet. Please try again in a moment.');
  }

  const modelPath = getModelPath();
  whisperCtx = await initWhisper({ filePath: modelPath });
  modelReady = true;
  return whisperCtx;
}

/** Check if model is ready */
export function isWhisperReady(): boolean {
  return modelReady || isModelDownloaded();
}

/** Release whisper context to free memory */
export async function releaseWhisper(): Promise<void> {
  if (whisperCtx) {
    await whisperCtx.release();
    whisperCtx = null;
    modelReady = false;
  }
}
