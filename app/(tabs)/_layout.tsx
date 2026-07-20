import { withLayoutContext, router, usePathname } from 'expo-router';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import React, { useCallback, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, useWindowDimensions, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming,
  interpolateColor, useDerivedValue, Easing,
} from 'react-native-reanimated';

import * as Haptics from 'expo-haptics';

import Svg, { Circle, Path } from 'react-native-svg';
import { Colors } from '../../constants/colors';
import { useColors } from '../../hooks/useColors';
import { useFont } from '../../hooks/useFont';
import { useAppSelector } from '../../store';
import { useColorScheme } from 'react-native';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const SPRING = { damping: 18, stiffness: 220, mass: 0.8 };

function FriendsIcon({ size = 22, color = '#fff', filled = false }: { size?: number; color?: string; filled?: boolean }) {
  const sw = 1.5;
  if (filled) {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        {/* Left person: head + body */}
        <Circle cx="7.5" cy="4" r="2.5" fill={color} />
        <Path d="M4,22 L4,9.5 Q4,7 7.5,7 Q10.5,7 10.5,9.5 L10.5,22 Z" fill={color} />
        {/* Left outer raised arm */}
        <Path d="M5.5,7.5 L1,2" stroke={color} strokeWidth="2.8" strokeLinecap="round" fill="none" />
        {/* Left inner arm going down-right */}
        <Path d="M9.5,8.5 L13,16" stroke={color} strokeWidth="2.8" strokeLinecap="round" fill="none" />
        {/* Right person: head + body */}
        <Circle cx="16.5" cy="4" r="2.5" fill={color} />
        <Path d="M13.5,22 L13.5,9.5 Q13.5,7 16.5,7 Q20,7 20,9.5 L20,22 Z" fill={color} />
        {/* Right outer raised arm */}
        <Path d="M18.5,7.5 L23,2" stroke={color} strokeWidth="2.8" strokeLinecap="round" fill="none" />
        {/* Right inner arm going down-left */}
        <Path d="M14.5,8.5 L11,16" stroke={color} strokeWidth="2.8" strokeLinecap="round" fill="none" />
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {/* Left person */}
      <Circle cx="7.5" cy="4" r="2.5" stroke={color} strokeWidth={sw} fill="none" />
      <Path d="M4,22 L4,9.5 Q4,7 7.5,7 Q10.5,7 10.5,9.5 L10.5,22 Z" stroke={color} strokeWidth={sw} fill="none" />
      <Path d="M5.5,7.5 L1,2" stroke={color} strokeWidth={sw} strokeLinecap="round" fill="none" />
      <Path d="M9.5,8.5 L13,16" stroke={color} strokeWidth={sw} strokeLinecap="round" fill="none" />
      {/* Right person */}
      <Circle cx="16.5" cy="4" r="2.5" stroke={color} strokeWidth={sw} fill="none" />
      <Path d="M13.5,22 L13.5,9.5 Q13.5,7 16.5,7 Q20,7 20,9.5 L20,22 Z" stroke={color} strokeWidth={sw} fill="none" />
      <Path d="M18.5,7.5 L23,2" stroke={color} strokeWidth={sw} strokeLinecap="round" fill="none" />
      <Path d="M14.5,8.5 L11,16" stroke={color} strokeWidth={sw} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

// ─── Create material top tabs navigator via expo-router ─────────────────────
const { Navigator } = createMaterialTopTabNavigator();
const MaterialTopTabs = withLayoutContext<
  React.ComponentProps<typeof Navigator>,
  typeof Navigator,
  any,
  any
>(Navigator);

// ─── Tab definitions ────────────────────────────────────────────────────────
interface TabDef {
  key: string;
  label: string;
  icon: IoniconName;
  focusedIcon: IoniconName;
  size?: number;
  renderIcon?: (opts: { size: number; color: string; focused: boolean }) => React.ReactNode;
}

interface TabItemProps {
  tab: TabDef;
  isActive: boolean;
  onPress: () => void;
  isDark: boolean;
  font: any;
  width: number;
}

const TABS: TabDef[] = [
  { key: 'index',    label: 'Home',    icon: 'grid-outline',    focusedIcon: 'grid' },
  { key: 'personal', label: 'Wallet',  icon: 'wallet-outline',  focusedIcon: 'wallet' },
  { key: 'circles',  label: 'Circles', icon: 'people-outline', focusedIcon: 'people',
    renderIcon: ({ size, color, focused }) => <FriendsIcon size={size - 2} color={color} filled={focused} /> },
  { key: 'account',  label: 'Profile', icon: 'person-outline',  focusedIcon: 'person' },
];

// ─── Animated Tab Item ──────────────────────────────────────────────────────
function TabItem({ tab, isActive, onPress, isDark, font, width }: TabItemProps) {
  const progress = useSharedValue(isActive ? 1 : 0);

  useEffect(() => {
    progress.value = withSpring(isActive ? 1 : 0, SPRING);
  }, [isActive]);

  const colors = useColors();
  const activeColor = colors.primary;
  const inactiveColor = isDark ? 'rgba(255,255,255,0.35)' : 'rgba(100,116,139,0.7)';

  const iconColor = useDerivedValue(() =>
    interpolateColor(progress.value, [0, 1], [inactiveColor, activeColor])
  );

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + progress.value * 0.1 }],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    opacity: 0.5 + progress.value * 0.5,
    transform: [{ translateY: progress.value * -1 }],
  }));

  const pillStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scaleX: progress.value }],
  }));

  return (
    <TouchableOpacity style={[ts.tabItem, { width }]} onPress={onPress} activeOpacity={0.6}>
      <Animated.View style={iconStyle}>
        {tab.renderIcon
          ? tab.renderIcon({ size: tab.size ?? 22, color: isActive ? activeColor : inactiveColor, focused: isActive })
          : <Ionicons name={isActive ? tab.focusedIcon : tab.icon} size={tab.size ?? 22} color={isActive ? activeColor : inactiveColor} />
        }
      </Animated.View>
      <Animated.View style={[ts.tabLabelWrap, labelStyle]}>
        <Animated.Text
          numberOfLines={1}
          style={[
            ts.tabLabel,
            {
              fontFamily: isActive ? font.semiBold : font.medium,
              color: isActive ? activeColor : inactiveColor,
            },
          ]}
        >
          {tab.label}
        </Animated.Text>
      </Animated.View>
      <Animated.View style={[ts.activePill, { backgroundColor: activeColor, position: 'absolute', bottom: 6 }, pillStyle]} />
    </TouchableOpacity>
  );
}

// ─── Custom bottom tab bar (lives OUTSIDE the navigator to escape overflow:hidden) ──
function FloatingTabBar() {
  const font = useFont();
  const colors = useColors();
  const themeMode = useAppSelector((s) => s.ui.themeMode);
  const deviceScheme = useColorScheme();
  const isDark =
    themeMode === 'dark' || themeMode === 'midnight' ||
    (themeMode === 'system' && deviceScheme === 'dark');
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const pathname = usePathname();

  // 32 = pill marginHorizontal (16*2), 12 = pill paddingHorizontal (6*2), 56 = addBtn + margins
  const tabWidth = Math.floor((screenWidth - 32 - 12 - 56) / 4);

  const routeKeys = ['index', 'personal', 'circles', 'account'];
  const activeRouteIndex = (() => {
    const seg = pathname.split('/').filter(Boolean).pop() ?? 'index';
    const i = routeKeys.indexOf(seg);
    return i >= 0 ? i : 0;
  })();

  const addBtnScale = useSharedValue(1);
  const addBtnRotate = useSharedValue(0);

  const handleTabPress = useCallback((routeIndex: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const key = routeKeys[routeIndex];
    router.push(key === 'index' ? '/(tabs)/' : `/(tabs)/${key}` as any);
  }, []);

  const handleAddPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    addBtnScale.value = withSpring(0.85, { damping: 6, stiffness: 300 });
    addBtnRotate.value = withSpring(90, { damping: 12, stiffness: 200 });
    setTimeout(() => {
      addBtnScale.value = withSpring(1, SPRING);
      addBtnRotate.value = withSpring(0, SPRING);
    }, 150);
    router.push('/expense/add');
  }, []);

  const addBtnStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: addBtnScale.value },
      { rotate: `${addBtnRotate.value}deg` },
    ],
  }));

  const tabBarBg = colors.card;
  const tabBarBorder = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.07)';

  return (
    <View style={[ts.barContainer, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View style={[ts.tabBar, { backgroundColor: tabBarBg, borderColor: tabBarBorder }]}>
        <TabItem tab={TABS[0]} isActive={activeRouteIndex === 0} onPress={() => handleTabPress(0)} isDark={isDark} font={font} width={tabWidth} />
        <TabItem tab={TABS[1]} isActive={activeRouteIndex === 1} onPress={() => handleTabPress(1)} isDark={isDark} font={font} width={tabWidth} />
        <View style={ts.addWrap}>
          <TouchableOpacity onPress={handleAddPress} activeOpacity={0.8}>
            <Animated.View style={[ts.addBtn, { backgroundColor: colors.primary }, addBtnStyle]}>
              <Ionicons name="add" size={28} color="#FFFFFF" />
            </Animated.View>
          </TouchableOpacity>
        </View>
        <TabItem tab={TABS[2]} isActive={activeRouteIndex === 2} onPress={() => handleTabPress(2)} isDark={isDark} font={font} width={tabWidth} />
        <TabItem tab={TABS[3]} isActive={activeRouteIndex === 3} onPress={() => handleTabPress(3)} isDark={isDark} font={font} width={tabWidth} />
      </View>
    </View>
  );
}

// ─── Main layout ────────────────────────────────────────────────────────────
export default function TabLayout() {
  return (
    <View style={{ flex: 1 }}>
      <MaterialTopTabs
        tabBarPosition="bottom"
        tabBar={() => null}
        screenOptions={{
          lazy: true,
          swipeEnabled: true,
          animationEnabled: true,
          sceneStyle: { backgroundColor: '#0B0D12' },
          }}
      >
        <MaterialTopTabs.Screen name="index"    />
        <MaterialTopTabs.Screen name="personal" />
        <MaterialTopTabs.Screen name="circles"  />
        <MaterialTopTabs.Screen name="account"  />
      </MaterialTopTabs>
      <FloatingTabBar />
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const ts = StyleSheet.create({
  barContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'transparent',
  },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 68,
    marginHorizontal: 16,
    borderRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 6,
    // shadow (iOS)
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    // shadow (Android)
    elevation: 20,
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 8,
  },
  tabLabelWrap: {
    alignSelf: 'stretch',
  },
  tabLabel: {
    fontSize: 10,
    textAlign: 'center',
  },
  activePill: {
    width: 20,
    height: 3,
    borderRadius: 1.5,
    marginTop: 2,
  },
  addWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
  },
  addBtn: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
