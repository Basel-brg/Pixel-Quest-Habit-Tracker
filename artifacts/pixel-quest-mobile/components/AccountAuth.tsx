import { useEffect, useState } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { Text, View } from "@/components/Themed";
import { Link, useRouter } from 'expo-router';
import { useSignIn, useSignUp, useSSO } from '@clerk/expo';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { Feather } from '@expo/vector-icons';
import { Field, Panel, PixelButton, PixelPage, ScreenTitle, MetaText } from './PixelUI';
import { useColors } from '@/hooks/useColors';
WebBrowser.maybeCompleteAuthSession();

export function AccountAuth({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const colors = useColors();
  const router = useRouter();
  const login = useSignIn();
  const signup = useSignUp();
  const { startSSOFlow } = useSSO();
  useEffect(() => {
    if(Platform.OS !== 'android') return;
    void WebBrowser.warmUpAsync();
    return () => { void WebBrowser.coolDownAsync(); };
  },[]);
  const isSignup = mode === 'sign-up';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [verify, setVerify] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const errors = isSignup ? signup.errors : login.errors;
  const navigate = ({ session, decorateUrl }: { session?: {currentTask?: unknown} | null; decorateUrl: (url: string) => string }) => {
    if (session?.currentTask) { setError('Your account needs an additional verification step. Complete it in the web app.'); return; }
    const url = decorateUrl('/');
    if (Platform.OS === 'web' && url.startsWith('http')) window.location.href = url;
    else router.replace('/(tabs)');
  };
  async function submit() {
    setError('');
    if (!verify && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || !password)) {
      setError('Enter a valid email address and password.'); return;
    }
    if (verify && !code.trim()) { setError('Enter the verification code.'); return; }
    setBusy(true);
    try {
      if (isSignup) {
        if (verify) {
          const result = await signup.signUp.verifications.verifyEmailCode({ code });
          if (result.error) { setError(result.error.message || 'The code could not be verified.'); return; }
          if (signup.signUp.status === 'complete') await signup.signUp.finalize({ navigate });
          else setError('More verification is required to finish creating your account.');
        } else {
          const result = await signup.signUp.password({ emailAddress: email.trim(), password });
          if (result.error) { setError(result.error.message || 'Account creation failed.'); return; }
          if (signup.signUp.status === 'complete') await signup.signUp.finalize({ navigate });
          else if (signup.signUp.status === 'missing_requirements' && signup.signUp.unverifiedFields.includes('email_address') && signup.signUp.missingFields.length === 0) {
            await signup.signUp.verifications.sendEmailCode();
            setVerify(true);
          } else setError('Your account needs more information. Complete registration in the web app.');
        }
      } else {
        if (verify) {
          const result = await login.signIn.mfa.verifyEmailCode({ code });
          if (result.error) { setError(result.error.message || 'The code could not be verified.'); return; }
        } else {
          const result = await login.signIn.password({ emailAddress: email.trim(), password });
          if (result.error) { setError(result.error.message || 'Sign-in failed.'); return; }
        }
        if (login.signIn.status === 'complete') await login.signIn.finalize({ navigate });
        else if (login.signIn.status === 'needs_client_trust' || login.signIn.status === 'needs_second_factor') {
          const factor = login.signIn.supportedSecondFactors.find(item => item.strategy === 'email_code');
          if (factor) { await login.signIn.mfa.sendEmailCode(); setVerify(true); }
          else setError('Additional verification is required. Use the web app to complete this sign-in.');
        } else setError('Sign-in needs another verification step. Please try again.');
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to connect. Please try again.');
    } finally { setBusy(false); }
  }
  async function resend() {
    setBusy(true); setError('');
    try {
      if (isSignup) await signup.signUp.verifications.sendEmailCode();
      else await login.signIn.mfa.sendEmailCode();
    } catch { setError('Could not send another code. Please try again shortly.'); }
    finally { setBusy(false); }
  }
  async function google() {
    setBusy(true); setError('');
    try {
      const {createdSessionId,setActive} = await startSSOFlow({strategy:'oauth_google',redirectUrl:AuthSession.makeRedirectUri({scheme:'pixel-quest-mobile'})});
      if(createdSessionId && setActive) await setActive({session:createdSessionId,navigate});
      else setError('Google sign-in was cancelled or needs another verification step.');
    } catch(failure) { setError(failure instanceof Error ? failure.message : 'Google sign-in could not finish.'); }
    finally { setBusy(false); }
  }
  return <PixelPage keyboard>
    <View style={styles.brand}><Feather name="command" size={35} color={colors.gold}/><Text style={[styles.brandText,{color:colors.gold}]}>PIXEL QUEST</Text></View>
    <ScreenTitle eyebrow="Your life, leveled up" title={verify ? 'Verify your email' : isSignup ? 'Begin your quest' : 'Continue your save'} subtitle={verify ? `Enter the code sent to ${email}.` : 'Build habits, earn XP, and unlock rewards that matter in real life.'}/>
    <Panel>
      {verify ? <Field label="Verification code" testID="auth-code" value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" /> : <>
        <Field label="Email address" testID="auth-email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
        <Field label="Password" testID="auth-password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete={isSignup ? 'new-password' : 'current-password'} />
      </>}
      {error ? <Text accessibilityRole="alert" testID="auth-error" style={{color:colors.destructive,fontSize:14}}>{error}</Text> : null}
      {Object.values(errors.fields ?? {}).map((field, index) => field?.message ? <Text key={index} style={{color:colors.destructive}}>{field.message}</Text> : null)}
      <PixelButton label={busy ? 'Please wait...' : verify ? 'Verify and continue' : isSignup ? 'Create adventurer' : 'Sign in'} disabled={busy} onPress={() => void submit()} testID="auth-submit"/>
      {!verify?<PixelButton label="Continue with Google" tone="quiet" disabled={busy} onPress={()=>void google()} testID="auth-google"/>:null}
      {verify ? <PixelButton label="Send another code" tone="quiet" disabled={busy} onPress={() => void resend()} testID="auth-resend"/> : null}
      <Link href={isSignup ? '/(auth)/sign-in' : '/(auth)/sign-up'} style={{color:colors.cyan,textAlign:'center',padding:10}}>{isSignup ? 'Already have a save? Sign in' : 'New adventurer? Create an account'}</Link>
      {isSignup ? <View nativeID="clerk-captcha" /> : null}
    </Panel>
    <MetaText>Passwords and persistent sessions are securely managed by Clerk. Your quests and progress belong only to your account.</MetaText>
  </PixelPage>;
}
const styles = StyleSheet.create({
  brand:{alignItems:'center',gap:16,marginBottom:20},
  brandText:{fontFamily:'PressStart2P_400Regular',fontSize:19,lineHeight:29},
});
