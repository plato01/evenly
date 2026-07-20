import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

const SUPABASE_URL  = process.env.EXPO_PUBLIC_SUPABASE_URL  ?? '';
const SUPABASE_ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/**
 * SecureStore adapter for Supabase session persistence.
 * Supabase calls this to save/load/delete the auth token securely on device.
 * Keys longer than 256 chars are chunked because SecureStore has a size limit.
 */
const secureStoreAdapter = {
  async getItem(key: string): Promise<string | null> {
    try {
      const chunks: string[] = [];
      let i = 0;
      while (true) {
        const chunk = await SecureStore.getItemAsync(`${key}_chunk_${i}`);
        if (chunk === null) break;
        chunks.push(chunk);
        i++;
      }
      return chunks.length > 0 ? chunks.join('') : null;
    } catch {
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    const CHUNK_SIZE = 2048;
    const chunks = [];
    for (let i = 0; i < value.length; i += CHUNK_SIZE) {
      chunks.push(value.slice(i, i + CHUNK_SIZE));
    }
    await Promise.all(
      chunks.map((chunk, i) =>
        SecureStore.setItemAsync(`${key}_chunk_${i}`, chunk)
      )
    );
  },

  async removeItem(key: string): Promise<void> {
    let i = 0;
    while (true) {
      const exists = await SecureStore.getItemAsync(`${key}_chunk_${i}`);
      if (exists === null) break;
      await SecureStore.deleteItemAsync(`${key}_chunk_${i}`);
      i++;
    }
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    storage:            secureStoreAdapter,
    autoRefreshToken:   true,
    persistSession:     true,
    detectSessionInUrl: false,   // Must be false for React Native
  },
});
