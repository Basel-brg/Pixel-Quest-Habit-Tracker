import React, { useEffect, useRef, useState } from 'react';
import { ThemeProvider } from '@/lib/theme';
import { HabitRemindersProvider } from '@/lib/habit-reminders';
import { ClerkProvider, ClerkLoaded, ClerkLoading, useAuth } from '@clerk/expo';
import { ActivityIndicator, Pressable, View, Text } from 'react-native';
import { tokenCache } from '@clerk/expo/token-cache';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import { PressStart2P_400Regular } from '@expo-google-fonts/press-start-2p';
import { setBaseUrl, setAuthTokenGetter } from '@workspace/api-client-react';
import {
  useFonts,
} from '@expo-google-fonts/dm-sans';
import { Stack, useRootNavigationState, useRouter, useSegments } from 'expo-router';
import { getGetRpgStateQueryKey, useGetRpgState } from '@workspace/api-client-react';
import * as SplashScreen from 'expo-splash-screen';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();
const apiDomain = process.env.EXPO_PUBLIC_DOMAIN;
setBaseUrl(apiDomain ? `https://${apiDomain}` : null);

function RootLayoutNav() {
  const { userId, getToken } = useAuth();
  const previous = useRef<string | null | undefined>(undefined);
  const [tokenReady, setTokenReady] = useState(false);
  useEffect(() => {
    setAuthTokenGetter(() => getToken());
    setTokenReady(true);
    if (previous.current !== undefined && previous.current !== userId) queryClient.clear();
    previous.current = userId;
    return () => { setTokenReady(false); setAuthTokenGetter(null); };
  }, [userId, getToken]);
  return (
    <HabitRemindersProvider enabled={tokenReady}>
      <ThemeProvider key={userId ?? 'signed-out'} userId={userId} enabled={tokenReady && !!userId}>
      <Stack screenOptions={{ headerBackTitle: 'Back' }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
      </Stack>
      <OnboardingGuard enabled={tokenReady && !!userId} />
      </ThemeProvider>
    </HabitRemindersProvider>
  );
}

/**
 * Routes authenticated accounts by the server onboarding marker. Never touches (auth) routes,
 * waits for the root navigator, and blocks the app (loading/retry) while the marker is unresolved.
 */
function OnboardingGuard({ enabled }: { enabled: boolean }) {
  const segments = useSegments();
  const router = useRouter();
  const navReady = !!useRootNavigationState()?.key;
  const q = useGetRpgState({ query: { queryKey: getGetRpgStateQueryKey(), enabled } });
  const marker = q.data?.profile && typeof q.data.profile.hasCompletedOnboarding === 'boolean' ? q.data.profile.hasCompletedOnboarding : undefined;
  const area = segments[0] as string | undefined;
  const inAuth = area === '(auth)';
  const inOnboarding = area === 'onboarding';
  useEffect(() => {
    if (!enabled || !navReady || inAuth || marker === undefined) return;
    if (marker === false && !inOnboarding) router.replace('/onboarding');
    else if (marker === true && inOnboarding) router.replace('/(tabs)');
  }, [enabled, navReady, inAuth, inOnboarding, marker, router]);
  if (!enabled || inAuth || inOnboarding || marker === true) return null;
  // Unresolved (loading/offline/error) or pending redirect: cover app content.
  return <View testID="onboarding-guard" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#161727', alignItems: 'center', justifyContent: 'center', gap: 16, zIndex: 1000 }}>
    {q.isError && marker === undefined ? <>
      <Text style={{ color: '#f2ead8' }}>We couldn't confirm your save file.</Text>
      <Pressable testID="button-guard-retry" accessibilityRole="button" onPress={() => void q.refetch()} style={{ backgroundColor: '#f8d061', paddingHorizontal: 18, paddingVertical: 11 }}><Text style={{ color: '#161727', fontWeight: '700' }}>Try again</Text></Pressable>
    </> : <><ActivityIndicator color="#73e5e6"/><Text style={{ color: '#f2ead8' }}>Loading your save...</Text></>}
  </View>;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
    PressStart2P_400Regular,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <ClerkProvider publishableKey={process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!} tokenCache={tokenCache} proxyUrl={process.env.EXPO_PUBLIC_CLERK_PROXY_URL || undefined}>
      <ClerkLoading><View style={{flex:1,backgroundColor:'#161727',alignItems:'center',justifyContent:'center',gap:16}}><ActivityIndicator color="#73e5e6"/><Text style={{color:'#f2ead8'}}>Loading your save...</Text></View></ClerkLoading>
      <ClerkLoaded>
      <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <RootLayoutNav />
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
      </ClerkLoaded>
    </ClerkProvider>
  );
}
