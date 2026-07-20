import React from 'react';
import Svg, {
  Circle, ClipPath, Defs, Ellipse, G,
  LinearGradient, Line, Path, RadialGradient, Rect, Stop,
} from 'react-native-svg';
import { gradientFromString, hashStr } from '../../utils/formatters';

const BODY_COLORS = ['#FFFFFF', '#FFF4E6', '#EAF6FF', '#F3F0FF', '#EAFBF1', '#FFE9F0', '#FDF3D8', '#E6FBF7'];
const INK = '#252A38';
const BLUSH = '#FB7185';

// Deterministic scatter for the patterned backdrops — same seed, same layout.
function makeRng(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

interface Props {
  name: string;
  size: number;
}

/**
 * Procedural "blob buddy" avatar — a cute round-bodied character assembled
 * deterministically from the name hash: gradient backdrop, soft blob body,
 * eyes / mouth / accessory variants. Same name → same character everywhere,
 * ~2300 combos, pure vector so it stays crisp from 24px chips to share cards.
 */
export const AvatarGlyph: React.FC<Props> = ({ name, size }) => {
  const seed = hashStr(name || 'user');
  const [g1, g2] = gradientFromString(name || 'user');
  const body = BODY_COLORS[Math.floor(seed / 13) % BODY_COLORS.length];
  const eyes = seed % 6;
  const mouth = Math.floor(seed / 7) % 6;
  const acc = Math.floor(seed / 31) % 8;
  // Backdrop style is its own hash dimension: 0 gradient, 1 radial glow,
  // 2 confetti dots, 3 candy stripes, 4 sunburst, 5 bubbles, 6 night sky, 7 rings.
  const bg = Math.floor(seed / 97) % 8;
  const gid = `ag${g1.slice(1)}${g2.slice(1)}`;

  const bgDecor: React.ReactNode[] = [];
  if (bg === 2) {
    const r = makeRng(seed + 1);
    for (let i = 0; i < 14; i++) {
      const x = 6 + r() * 88, y = 4 + r() * 70, rad = 1.6 + r() * 2.6;
      bgDecor.push(<Circle key={`d${i}`} cx={x} cy={y} r={rad} fill="#FFFFFF" opacity={0.14 + r() * 0.16} />);
    }
  }
  if (bg === 3) {
    for (let i = -2; i < 8; i++) {
      bgDecor.push(<Rect key={`s${i}`} x={i * 20} y={-30} width={10} height={180} fill="#FFFFFF" opacity={0.1} transform="rotate(24 50 50)" />);
    }
  }
  if (bg === 4) {
    for (let i = 0; i < 12; i++) {
      const a = (i * 30 * Math.PI) / 180, a2 = ((i * 30 + 13) * Math.PI) / 180;
      const x1 = 50 + 90 * Math.cos(a), y1 = 62 + 90 * Math.sin(a);
      const x2 = 50 + 90 * Math.cos(a2), y2 = 62 + 90 * Math.sin(a2);
      bgDecor.push(<Path key={`r${i}`} d={`M50 62 L${x1} ${y1} L${x2} ${y2} Z`} fill="#FFFFFF" opacity={0.11} />);
    }
  }
  if (bg === 5) {
    const r = makeRng(seed + 7);
    for (let i = 0; i < 6; i++) {
      const x = 8 + r() * 84, y = 6 + r() * 60, rad = 4 + r() * 7;
      const op = 0.18 + r() * 0.15;
      bgDecor.push(<Circle key={`b${i}`} cx={x} cy={y} r={rad} fill="none" stroke="#FFFFFF" strokeWidth={1.6} opacity={op} />);
      bgDecor.push(<Circle key={`bh${i}`} cx={x - rad * 0.3} cy={y - rad * 0.35} r={rad * 0.22} fill="#FFFFFF" opacity={0.3} />);
    }
  }
  if (bg === 6) {
    const r = makeRng(seed + 13);
    for (let i = 0; i < 9; i++) {
      const x = 6 + r() * 88, y = 4 + r() * 58, s2 = 1.2 + r() * 2.2;
      if (r() > 0.5) {
        bgDecor.push(<Path key={`st${i}`} d={`M${x} ${y - s2 * 2} L${x + s2 * 0.6} ${y - s2 * 0.6} L${x + s2 * 2} ${y} L${x + s2 * 0.6} ${y + s2 * 0.6} L${x} ${y + s2 * 2} L${x - s2 * 0.6} ${y + s2 * 0.6} L${x - s2 * 2} ${y} L${x - s2 * 0.6} ${y - s2 * 0.6} Z`} fill="#FFFFFF" opacity={0.5 + r() * 0.4} />);
      } else {
        bgDecor.push(<Circle key={`st${i}`} cx={x} cy={y} r={s2 * 0.5} fill="#FFFFFF" opacity={0.4 + r() * 0.4} />);
      }
    }
  }
  if (bg === 7) {
    for (let i = 1; i <= 4; i++) {
      bgDecor.push(<Circle key={`ri${i}`} cx={50} cy={60} r={i * 16} fill="none" stroke="#FFFFFF" strokeWidth={3.5} opacity={0.16 - i * 0.02} />);
    }
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={g1} />
          <Stop offset="1" stopColor={g2} />
        </LinearGradient>
        {bg === 1 && (
          <RadialGradient id={`${gid}r`} cx="0.5" cy="0.38" r="0.75">
            <Stop offset="0" stopColor={g2} />
            <Stop offset="1" stopColor={g1} />
          </RadialGradient>
        )}
        {bg === 6 && (
          <LinearGradient id={`${gid}n`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={g1} />
            <Stop offset="1" stopColor={INK} />
          </LinearGradient>
        )}
        <ClipPath id={`${gid}c`}>
          <Circle cx="50" cy="50" r="50" />
        </ClipPath>
      </Defs>
      <G clipPath={`url(#${gid}c)`}>
        <Rect
          width="100"
          height="100"
          fill={bg === 1 ? `url(#${gid}r)` : bg === 6 ? `url(#${gid}n)` : `url(#${gid})`}
        />
        {bgDecor}

        {/* round ears sit behind the body */}
        {acc === 1 && (
          <>
            <Circle cx="29" cy="39" r="9" fill={body} />
            <Circle cx="71" cy="39" r="9" fill={body} />
          </>
        )}
        {/* bunny ears also live behind the body */}
        {acc === 7 && (
          <>
            <Ellipse cx="38" cy="26" rx="6.5" ry="15" fill={body} transform="rotate(-10 38 26)" />
            <Ellipse cx="62" cy="26" rx="6.5" ry="15" fill={body} transform="rotate(10 62 26)" />
            <Ellipse cx="38" cy="28" rx="3" ry="9" fill={BLUSH} opacity="0.35" transform="rotate(-10 38 28)" />
            <Ellipse cx="62" cy="28" rx="3" ry="9" fill={BLUSH} opacity="0.35" transform="rotate(10 62 28)" />
          </>
        )}

        {/* body */}
        <Rect x="20" y="38" width="60" height="70" rx="28" fill={body} />

        {/* accessories in front of the body */}
        {acc === 0 && (
          <>
            <Line x1="50" y1="38" x2="50" y2="27" stroke={INK} strokeWidth="3" strokeLinecap="round" />
            <Circle cx="50" cy="23" r="4.5" fill={BLUSH} />
          </>
        )}
        {acc === 2 && (
          <>
            <Path d="M34 42 L28 27 L42 36 Z" fill="#FBBF24" />
            <Path d="M66 42 L72 27 L58 36 Z" fill="#FBBF24" />
          </>
        )}
        {acc === 3 && (
          <>
            <Path d="M50 38 Q50 31 50 28" stroke="#059669" strokeWidth="3" strokeLinecap="round" fill="none" />
            <Ellipse cx="43" cy="25" rx="7" ry="4" fill="#34D399" transform="rotate(-28 43 25)" />
            <Ellipse cx="57" cy="25" rx="7" ry="4" fill="#10B981" transform="rotate(28 57 25)" />
          </>
        )}
        {acc === 4 && (
          <>
            <Path d="M26 52 A24 24 0 0 1 74 52" stroke={INK} strokeWidth="5" fill="none" strokeLinecap="round" />
            <Rect x="19" y="48" width="9" height="15" rx="4.5" fill={INK} />
            <Rect x="72" y="48" width="9" height="15" rx="4.5" fill={INK} />
          </>
        )}
        {acc === 5 && (
          <>
            <Path d="M37 37 L37 25 L43.5 31 L50 22 L56.5 31 L63 25 L63 37 Z" fill="#FBBF24" />
            <Circle cx="50" cy="22" r="2.2" fill="#F59E0B" />
          </>
        )}
        {acc === 6 && (
          <Path d="M50 38 Q48 30 54 27 Q59.5 24.5 58 30" stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none" />
        )}

        {/* eyes */}
        {eyes === 0 && (
          <>
            <Circle cx="38" cy="57" r="4.5" fill={INK} />
            <Circle cx="62" cy="57" r="4.5" fill={INK} />
            <Circle cx="39.5" cy="55.5" r="1.5" fill="#FFFFFF" />
            <Circle cx="63.5" cy="55.5" r="1.5" fill="#FFFFFF" />
          </>
        )}
        {eyes === 1 && (
          <>
            <Path d="M32 59 Q38 51 44 59" stroke={INK} strokeWidth="3.5" strokeLinecap="round" fill="none" />
            <Path d="M56 59 Q62 51 68 59" stroke={INK} strokeWidth="3.5" strokeLinecap="round" fill="none" />
          </>
        )}
        {eyes === 2 && (
          <>
            <Circle cx="38" cy="57" r="4.5" fill={INK} />
            <Path d="M56 58 Q62 52 68 58" stroke={INK} strokeWidth="3.5" strokeLinecap="round" fill="none" />
          </>
        )}
        {eyes === 3 && (
          <>
            <Circle cx="38" cy="57" r="7" stroke={INK} strokeWidth="2.5" fill="#FFFFFF" />
            <Circle cx="62" cy="57" r="7" stroke={INK} strokeWidth="2.5" fill="#FFFFFF" />
            <Line x1="45" y1="57" x2="55" y2="57" stroke={INK} strokeWidth="2.5" />
            <Circle cx="38" cy="57" r="2.5" fill={INK} />
            <Circle cx="62" cy="57" r="2.5" fill={INK} />
          </>
        )}
        {eyes === 4 && (
          <>
            <Path d="M32 56 Q38 61 44 56" stroke={INK} strokeWidth="3.5" strokeLinecap="round" fill="none" />
            <Path d="M56 56 Q62 61 68 56" stroke={INK} strokeWidth="3.5" strokeLinecap="round" fill="none" />
          </>
        )}
        {eyes === 5 && (
          <>
            <Path d="M38 50.5 L39.6 55.4 L44.5 57 L39.6 58.6 L38 63.5 L36.4 58.6 L31.5 57 L36.4 55.4 Z" fill={INK} />
            <Path d="M62 50.5 L63.6 55.4 L68.5 57 L63.6 58.6 L62 63.5 L60.4 58.6 L55.5 57 L60.4 55.4 Z" fill={INK} />
          </>
        )}

        {/* blush */}
        <Ellipse cx="31" cy="65" rx="4" ry="2.5" fill={BLUSH} opacity="0.45" />
        <Ellipse cx="69" cy="65" rx="4" ry="2.5" fill={BLUSH} opacity="0.45" />

        {/* mouth */}
        {mouth === 0 && (
          <Path d="M42 69 Q50 76 58 69" stroke={INK} strokeWidth="3.5" strokeLinecap="round" fill="none" />
        )}
        {mouth === 1 && (
          <>
            <Path d="M41 68 Q50 81 59 68 Z" fill={INK} />
            <Ellipse cx="50" cy="72.5" rx="3.5" ry="2" fill={BLUSH} />
          </>
        )}
        {mouth === 2 && <Circle cx="50" cy="70.5" r="3.5" fill={INK} />}
        {mouth === 3 && (
          <>
            <Path d="M43 69 Q46.5 73.5 50 69" stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none" />
            <Path d="M50 69 Q53.5 73.5 57 69" stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none" />
          </>
        )}
        {mouth === 4 && (
          <>
            <Path d="M42 68 Q50 75 58 68" stroke={INK} strokeWidth="3.5" strokeLinecap="round" fill="none" />
            <Path d="M46.5 70.5 L53.5 70.5 Q53.5 77 50 77 Q46.5 77 46.5 70.5 Z" fill={BLUSH} />
          </>
        )}
        {mouth === 5 && (
          <Path d="M43 71.5 Q51 75.5 57 68.5" stroke={INK} strokeWidth="3.5" strokeLinecap="round" fill="none" />
        )}
      </G>
    </Svg>
  );
};
