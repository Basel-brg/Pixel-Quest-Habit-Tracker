import { useEffect, useState } from 'react';
import { Redirect, router, Stack } from 'expo-router';
import { useAuth, useClerk } from '@clerk/expo';
import { useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { getGetPixelQuestProfileQueryKey, getGetPixelQuestDashboardQueryKey, useGetPixelQuestProfile, useUpdatePixelQuestProfile } from '@workspace/api-client-react';
import { Pressable, Text, View } from '@/components/Themed';
import { ErrorState, Field, LoadingState, MetaText, Panel, PixelButton, PixelPage, ScreenTitle, SectionHeading } from '@/components/PixelUI';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/lib/theme';
import { THEME_IDS, THEMES } from '@/constants/themes';

export default function SettingsScreen() {
  const { isLoaded, isSignedIn } = useAuth();
  const colors = useColors();
  const qc = useQueryClient();
  const { signOut } = useClerk();
  const theme = useTheme();
  const query = useGetPixelQuestProfile();
  const update = useUpdatePixelQuestProfile();
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => { if (query.data) setUsername(query.data.username); }, [query.data?.username]);
  if (isLoaded && !isSignedIn) return <Redirect href="/(auth)/sign-in" />;
  const back = () => { if (router.canGoBack()) router.back(); else router.replace('/(tabs)/profile'); };
  const save = (data: { username: string }) => {
    setError(''); setNotice('');
    update.mutate({ data }, {
      onSuccess: () => { void qc.invalidateQueries({ queryKey: getGetPixelQuestProfileQueryKey() }); void qc.invalidateQueries({ queryKey: getGetPixelQuestDashboardQueryKey() }); setNotice('Your adventurer name is saved.'); },
      onError: (failure) => setError(failure.message || 'Profile could not be saved.'),
    });
  };
  const header = <Pressable accessibilityRole="button" accessibilityLabel="Back" testID="settings-back" onPress={back} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, alignSelf: 'flex-start' }}><Feather name="chevron-left" size={20} color={colors.cyan} /><Text style={{ color: colors.cyan, fontFamily: 'DMSans_700Bold', fontSize: 14 }}>Back</Text></Pressable>;
  if (query.isLoading) return <PixelPage><Stack.Screen options={{ headerShown: false }} />{header}<LoadingState /></PixelPage>;
  if (query.isError || !query.data) return <PixelPage><Stack.Screen options={{ headerShown: false }} />{header}<ErrorState message="Your settings could not load." retry={() => void query.refetch()} /></PixelPage>;
  return <PixelPage keyboard>
    <Stack.Screen options={{ headerShown: false }} />
    {header}
    <ScreenTitle eyebrow="Account" title="Settings" subtitle="Appearance, adventurer name and session." />
    <Panel><SectionHeading title="Theme"/>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:10}}>{THEME_IDS.map(id=>{const t=THEMES[id];const on=theme.themeId===id;return <Pressable key={id} testID={`theme-${id}`} accessibilityRole="radio" accessibilityState={{selected:on}} onPress={()=>theme.setTheme(id)} style={{width:'48%',padding:8,gap:6,borderWidth:2,borderColor:on?t.colors.primary:colors.border,backgroundColor:colors.card,borderRadius:t.radius.md}}>
        <View style={{backgroundColor:t.colors.background,borderRadius:t.radius.sm,padding:8,gap:6,borderWidth:t.border.control,borderColor:t.colors.border}}><View style={{height:6,backgroundColor:t.colors.muted,borderRadius:t.radius.pill?9:0}}><View style={{height:6,width:'65%',backgroundColor:t.colors.primary,borderRadius:t.radius.pill?9:0}}/></View><View style={{flexDirection:'row',gap:5}}><View style={{height:12,width:30,backgroundColor:t.colors.primary,borderRadius:t.radius.pill?9:t.radius.sm}}/><View style={{height:12,width:18,backgroundColor:t.colors.accent,borderRadius:t.radius.pill?9:t.radius.sm}}/></View></View>
        <Text style={{color:colors.foreground,fontSize:12,fontFamily:'DMSans_600SemiBold'}}>{on?'✓ ':''}{t.name}</Text><MetaText>{t.blurb}</MetaText></Pressable>;})}</View>
      <MetaText>{theme.saving?'Applied instantly. Syncing your latest choice...':'Synced to your account across web and mobile.'}</MetaText>
      {theme.error?<View style={{gap:8}}><Text accessibilityRole="alert" style={{color:colors.destructive}}>{theme.error}</Text><PixelButton label="Retry theme" tone="quiet" compact testID="theme-retry" onPress={theme.retry}/></View>:null}
    </Panel>
    <Panel><SectionHeading title="Player name"/><Field label="3–20 letters, numbers, or underscore" testID="profile-username" value={username} onChangeText={setUsername} autoCapitalize="none" maxLength={20}/>
      <PixelButton label={update.isPending?'Saving...':'Save username'} disabled={update.isPending} testID="profile-save-username" onPress={()=>{if(!/^[A-Za-z0-9_]{3,20}$/.test(username)){setError('Use 3–20 letters, numbers, or underscores.');return;}save({username});}}/>
      {error?<Text accessibilityRole="alert" style={{color:colors.destructive}}>{error}</Text>:null}
      {notice?<Text accessibilityRole="alert" style={{color:colors.success}}>{notice}</Text>:null}
    </Panel>
    <PixelButton label="Log out" tone="danger" testID="profile-logout" onPress={() => { qc.clear(); void signOut(); }} />
  </PixelPage>;
}
