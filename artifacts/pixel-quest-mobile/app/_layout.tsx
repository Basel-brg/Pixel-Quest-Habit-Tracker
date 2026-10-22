import React, { useEffect, useRef, useState } from 'react';
import { ThemeProvider } from '@/lib/theme';
import { ClerkProvider, ClerkLoaded, ClerkLoading, useAuth } from '@clerk/expo';
import { ActivityIndicator, View, Text } from 'react-native';
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
import { Stack } from 'expo-router';
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
    <ThemeProvider key={userId ?? 'signed-out'} userId={userId} enabled={tokenReady && !!userId}>
      <Stack screenOptions={{ headerBackTitle: 'Back' }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ headerShown: false }} />
      </Stack>
    </ThemeProvider>
  );
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
