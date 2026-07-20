/**
 * Brand-accurate chain logos rendered with react-native-svg. Used by the
 * receiving-address chain pickers on the account and profile-setup screens.
 */

import React from 'react';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';

import type { ChainLogoKey } from './chains';

interface Props {
  logo: ChainLogoKey;
  size?: number;
  /** When true, render as a flat monochrome mark (e.g. on a selected/primary chip). */
  mono?: string;
}

export function ChainLogo({ logo, size = 16, mono }: Props) {
  switch (logo) {
    case 'monad':
      return (
        <Svg width={size} height={size} viewBox="0 0 122 122" fill="none">
          <Path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M61 6C78 6 116 44 116 61C116 78 78 116 61 116C44 116 6 78 6 61C6 44 44 6 61 6ZM61 33C52 33 33 52 33 61C33 70 52 89 61 89C70 89 89 70 89 61C89 52 70 33 61 33Z"
            fill={mono ?? '#836EF9'}
          />
        </Svg>
      );

    case 'ethereum':
      return (
        <Svg width={size} height={size} viewBox="0 0 256 417" fill="none">
          <Path d="M127.961 0 125.166 9.5v275.668l2.795 2.79 127.962-75.638z" fill={mono ?? '#343434'} />
          <Path d="M127.962 0 0 212.32l127.962 75.639V154.158z" fill={mono ?? '#8C8C8C'} />
          <Path d="M127.961 312.187l-1.575 1.92v98.199l1.575 4.6L256 236.587z" fill={mono ?? '#3C3C3B'} />
          <Path d="M127.962 416.905v-104.72L0 236.585z" fill={mono ?? '#8C8C8C'} />
          <Path d="m127.961 287.958 127.96-75.637-127.96-58.162z" fill={mono ?? '#141414'} />
          <Path d="M0 212.32l127.96 75.638v-133.8z" fill={mono ?? '#393939'} />
        </Svg>
      );

    case 'solana':
      return (
        <Svg width={size} height={size} viewBox="0 0 397.7 311.7" fill="none">
          <Defs>
            <LinearGradient id="sol" x1="360.879" y1="-37.455" x2="141.213" y2="383.294" gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor="#00FFA3" />
              <Stop offset="1" stopColor="#DC1FFF" />
            </LinearGradient>
          </Defs>
          <Path
            d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1z"
            fill={mono ?? 'url(#sol)'}
          />
          <Path
            d="M64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1z"
            fill={mono ?? 'url(#sol)'}
          />
          <Path
            d="M333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1z"
            fill={mono ?? 'url(#sol)'}
          />
        </Svg>
      );

    case 'polygon':
      return (
        <Svg width={size} height={size} viewBox="0 0 38.4 33.5" fill="none">
          <Path
            d="M29 10.2c-.7-.4-1.6-.4-2.4 0L21 13.5l-3.8 2.1-5.6 3.3c-.7.4-1.6.4-2.3 0l-4.4-2.6c-.7-.4-1.2-1.2-1.2-2.1V9.2c0-.8.4-1.6 1.2-2.1l4.3-2.5c.7-.4 1.6-.4 2.3 0L15.3 7c.7.4 1.2 1.2 1.2 2.1v3.3l3.8-2.2V6.9c0-.8-.4-1.6-1.2-2.1l-8-4.7c-.7-.4-1.6-.4-2.3 0L1.2 4.8C.4 5.2 0 6 0 6.8v9.4c0 .8.4 1.6 1.2 2.1l8.1 4.7c.7.4 1.6.4 2.3 0l5.6-3.2 3.8-2.2 5.6-3.2c.7-.4 1.6-.4 2.3 0l4.3 2.5c.7.4 1.2 1.2 1.2 2.1v5c0 .8-.4 1.6-1.2 2.1L31 32.6c-.7.4-1.6.4-2.3 0l-4.3-2.5c-.7-.4-1.2-1.2-1.2-2.1v-3.3l-3.8 2.2v3.3c0 .8.4 1.6 1.2 2.1l8.1 4.7c.7.4 1.6.4 2.3 0l8.1-4.7c.7-.4 1.2-1.2 1.2-2.1v-9.4c0-.8-.4-1.6-1.2-2.1z"
            fill={mono ?? '#8247E5'}
          />
        </Svg>
      );

    case 'base':
      return (
        <Svg width={size} height={size} viewBox="0 0 111 111" fill="none">
          <Path
            d="M54.921 110.034C85.359 110.034 110.034 85.402 110.034 55.017C110.034 24.632 85.359 0 54.921 0C26.043 0 2.353 22.171 0 50.4H72.847V59.634H0C2.353 87.863 26.043 110.034 54.921 110.034Z"
            fill={mono ?? '#0052FF'}
          />
        </Svg>
      );

    default:
      return null;
  }
}
