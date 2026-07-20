const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Allow bundling .bin files (e.g. whisper model) as assets
if (!config.resolver.assetExts.includes('bin')) {
  config.resolver.assetExts.push('bin');
}
// Make sure .bin is NOT in sourceExts (it's a binary asset, not source code)
config.resolver.sourceExts = config.resolver.sourceExts.filter(ext => ext !== 'bin');

module.exports = config;
