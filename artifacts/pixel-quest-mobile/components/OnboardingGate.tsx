import type { ReactNode } from 'react';
import { useAuth } from '@clerk/expo';
import { getGetRpgStateQueryKey, useGetRpgState } from '@workspace/api-client-react';
import { View } from '@/components/Themed';
import { ErrorState, LoadingState } from '@/components/PixelUI';
import { useColors } from '@/hooks/useColors';

/** Server onboarding marker for the signed-in account; undefined until the live API answers. */
export function useOnboardingMarker() {
  const { isSignedIn } = useAuth();
  const q = useGetRpgState({ query: { queryKey: getGetRpgStateQueryKey(), enabled: !!isSignedIn } });
  const marker = q.data?.profile && typeof q.data.profile.hasCompletedOnboarding === 'boolean' ? q.data.profile.hasCompletedOnboarding : undefined;
  return { signedIn: !!isSignedIn, marker, isError: q.isError, refetch: () => void q.refetch() };
}

/**
 * Daily screens (tabs, settings, deep links) never mount until the server confirms setup is complete.
 * The root OnboardingGuard performs the redirect; this only withholds the screen.
 */
export function RequireOnboarded({ children }: { children: ReactNode }) {
  const colors = useColors();
  const { signedIn, marker, isError, refetch } = useOnboardingMarker();
  // Signed-out screens handle their own auth redirect; they expose no account data.
  if (!signedIn || marker === true) return <>{children}</>;
  return <View testID="onboarding-required" style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: colors.background }}>
    {isError && marker === undefined ? <ErrorState message="We couldn't confirm your save file." retry={refetch}/> : <LoadingState label="Loading your save..."/>}
  </View>;
}
