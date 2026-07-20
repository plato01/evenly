import * as SecureStore from 'expo-secure-store';

/**
 * Thin async key-value wrapper around expo-secure-store.
 * Drop-in for the common get/set/remove pattern.
 */
export const storage = {
  get: (key: string) => SecureStore.getItemAsync(key),
  set: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  remove: (key: string) => SecureStore.deleteItemAsync(key),
};
