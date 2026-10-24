import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet} from 'react-native';
import { Pressable, Text, View } from "@/components/Themed";
import { useFocusEffect } from 'expo-router';
import { useAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useGetRpgState, usePerformRpgAction, useRewardAssistant, getGetRpgStateQueryKey, type RpgCondition, type RpgConditionType, useGetRewards, useGetHabits, useGetPixelQuestDashboard, useDeleteReward, useClaimReward, getGetRewardsQueryKey, getGetPixelQuestDashboardQueryKey, getGetPixelQuestProfileQueryKey, type Reward } from '@workspace/api-client-react';
import { EntryFormModal } from '@/components/EntryFormModal';
import { ChoiceChip, EmptyState, ErrorState, Field, LoadingState, MetaText, Panel, PixelBar, PixelButton, PixelPage, ScreenTitle, SectionHeading } from '@/components/PixelUI';
import { useColors } from '@/hooks/useColors';

const rewardPresets = [
  { id: 'coffee', label: '☕ قهوة من الكافيه المفضل', title: 'قهوة من الكافيه المفضل', category: 'Treats', level: 2, cost: 50 },
  { id: 'meal', label: '🍕 وجبة مفتوحة في الويكند', title: 'وجبة مفتوحة في الويكند', category: 'Food', level: 3, cost: 120 },
  { id: 'gaming', label: '🎮 ساعتان ألعاب بدون ذنب', title: 'ساعتان ألعاب بدون ذنب', category: 'Fun', level: 2, cost: 80 },
  { id: 'cinema', label: '🎬 تذكرة سينما / فيلم جديد', title: 'تذكرة سينما / فيلم جديد', category: 'Entertainment', level: 4, cost: 200 },
] as const;

export default function RewardsScreen() {
  const colors = useColors(), qc = useQueryClient();
  const query = useGetRewards(), habits = useGetHabits({archived:false}), dashboard = useGetPixelQuestDashboard();
  const rpg = useGetRpgState(), save$ = usePerformRpgAction(), ai = useRewardAssistant(), remove = useDeleteReward(), claim = useClaimReward();
  const [history,setHistory] = useState(false), [form,setForm] = useState(false), [editing,setEditing] = useState<number|null>(null);
  const [title,setTitle] = useState(''), [description,setDescription] = useState(''), [category,setCategory] = useState('Personal');
  const [conditions,setConditions] = useState<RpgCondition[]>([{type:'level',target:2}]), [claimCost,setClaimCost] = useState('0');
  const [savingsTarget,setSavingsTarget] = useState('0'), [savedAmount,setSavedAmount] = useState('0'), [perQuest,setPerQuest] = useState('0'), [savingsOpen,setSavingsOpen] = useState(false);
  const [aiPrompt,setAiPrompt] = useState(''), [aiError,setAiError] = useState('');
  const aiSession = useRef(0), formRef = useRef('');
  const [error,setError] = useState(''), [notice,setNotice] = useState(''), [deleting,setDeleting] = useState<number|null>(null), [celebrating,setCelebrating] = useState(false), [muted,setMuted] = useState(false);
  const previous = useRef<Map<number,string>|null>(null), motion = useRef(new Animated.Value(0)).current;
  const player = useAudioPlayer(require('../../assets/audio/treasure.wav'));
  useEffect(()=>{void AsyncStorage.getItem('pixelquest-reward-muted').then(value=>setMuted(value==='true'));},[]);
  useFocusEffect(useCallback(()=>{void query.refetch();void dashboard.refetch();void rpg.refetch();},[]));
  const refresh = () => {
    void qc.invalidateQueries({queryKey:getGetRewardsQueryKey()});
    void qc.invalidateQueries({queryKey:getGetPixelQuestDashboardQueryKey()});
    void qc.invalidateQueries({queryKey:getGetPixelQuestProfileQueryKey()});
    void qc.invalidateQueries({queryKey:getGetRpgStateQueryKey()});
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
  formRef.current = JSON.stringify([title,description,category,conditions,claimCost]);
  function open(reward?:Reward) {
    aiSession.current += 1;
    if(reward && !rpg.data) { setError('Reward details are still syncing. Try again in a moment.'); void rpg.refetch(); return; }
    const rich = reward ? rpg.data?.rewards.find(item=>item.id===reward.id) : undefined;
    if(reward && !rich) { setError('Could not load the full reward details. Pull to refresh and try again.'); void rpg.refetch(); return; }
    setEditing(reward?.id??null);setTitle(rich?.title??'');setDescription(rich?.description??'');setCategory(rich?.category??'Personal');
    setConditions(rich?rich.conditions.map(({type,target,habitId})=>({type,target,habitId:habitId??null})):[{type:'level',target:2}]);
    setClaimCost(String(rich?.claimCost??0));setSavingsTarget(String(rich?.savingsTarget??0));setSavedAmount(String(rich?.savedAmount??0));setPerQuest(String(rich?.savingsPerQuest??0));
    setSavingsOpen(false);setAiPrompt('');setAiError('');setError('');setForm(true);
  }
  function close() { aiSession.current += 1; setForm(false); }
  function withLevel(list:RpgCondition[], level:number):RpgCondition[] {
    const i=list.findIndex(c=>c.type==='level');
    if(i>=0) return list.map((c,j)=>j===i?{...c,target:level}:c);
    return list.length<3?[{type:'level',target:level},...list]:list;
  }
  function applyPreset(p:(typeof rewardPresets)[number]) { aiSession.current += 1; setAiError(''); setTitle(p.title); setCategory(p.category); setClaimCost(String(p.cost)); setConditions(list=>withLevel(list,p.level)); }
  async function requestAi() {
    const prompt=aiPrompt.trim(); if(!prompt) return;
    setAiError(''); const id=++aiSession.current, before=formRef.current;
    try {
      const r=await ai.mutateAsync({data:{prompt}});
      if(id!==aiSession.current) return;
      if(formRef.current!==before){setAiError('تم تعديل النموذج أثناء التحليل، لذلك لم يتم استبدال تعديلاتك.');return;}
      setTitle(r.title); if(r.description) setDescription(r.description); setCategory(r.category); setClaimCost(String(r.claimCost)); setConditions(list=>withLevel(list,r.requiredLevel));
    } catch(failure) { if(id===aiSession.current) setAiError(failure instanceof Error?failure.message:'Auto-Fill failed. Try again.'); }
  }
  const setC=(i:number,patch:Partial<RpgCondition>)=>setConditions(list=>list.map((c,j)=>j===i?{...c,...patch}:c));
  const num=(v:string)=>Number(v);
  function save() {
    const cost=num(claimCost), st=num(savingsTarget), sa=num(savedAmount), pq=num(perQuest);
    if(!title.trim()||!category.trim()){setError('Add a reward name and category.');return;}
    if(conditions.some(c=>!Number.isInteger(Number(c.target))||c.target<1||c.target>1000000)){setError('Each condition needs a whole-number target from 1 to 1,000,000.');return;}
    if(conditions.some(c=>c.type==='level'&&c.target>100)){setError('Level targets cannot exceed 100.');return;}
    if(conditions.some(c=>c.type==='streak'&&!c.habitId)){setError('Choose a habit for each streak condition.');return;}
    if(!Number.isInteger(cost)||![cost,st,sa,pq].every(v=>Number.isFinite(v)&&v>=0)||cost>1000000||st>100000000||sa>100000000||pq>100000){setError('Gold cost must be a whole number; savings values must be zero or positive numbers within limits.');return;}
    aiSession.current += 1;
    save$.mutate({data:{requestId:`reward-${Date.now()}-${Math.random().toString(36).slice(2,10)}`,action:'saveReward',...(editing?{id:editing}:{}),title:title.trim(),description:description.trim(),category:category.trim(),
      conditions:conditions.map(c=>({type:c.type,target:Number(c.target),...(c.type==='streak'?{habitId:Number(c.habitId)}:{})})),claimCost:cost,savingsTarget:st,savedAmount:sa,savingsPerQuest:pq}},
      {onSuccess:()=>{setForm(false);setNotice('Reward saved. Keep earning your unlock.');refresh();},onError:(failure)=>setError(failure instanceof Error?failure.message:'Could not save reward.')});
  }
  if(query.isLoading) return <PixelPage><LoadingState/></PixelPage>;
  if(query.isError) return <PixelPage><ErrorState message="The reward shop could not load." retry={()=>void query.refetch()}/></PixelPage>;
  const rewards=(query.data??[]).filter(item=>history?item.status==='claimed':item.status!=='claimed');
  return <PixelPage>
    <ScreenTitle eyebrow="Goal-locked real rewards" title="Reward shop" subtitle="Earn the real-life things you want through discipline."/>
    <Panel><View style={styles.row}><View><Text style={[styles.gold,{color:colors.gold}]}>{dashboard.data?.profile.gold??0} GOLD</Text><MetaText>Earn Gold alongside XP. Spend it only when claiming.</MetaText></View></View>
      <PixelButton label="Add real-life reward" onPress={()=>open()} testID="reward-add"/>
      <PixelButton label={muted?'Fanfare: off':'Fanfare: on'} tone="quiet" onPress={()=>setMuted(value=>{void AsyncStorage.setItem('pixelquest-reward-muted',String(!value));return !value;})} testID="reward-audio"/>
    </Panel>
    <EntryFormModal visible={form} title={editing?'EDIT REWARD':'ADD REWARD'} onClose={close} actions={<View style={styles.actions}>
      <PixelButton label={save$.isPending?'جاري الحفظ...':'Save / حفظ'} tone="gold" disabled={save$.isPending} onPress={save} testID="reward-save"/>
      <PixelButton label="Cancel / إلغاء" tone="quiet" onPress={close} testID="reward-cancel"/></View>}>
      <Panel><SectionHeading title="Auto-Fill ✨"/>
        <Field label="وصف المكافأة" value={aiPrompt} onChangeText={setAiPrompt} maxLength={500} multiline placeholder="🔍 اكتب مكافأتك الواقعية.. مثلاً: شراء ساعة ذكية أو سهرة عشاء" testID="input-reward-ai-prompt"/>
        <PixelButton label={ai.isPending?'جاري التحليل...':'Auto-Fill ✨'} tone="cyan" disabled={!aiPrompt.trim()||ai.isPending} onPress={()=>void requestAi()} testID="button-reward-ai-fill"/>
        <MetaText>Suggests a level gate and Gold cost. Nothing saves until you press Save.</MetaText>
        {aiError?<Text accessibilityRole="alert" testID="status-reward-ai-error" style={{color:colors.destructive,fontSize:12}}>{aiError}</Text>:null}
      </Panel>
      <Panel><SectionHeading title="قوالب سريعة"/><View style={styles.wrap}>{rewardPresets.map(p=><ChoiceChip key={p.id} label={`${p.label} (Lv ${p.level} | ${p.cost} G)`} selected={false} onPress={()=>applyPreset(p)} testID={`reward-template-${p.id}`}/>)}</View></Panel>
      <Field label="Reward name" value={title} onChangeText={setTitle} maxLength={120} testID="reward-title"/>
      <Field label="Gold cost (paid when claiming)" value={claimCost} onChangeText={setClaimCost} keyboardType="number-pad" testID="reward-claim-cost"/>
      <MetaText>Unlock conditions (all must be met)</MetaText>
      {conditions.map((c,i)=><Panel key={i}>
        <View style={styles.wrap}>{(['level','streak','gold'] as RpgConditionType[]).map(t=><ChoiceChip key={t} label={t==='level'?'Player level':t==='streak'?'Habit streak':'Gold balance'} selected={c.type===t} onPress={()=>setC(i,{type:t,habitId:null})} testID={`reward-condition-${i}-type-${t}`}/>)}</View>
        <Field label={c.type==='streak'?'Consecutive days':c.type==='gold'?'Gold balance':'Required level'} value={String(c.target)} onChangeText={v=>setC(i,{target:Number(v.replace(/[^0-9]/g,''))})} keyboardType="number-pad" testID={`reward-condition-target-${i}`}/>
        {c.type==='streak'?<View style={styles.wrap}>{habits.data?.length?habits.data.map(h=><ChoiceChip key={h.id} label={h.title} selected={c.habitId===h.id} onPress={()=>setC(i,{habitId:h.id})} testID={`reward-condition-${i}-habit-${h.id}`}/>):<MetaText>Create an active habit first.</MetaText>}</View>:null}
        {conditions.length>1?<PixelButton label="Remove condition" compact tone="quiet" onPress={()=>setConditions(list=>list.filter((_,j)=>j!==i))} testID={`reward-condition-remove-${i}`}/>:null}
      </Panel>)}
      {conditions.length<3?<PixelButton label="Add condition" compact tone="quiet" onPress={()=>setConditions(list=>[...list,{type:'gold',target:50}])} testID="reward-condition-add"/>:null}
      <Field label="Description (optional)" value={description} onChangeText={setDescription} maxLength={300} multiline testID="reward-description"/>
      <Field label="Category" value={category} onChangeText={setCategory} maxLength={40} testID="reward-category"/>
      <Panel>
        <Pressable accessibilityRole="button" accessibilityState={{expanded:savingsOpen}} onPress={()=>setSavingsOpen(v=>!v)} testID="reward-savings-toggle" style={styles.accordion}>
          <Text style={[styles.accTitle,{color:colors.foreground}]}>Track Real-World Savings (ربط بالادخار المالي) 💰</Text>
          <Feather name={savingsOpen?'chevron-up':'chevron-down'} size={18} color={colors.mutedForeground}/>
        </Pressable>
        {!savingsOpen&&(num(savingsTarget)>0||num(savedAmount)>0)?<MetaText>Saved {savedAmount} / {savingsTarget} (kept as is)</MetaText>:null}
        {savingsOpen?<>
          <Field label="Savings target" value={savingsTarget} onChangeText={setSavingsTarget} keyboardType="decimal-pad" testID="reward-savings-target"/>
          <Field label="Saved so far" value={savedAmount} onChangeText={setSavedAmount} keyboardType="decimal-pad" testID="reward-saved"/>
          <Field label="Per quest" value={perQuest} onChangeText={setPerQuest} keyboardType="decimal-pad" testID="reward-per-quest"/>
          <MetaText>Manual, virtual estimate. Not money or a payment.</MetaText>
        </>:null}
      </Panel>
      {error?<Text accessibilityRole="alert" style={{color:colors.destructive}}>{error}</Text>:null}
    </EntryFormModal>
    {notice?<Panel><Text accessibilityRole="alert" style={{color:colors.cyan}}>{notice}</Text></Panel>:null}
    {!form&&error?<Text style={{color:colors.destructive}}>{error}</Text>:null}
    <View style={styles.wrap}><ChoiceChip label="Marketplace" selected={!history} onPress={()=>setHistory(false)} testID="reward-shop-tab"/><ChoiceChip label="Trophy history" selected={history} onPress={()=>setHistory(true)} testID="reward-history-tab"/></View>
    {rewards.length?rewards.map(reward=><Panel key={reward.id} style={{opacity:reward.status==='locked'?.72:1,borderColor:reward.status==='ready'?colors.gold:colors.border}}>
      <View style={styles.row}><Feather name={reward.status==='locked'?'lock':reward.status==='claimed'?'award':'gift'} color={reward.status==='ready'?colors.gold:colors.cyan} size={25}/><View style={{flex:1,gap:5}}><Text style={[styles.title,{color:colors.foreground}]}>{reward.title}</Text><MetaText>{reward.category} · {reward.ruleType==='streak'?reward.habitTitle:reward.ruleType==='gold'?'Gold reward':'Level reward'}</MetaText></View></View>
      {reward.description?<Text style={[styles.copy,{color:colors.mutedForeground}]}>{reward.description}</Text>:null}
      <PixelBar progress={reward.currentValue/reward.target*100}/><MetaText>{reward.progressText}</MetaText>{(reward.claimCost??0)>0?<MetaText>Claim cost {reward.claimCost} Gold</MetaText>:null}
      {reward.status==='claimed'?<><Text style={{color:colors.gold}}>CLAIMED · READY TO BUY IN REAL LIFE!</Text><MetaText>Earned {reward.claimedAt?new Date(reward.claimedAt).toLocaleDateString():''}</MetaText></>:<>
        {reward.status==='ready'?<><Text style={{color:colors.cyan,fontFamily:'DMSans_700Bold'}}>READY TO BUY IN REAL LIFE!</Text><PixelButton label={claim.isPending?'Claiming...':(reward.claimCost??0)>0?`Claim for ${reward.claimCost} Gold`:'Claim earned reward'} disabled={claim.isPending} onPress={()=>claim.mutate({rewardId:reward.id},{onSuccess:()=>{setNotice('Claimed! Your reward is saved in trophy history.');refresh();},onError:failure=>setError(failure.message)})} testID={`reward-claim-${reward.id}`}/></>:<MetaText>LOCKED · Keep going to unlock this reward.</MetaText>}
        <View style={styles.wrap}><PixelButton label="Edit" compact tone="quiet" onPress={()=>open(reward)} testID={`reward-edit-${reward.id}`}/><PixelButton label="Remove" compact tone="quiet" onPress={()=>setDeleting(reward.id)} testID={`reward-remove-${reward.id}`}/></View>
        {deleting===reward.id?<><MetaText>Remove this unclaimed reward?</MetaText><PixelButton label="Confirm remove" tone="danger" disabled={remove.isPending} onPress={()=>remove.mutate({rewardId:reward.id},{onSuccess:()=>{setDeleting(null);refresh();},onError:failure=>setError(failure.message)})} testID={`reward-delete-${reward.id}`}/><PixelButton label="Keep reward" tone="quiet" onPress={()=>setDeleting(null)} testID="reward-keep"/></>:null}
      </>}
    </Panel>):<EmptyState title={history?'No trophies yet':'Your next goal awaits'} detail={history?'Claim an earned reward to save it here.':'Add an item or experience and choose how you will earn it.'}/>}
    {celebrating?<View pointerEvents="none" style={StyleSheet.absoluteFill}>{Array.from({length:24},(_,index)=><Animated.View key={index} style={{position:'absolute',left:`${index*37%96}%`,top:50+index%5*30,width:8,height:8,backgroundColor:[colors.gold,colors.cyan,colors.purple][index%3],opacity:motion.interpolate({inputRange:[0,.8,1],outputRange:[1,1,0]}),transform:[{translateY:motion.interpolate({inputRange:[0,1],outputRange:[-40,400]})},{rotate:motion.interpolate({inputRange:[0,1],outputRange:['0deg',`${index%2?360:-360}deg`]})}]}}/>)}</View>:null}
  </PixelPage>;
}
const styles=StyleSheet.create({actions:{gap:8},accordion:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10,minHeight:44},accTitle:{flex:1,fontFamily:'DMSans_700Bold',fontSize:14},row:{flexDirection:'row',gap:12,alignItems:'center'},wrap:{flexDirection:'row',gap:8,flexWrap:'wrap'},gold:{fontFamily:'PressStart2P_400Regular',fontSize:17,lineHeight:28},title:{fontFamily:'DMSans_700Bold',fontSize:18},copy:{fontFamily:'DMSans_400Regular',fontSize:14,lineHeight:20}});
