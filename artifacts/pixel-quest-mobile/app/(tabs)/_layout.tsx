import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { Tabs } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { SymbolView } from 'expo-symbols';
import { useAuth } from '@clerk/expo';
import { Redirect } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { LoadingState } from '@/components/PixelUI';
import { RequireOnboarded } from '@/components/OnboardingGate';

// IMPORTANT: iOS 26 uses NativeTabs for native tabs with liquid glass support.
// Keep system liquid-glass behavior while tinting native controls with the account theme.
function NativeTabLayout() {
  const colors = useColors();
  return (
    <NativeTabs backgroundColor={colors.sidebar} tintColor={colors.cyan} iconColor={{ default: colors.mutedForeground, selected: colors.cyan }} labelStyle={{ default: { color: colors.mutedForeground }, selected: { color: colors.cyan } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} />
        <NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="habits">
        <NativeTabs.Trigger.Icon sf={{ default: 'checkmark.circle', selected: 'checkmark.circle.fill' }} />
        <NativeTabs.Trigger.Label>Habits</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="quests">
        <NativeTabs.Trigger.Icon sf={{ default: 'flag', selected: 'flag.fill' }} />
        <NativeTabs.Trigger.Label>Quests</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="rewards">
        <NativeTabs.Trigger.Icon sf={{ default: 'gift', selected: 'gift.fill' }} />
        <NativeTabs.Trigger.Label>Rewards</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Icon sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }} />
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const colors = useColors();
  const { tokens } = useTheme();
  const isDark = tokens.dark;
  const isIOS = Platform.OS === 'ios';
  const isWeb = Platform.OS === 'web';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarLabelStyle: { fontFamily: tokens.fontMap.DMSans_700Bold, fontSize: 11 },
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: isIOS ? 'transparent' : colors.background,
          borderTopWidth: tokens.border.panel,
          borderTopColor: colors.border,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={100}
              tint={isDark ? 'dark' : 'light'}
              style={StyleSheet.absoluteFill}
            />
          ) : isWeb ? (
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: colors.background },
              ]}
            />
          ) : null,
      }}
    >
      {([
        { name: 'index', title: 'Today', icon: 'home', symbol: 'house' },
        { name: 'habits', title: 'Habits', icon: 'check-square', symbol: 'checkmark.circle' },
        { name: 'quests', title: 'Quests', icon: 'flag', symbol: 'flag' },
        { name: 'rewards', title: 'Rewards', icon: 'gift', symbol: 'gift' },
        { name: 'profile', title: 'Profile', icon: 'user', symbol: 'person.crop.circle' },
      ] as const).map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ color }) =>
              isIOS ? (
                <SymbolView name={tab.symbol} tintColor={color} size={22} />
              ) : (
                <Feather
                  name={tab.icon}
                  size={21}
                  color={color}
                />
              ),
          }}
        />
      ))}
    </Tabs>
  );
}

export default function TabLayout() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <LoadingState label="Loading your save..." />;
  if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />;
  return <RequireOnboarded>{isLiquidGlassAvailable() ? <NativeTabLayout /> : <ClassicTabLayout />}</RequireOnboarded>;
}
