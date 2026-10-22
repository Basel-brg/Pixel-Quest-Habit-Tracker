import { useState } from 'react';
import { Modal, ScrollView, StyleSheet} from 'react-native';
import { Pressable, Text, View } from "@/components/Themed";
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { getGetPixelQuestProfileQueryKey, getGetPixelQuestDashboardQueryKey, useGetPixelQuestProfile, useUpdatePixelQuestProfile, type AvatarId } from '@workspace/api-client-react';
import { PixelAvatar } from '@/components/PixelAvatar';
import { EmptyState, ErrorState, LoadingState, MetaText, Panel, PixelButton, PixelPage, ScreenTitle, SectionHeading } from '@/components/PixelUI';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/lib/theme';
import { themedLabel } from '@/constants/avatarArt';

export default function ProfileScreen() {
  const colors = useColors();
  const qc = useQueryClient();
  const theme = useTheme();
  const query = useGetPixelQuestProfile();
  const update = useUpdatePixelQuestProfile();
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [picker,setPicker] = useState(false);
  const refresh = () => { void qc.invalidateQueries({queryKey:getGetPixelQuestProfileQueryKey()}); void qc.invalidateQueries({queryKey:getGetPixelQuestDashboardQueryKey()}); };
  function save(data: {avatarId?:AvatarId}) {
    setError(''); setNotice('');
    update.mutate({data}, {onSuccess:()=>{refresh();setPicker(false);setNotice('Your adventurer profile is saved.');},onError:(failure)=>setError(failure.message || 'Profile could not be saved.')});
  }
  if(query.isLoading) return <PixelPage><LoadingState/></PixelPage>;
  if(query.isError || !query.data) return <PixelPage><ErrorState message="Your profile could not load." retry={()=>void query.refetch()}/></PixelPage>;
  const profile = query.data;
  const avatar = profile.avatars.find(item=>item.id===profile.avatarId);
  return <PixelPage keyboard>
    <ScreenTitle eyebrow="Adventurer dossier" title="Your profile" subtitle="A record of the discipline behind your progress."/>
    <Panel>
      <View style={styles.hero}><PixelAvatar id={profile.avatarId} size={112}/><View style={{flex:1,gap:8}}><Text style={[styles.title,{color:colors.gold}]}>{profile.username}</Text><Text style={[styles.copy,{color:colors.cyan}]}>Level {profile.level} · {avatar?themedLabel(theme.themeId,avatar.id,avatar).name:''}</Text><MetaText>{avatar?.description}</MetaText></View></View>
      <PixelButton label="Choose unlocked avatar" onPress={()=>{setError('');setPicker(true);}} tone="quiet" testID="profile-avatar-picker"/>
    </Panel>
    <View style={styles.grid}>{[
      ['Total XP',profile.xp],['Gold',profile.gold],['Tasks vanquished',profile.lifetimeTasksVanquished],['Best habit streak',`${profile.highestHabitStreak} days`],
    ].map(([label,value])=><Panel key={label} style={{width:'48%'}}><Text style={[styles.number,{color:colors.gold}]}>{value}</Text><MetaText>{label}</MetaText></Panel>)}</View>
    <Panel><SectionHeading title="Habit records"/>
      {profile.habitStreaks.length ? profile.habitStreaks.map(habit=><View key={habit.habitId} style={[styles.record,{borderColor:colors.border}]}><Text style={[styles.copy,{color:colors.foreground}]}>{habit.habitTitle}</Text><MetaText>Best {habit.highestStreak} days · Current {habit.currentStreak} days</MetaText></View>) : <EmptyState title="Your first streak awaits" detail="Complete a habit to begin building your record."/>}
    </Panel>
    <Panel><SectionHeading title="Milestone timeline"/>
      {profile.milestones.map(item=><View key={item.id} style={[styles.record,{borderColor:colors.border}]}><Text style={[styles.copy,{color:colors.gold}]}>{item.title}</Text><MetaText>{item.description}</MetaText><MetaText>{new Date(item.achievedAt).toLocaleDateString()}</MetaText></View>)}
    </Panel>
    {notice?<Text accessibilityRole="alert" style={{color:colors.success}}>{notice}</Text>:null}
    <PixelButton label="Settings: theme, name & log out" tone="quiet" testID="profile-open-settings" onPress={()=>router.push('/settings')}/>
    <Modal visible={picker} animationType="slide" onRequestClose={()=>setPicker(false)}>
      <SafeAreaView style={{flex:1,backgroundColor:colors.background}}><ScrollView contentContainerStyle={{padding:20,gap:15}}>
        <ScreenTitle title="Avatar collection" subtitle="Avatars unlock through XP earned from consistent habits and quests."/>
        {profile.avatars.map(item=><Pressable key={item.id} testID={`avatar-${item.id}`} disabled={!item.unlocked || update.isPending} onPress={()=>save({avatarId:item.id})} style={[styles.avatarCard,{borderColor:item.id===profile.avatarId?colors.gold:colors.border,backgroundColor:colors.card,opacity:item.unlocked?1:.55}]}><PixelAvatar id={item.id} size={80} locked={!item.unlocked}/><View style={{flex:1,gap:7}}><Text style={[styles.title,{color:colors.foreground}]}>{themedLabel(theme.themeId,item.id,item).name}</Text><MetaText>{item.description}</MetaText><Text style={{color:item.unlocked?colors.cyan:colors.mutedForeground}}>{item.unlocked ? item.id===profile.avatarId?'Selected':'Unlocked · tap to equip' : `Locked · Level ${item.requiredLevel}`}</Text></View>{!item.unlocked?<Feather name="lock" size={16} color={colors.mutedForeground}/>:null}</Pressable>)}
        {error?<Text style={{color:colors.destructive}}>{error}</Text>:null}
        <PixelButton label="Close collection" tone="quiet" onPress={()=>setPicker(false)} testID="avatar-close"/>
      </ScrollView></SafeAreaView>
    </Modal>
  </PixelPage>;
}
const styles = StyleSheet.create({
  hero:{flexDirection:'row',gap:17,alignItems:'center'},title:{fontFamily:'DMSans_700Bold',fontSize:19},copy:{fontFamily:'DMSans_600SemiBold',fontSize:14,lineHeight:21},grid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',gap:12},number:{fontFamily:'PressStart2P_400Regular',fontSize:16,lineHeight:25},record:{paddingVertical:12,borderBottomWidth:1,gap:6},avatarCard:{flexDirection:'row',alignItems:'center',borderWidth:2,padding:14,gap:14},
});
