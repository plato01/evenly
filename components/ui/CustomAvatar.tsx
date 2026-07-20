import React, { useEffect, useState } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { AvatarGlyph } from './AvatarGlyph';

interface CustomAvatarProps {
  name: string;
  uri?: string | null;
  size?: number;
  style?: ViewStyle;
  /** Fires when a photo uri fails to load and the buddy fallback kicks in. */
  onLoadError?: () => void;
}

/**
 * Avatar — photo via expo-image (proper downsampling + caching, so small
 * circles stay crisp). No photo, or the photo fails to load (e.g. a friend's
 * local-only URI), falls back to a procedural "blob buddy" character drawn
 * from the name — same person, same character everywhere.
 */
/** avatarUrl values like "glyph:Priya#3" pin a hand-picked buddy seed. */
const GLYPH_PREFIX = 'glyph:';
/** Retired bundled presets — saved URIs from the old picker render as buddies now. */
const LEGACY_PRESET = /(char|monster)_(ghost|zombie|lizard|reaper|alien|witch|devil|cyclops|yeti)/;

/** True for saved URIs from the retired preset picker that render as buddies. */
export const isLegacyPresetUri = (uri: string): boolean => LEGACY_PRESET.test(uri);

export const CustomAvatar: React.FC<CustomAvatarProps> = ({
  name,
  uri,
  size = 40,
  style,
  onLoadError,
}) => {
  const [failed, setFailed] = useState(false);

  // A new uri deserves a fresh attempt
  useEffect(() => setFailed(false), [uri]);

  const round = { width: size, height: size, borderRadius: size / 2 };

  if (uri?.startsWith(GLYPH_PREFIX)) {
    return (
      <View style={[styles.base, round, style]} accessibilityLabel={name}>
        <AvatarGlyph name={uri.slice(GLYPH_PREFIX.length)} size={size} />
      </View>
    );
  }

  if (uri && !LEGACY_PRESET.test(uri) && !failed) {
    return (
      <Image
        source={{ uri }}
        style={[styles.base, round, style as object]}
        contentFit="cover"
        transition={120}
        cachePolicy="memory-disk"
        onError={() => { setFailed(true); onLoadError?.(); }}
        accessibilityLabel={name}
      />
    );
  }

  return (
    <View style={[styles.base, round, style]} accessibilityLabel={name}>
      <AvatarGlyph name={name} size={size} />
    </View>
  );
};

const styles = StyleSheet.create({
  base: { overflow: 'hidden' },
});
