import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useGetRewards, useGetHabits, useGetPixelQuestDashboard, useCreateReward, useUpdateReward, useDeleteReward, useClaimReward, getGetRewardsQueryKey, getGetPixelQuestDashboardQueryKey, getGetPixelQuestProfileQueryKey, type Reward, type RewardInput, type RewardRuleType } from '@workspace/api-client-react';
import { ChoiceChip, EmptyState, ErrorState, Field, LoadingState, MetaText, Panel, PixelBar, PixelButton, PixelPage, ScreenTitle, SectionHeading } from '@/components/PixelUI';
import { useColors } from '@/hooks/useColors';

export default function RewardsScreen() {
  const colors = useColors(), qc = useQueryClient();
  const query = useGetRewards(), habits = useGetHabits({archived:false}), dashboard = useGetPixelQuestDashboard();
  const create = useCreateReward(), update = useUpdateReward(), remove = useDeleteReward(), claim = useClaimReward();
  const [history,setHistory] = useState(false), [form,setForm] = useState(false), [editing,setEditing] = useState<number|null>(null);
  const [title,setTitle] = useState(''), [description,setDescription] = useState(''), [category,setCategory] = useState('Personal');
  const [rule,setRule] = useState<RewardRuleType>('gold'), [target,setTarget] = useState('500'), [habitId,setHabitId] = useState<number|null>(null);
  const [error,setError] = useState(''), [notice,setNotice] = useState(''), [deleting,setDeleting] = useState<number|null>(null), [celebrating,setCelebrating] = useState(false), [muted,setMuted] = useState(false);
  const previous = useRef<Map<number,string>|null>(null), motion = useRef(new Animated.Value(0)).current;
  const player = useAudioPlayer(require('../../assets/audio/treasure.wav'));
  useEffect(()=>{void AsyncStorage.getItem('pixelquest-reward-muted').then(value=>setMuted(value==='true'));},[]);
  useFocusEffect(useCallback(()=>{void query.refetch();void dashboard.refetch();},[]));
  const refresh = () => {
    void qc.invalidateQueries({queryKey:getGetRewardsQueryKey()});
    void qc.invalidateQueries({queryKey:getGetPixelQuestDashboardQueryKey()});
    void qc.invalidateQueries({queryKey:getGetPixelQuestProfileQueryKey()});
  };
  const celebrate = useCallback(()=>{
    setNotice('READY TO BUY IN REAL LIFE!');
    if(!muted) { void player.seekTo(0).then(()=>player.play()).catch(()=>{}); }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(()=>{});
    void AccessibilityInfo.isReduceMotionEnabled().then(reduced=>{
      if(reduced) return;
      setCelebrating(true); motion.setValue(0);
      Animated.timing(motion,{toValue:1,duration:1600,useNativeDriver:true}).start(()=>setCelebrating(false));
    });
  },[muted,player,motion]);
  useEffect(()=>{
    if(!query.data) return;
    if(previous.current && query.data.some(item=>item.status==='ready' && previous.current?.get(item.id)==='locked')) celebrate();
    previous.current = new Map(query.data.map(item=>[item.id,item.status]));
  },[query.data,celebrate]);
  function open(reward?:Reward) {
    setEditing(reward?.id??null);setTitle(reward?.title??'');setDescription(reward?.description??'');setCategory(reward?.category??'Personal');setRule(reward?.ruleType??'gold');setTarget(String(reward?.target??500));setHabitId(reward?.habitId??null);setError('');setForm(true);
  }
  function save() {
    const amount=Number(target);
    if(!title.trim() || !category.trim() || !Number.isInteger(amount) || amount<1 || amount>1000000 || (rule==='streak'&&!habitId)) {setError('Add a title, category, positive whole-number target, and a habit for streak rewards.');return;}
    if((rule==='level'&&amount>100)||(rule==='streak'&&amount>3650)){setError(rule==='level'?'Level targets cannot exceed 100.':'Streak targets cannot exceed 3,650 days.');return;}
    const data:RewardInput={title:title.trim(),description,category:category.trim(),ruleType:rule,target:amount,habitId:rule==='streak'?habitId:null};
    const options={onSuccess:()=>{setForm(false);setNotice('Reward saved. Keep earning your unlock.');refresh();},onError:(failure:Error)=>setError(failure.message)};
    if(editing) update.mutate({rewardId:editing,data},options); else create.mutate({data},options);
  }
  if(query.isLoading) return <PixelPage><LoadingState/></PixelPage>;
  if(query.isError) return <PixelPage><ErrorState message="The reward shop could not load." retry={()=>void query.refetch()}/></PixelPage>;
  const rewards=(query.data??[]).filter(item=>history?item.status==='claimed':item.status!=='claimed');
  return <PixelPage keyboard>
    <ScreenTitle eyebrow="Goal-locked real rewards" title="Reward shop" subtitle="Earn the real-life things you want through discipline."/>
    <Panel><View style={styles.row}><View><Text style={[styles.gold,{color:colors.gold}]}>{dashboard.data?.profile.gold??0} GOLD</Text><MetaText>Earn Gold alongside XP. Spend it only when claiming.</MetaText></View></View>
      <PixelButton label="Add real-life reward" onPress={()=>open()} testID="reward-add"/>
      <PixelButton label={muted?'Fanfare: off':'Fanfare: on'} tone="quiet" onPress={()=>setMuted(value=>{void AsyncStorage.setItem('pixelquest-reward-muted',String(!value));return !value;})} testID="reward-audio"/>
    </Panel>
    {form?<Panel><SectionHeading title={editing?'Edit reward':'Add reward'}/>
      <Field label="What do you want to earn?" value={title} onChangeText={setTitle} maxLength={120} testID="reward-title"/>
      <Field label="Description (optional)" value={description} onChangeText={setDescription} maxLength={300} multiline testID="reward-description"/>
      <Field label="Category" value={category} onChangeText={setCategory} maxLength={40} testID="reward-category"/>
      <MetaText>Choose one discipline gate</MetaText>
      <View style={styles.wrap}>{(['streak','gold','level'] as const).map(value=><ChoiceChip key={value} label={value==='streak'?'Habit streak':value==='gold'?'Gold cost':'Player level'} selected={rule===value} onPress={()=>setRule(value)} testID={`reward-rule-${value}`}/>)}</View>
      <Field label={rule==='streak'?'Consecutive days':rule==='gold'?'Gold cost':'Required level'} value={target} onChangeText={setTarget} keyboardType="number-pad" testID="reward-target"/>
      {rule==='streak'?<View style={styles.wrap}>{habits.data?.length ? habits.data.map(habit=><ChoiceChip key={habit.id} label={habit.title} selected={habitId===habit.id} onPress={()=>setHabitId(habit.id)} testID={`reward-habit-${habit.id}`}/>):<MetaText>Create an active habit first.</MetaText>}</View>:null}
      {error?<Text accessibilityRole="alert" style={{color:colors.destructive}}>{error}</Text>:null}
      <PixelButton label={create.isPending||update.isPending?'Saving...':'Save reward'} disabled={create.isPending||update.isPending} onPress={save} testID="reward-save"/>
      <PixelButton label="Cancel" tone="quiet" onPress={()=>setForm(false)} testID="reward-cancel"/>
    </Panel>:null}
    {notice?<Panel><Text accessibilityRole="alert" style={{color:colors.cyan}}>{notice}</Text></Panel>:null}
    {!form&&error?<Text style={{color:colors.destructive}}>{error}</Text>:null}
    <View style={styles.wrap}><ChoiceChip label="Marketplace" selected={!history} onPress={()=>setHistory(false)} testID="reward-shop-tab"/><ChoiceChip label="Trophy history" selected={history} onPress={()=>setHistory(true)} testID="reward-history-tab"/></View>
    {rewards.length?rewards.map(reward=><Panel key={reward.id} style={{opacity:reward.status==='locked'?.72:1,borderColor:reward.status==='ready'?colors.gold:colors.border}}>
      <View style={styles.row}><Feather name={reward.status==='locked'?'lock':reward.status==='claimed'?'award':'gift'} color={reward.status==='ready'?colors.gold:colors.cyan} size={25}/><View style={{flex:1,gap:5}}><Text style={[styles.title,{color:colors.foreground}]}>{reward.title}</Text><MetaText>{reward.category} · {reward.ruleType==='streak'?reward.habitTitle:reward.ruleType==='gold'?'Gold reward':'Level reward'}</MetaText></View></View>
      {reward.description?<Text style={[styles.copy,{color:colors.mutedForeground}]}>{reward.description}</Text>:null}
      <PixelBar progress={reward.currentValue/reward.target*100}/><MetaText>{reward.progressText}</MetaText>
      {reward.status==='claimed'?<><Text style={{color:colors.gold}}>CLAIMED · READY TO BUY IN REAL LIFE!</Text><MetaText>Earned {reward.claimedAt?new Date(reward.claimedAt).toLocaleDateString():''}</MetaText></>:<>
        {reward.status==='ready'?<><Text style={{color:colors.cyan,fontFamily:'DMSans_700Bold'}}>READY TO BUY IN REAL LIFE!</Text><PixelButton label={claim.isPending?'Claiming...':reward.ruleType==='gold'?`Claim for ${reward.target} Gold`:'Claim earned reward'} disabled={claim.isPending} onPress={()=>claim.mutate({rewardId:reward.id},{onSuccess:()=>{setNotice('Claimed! Your reward is saved in trophy history.');refresh();},onError:failure=>setError(failure.message)})} testID={`reward-claim-${reward.id}`}/></>:<MetaText>LOCKED · Keep going to unlock this reward.</MetaText>}
        <View style={styles.wrap}><PixelButton label="Edit" compact tone="quiet" onPress={()=>open(reward)} testID={`reward-edit-${reward.id}`}/><PixelButton label="Remove" compact tone="quiet" onPress={()=>setDeleting(reward.id)} testID={`reward-remove-${reward.id}`}/></View>
        {deleting===reward.id?<><MetaText>Remove this unclaimed reward?</MetaText><PixelButton label="Confirm remove" tone="danger" disabled={remove.isPending} onPress={()=>remove.mutate({rewardId:reward.id},{onSuccess:()=>{setDeleting(null);refresh();},onError:failure=>setError(failure.message)})} testID={`reward-delete-${reward.id}`}/><PixelButton label="Keep reward" tone="quiet" onPress={()=>setDeleting(null)} testID="reward-keep"/></>:null}
      </>}
    </Panel>):<EmptyState title={history?'No trophies yet':'Your next goal awaits'} detail={history?'Claim an earned reward to save it here.':'Add an item or experience and choose how you will earn it.'}/>}
    {celebrating?<View pointerEvents="none" style={StyleSheet.absoluteFill}>{Array.from({length:24},(_,index)=><Animated.View key={index} style={{position:'absolute',left:`${index*37%96}%`,top:50+index%5*30,width:8,height:8,backgroundColor:[colors.gold,colors.cyan,colors.purple][index%3],opacity:motion.interpolate({inputRange:[0,.8,1],outputRange:[1,1,0]}),transform:[{translateY:motion.interpolate({inputRange:[0,1],outputRange:[-40,400]})},{rotate:motion.interpolate({inputRange:[0,1],outputRange:['0deg',`${index%2?360:-360}deg`]})}]}}/>)}</View>:null}
  </PixelPage>;
}
const styles=StyleSheet.create({row:{flexDirection:'row',gap:12,alignItems:'center'},wrap:{flexDirection:'row',gap:8,flexWrap:'wrap'},gold:{fontFamily:'PressStart2P_400Regular',fontSize:17,lineHeight:28},title:{fontFamily:'DMSans_700Bold',fontSize:18},copy:{fontFamily:'DMSans_400Regular',fontSize:14,lineHeight:20}});
