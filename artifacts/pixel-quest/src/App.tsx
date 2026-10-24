import { useEffect, useRef, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Link, Redirect, Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { ClerkLoading, ClerkProvider, Show, SignIn, SignUp, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { dark } from '@clerk/themes';
import { ui } from '@clerk/ui';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import RewardsPage from '@/pages/rewards';
import ProfilePage from '@/pages/profile';
import Landing from '@/pages/landing';
import { Shell } from '@/components/shell';
import { RpgProvider } from '@/lib/rpg-context';
import { ThemeProvider } from '@/lib/theme';
import { RemindersProvider, clearReminderState } from '@/lib/reminders';
import CampPage from '@/pages/camp';
import HabitsPage from '@/pages/habits';
import QuestsPage from '@/pages/quests';
import InventoryPage from '@/pages/inventory';
import JournalPage from '@/pages/journal';
import SettingsPage from '@/pages/settings';
import OnboardingPage from '@/pages/onboarding';
import { useRpg } from '@/lib/rpg-context';

const queryClient = new QueryClient();
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
function stripBase(path: string): string { return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path; }
if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
const clerkAppearance = {
  theme: dark, cssLayerName: 'clerk',
  options: { logoPlacement: 'inside' as const, logoLinkUrl: basePath || '/', logoImageUrl: `${window.location.origin}${basePath}/logo.svg` },
  variables: { colorPrimary: '#f5ca62', colorForeground: '#eee8da', colorMutedForeground: '#aaa4bb', colorDanger: '#ff9d8a', colorBackground: '#211f33', colorInput: '#191827', colorInputForeground: '#eee8da', colorNeutral: '#8f89a5', fontFamily: "'DM Sans', sans-serif", borderRadius: '0px' },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#211f33] border-2 border-[#514967] shadow-[4px_4px_0_#0e0d18] w-[440px] max-w-full overflow-hidden',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none', footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: { fontFamily: "'Press Start 2P', monospace", fontSize: '13px', color: '#f3e9cf', lineHeight: 1.6 },
    headerSubtitle: { color: '#aaa4bb' }, socialButtonsBlockButtonText: { color: '#eee8da' }, formFieldLabel: { color: '#d6cfae' },
    footerActionLink: { color: '#73e6df' }, footerActionText: { color: '#aaa4bb' }, dividerText: { color: '#aaa4bb' },
    identityPreviewEditButton: { color: '#73e6df' }, formFieldSuccessText: { color: '#73e6df' }, alertText: { color: '#ffb8aa' },
    formFieldErrorText: { color: '#ff9d8a' }, formButtonPrimary: { color: '#252138', fontWeight: 700 },
    formFieldInput: { border: '1px solid #514967' }, logoImage: { imageRendering: 'pixelated' as const },
  },
};
function SignInPage() { return <div className="scanlines flex min-h-[100dvh] items-center justify-center px-4"><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`}/></div>; }
function SignUpPage() { return <div className="scanlines flex min-h-[100dvh] items-center justify-center px-4"><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`}/></div>; }
function CacheInvalidator() {
  const { addListener } = useClerk(); const qc = useQueryClient(); const prev = useRef<string | null | undefined>(undefined);
  useEffect(() => addListener(({ user }) => { const id = user?.id ?? null; if (prev.current !== undefined && prev.current !== id) { qc.clear(); sessionStorage.removeItem('pixelquest-reward-statuses'); clearReminderState(); } prev.current = id; }), [addListener, qc]);
  return null;
}
function HomeRoute() { return <><ClerkLoading><Landing/></ClerkLoading><Show when="signed-in"><Redirect to="/camp"/></Show><Show when="signed-out"><Landing/></Show></>; }
function AccountScope({ children }: { children: ReactNode }) {
  const { user } = useUser();
  // Reset forms, feedback, reminders and requests as well as server cache on account changes.
  return <RpgProvider key={user?.id ?? 'signed-out'}><ThemeProvider><RemindersProvider>{children}</RemindersProvider></ThemeProvider></RpgProvider>;
}
const loadingSave = <div data-testid="status-loading-save" className="grid min-h-[100dvh] place-items-center font-mono text-sm text-[color:var(--pq-cyan)]">Loading your save...</div>;
/** Onboarding marker gate: only a live server boolean resolves it — cached snapshots never prove completion. */
function OnboardingGate({ mode, children }: { mode: 'app' | 'onboarding'; children: ReactNode }) {
  const { serverSnap: snap, isError, refetch } = useRpg();
  const marker = snap?.profile && typeof snap.profile.hasCompletedOnboarding === 'boolean' ? snap.profile.hasCompletedOnboarding : undefined;
  if (marker === undefined) {
    if (isError) return <div className="grid min-h-[100dvh] place-items-center px-4 text-center"><div><p className="mb-4 text-sm text-[color:var(--pq-ink2)]">We couldn't confirm your save file.</p><button type="button" data-testid="button-gate-retry" onClick={refetch} className="pixel-button bg-[color:var(--pq-gold)] px-4 py-2.5 text-sm font-bold text-[color:var(--pq-onaccent)]">Try again</button></div></div>;
    return <div className="grid min-h-[100dvh] place-items-center text-center"><div><p data-testid="status-loading-save" className="font-mono text-sm text-[color:var(--pq-cyan)]">Loading your save...</p><button type="button" data-testid="button-gate-reload" onClick={refetch} className="mt-4 text-xs text-[color:var(--pq-mute)] underline">Taking long? Retry</button></div></div>;
  }
  if (mode === 'app' && marker === false) return <Redirect to="/onboarding" replace/>;
  if (mode === 'onboarding' && marker === true) return <Redirect to="/camp" replace/>;
  return <>{children}</>;
}
function Protected({ component: C }: { component: () => ReactNode }) { return <><ClerkLoading>{loadingSave}</ClerkLoading><Show when="signed-in"><OnboardingGate mode="app"><Shell><C/></Shell></OnboardingGate></Show><Show when="signed-out"><Redirect to="/"/></Show></>; }
function OnboardingRoute() { return <><ClerkLoading>{loadingSave}</ClerkLoading><Show when="signed-in"><OnboardingGate mode="onboarding"><OnboardingPage/></OnboardingGate></Show><Show when="signed-out"><Redirect to="/"/></Show></>; }
function Router() {
  const [location, setLocation]=useLocation();
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} ui={ui} appearance={clerkAppearance} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} localization={{signIn:{start:{title:'Continue your save',subtitle:'Sign in to your Pixel Quest account'}},signUp:{start:{title:'Begin your quest',subtitle:'Create your own adventurer account'}}}} routerPush={(to)=>setLocation(stripBase(to))} routerReplace={(to)=>setLocation(stripBase(to),{replace:true})}>
    <QueryClientProvider client={queryClient}><CacheInvalidator/><TooltipProvider><AccountScope><ErrorBoundary resetKey={location}><Switch>
      <Route path="/" component={HomeRoute}/><Route path="/sign-in/*?" component={SignInPage}/><Route path="/sign-up/*?" component={SignUpPage}/>
      <Route path="/onboarding" component={OnboardingRoute}/>
      <Route path="/camp">{()=><Protected component={CampPage}/>}</Route><Route path="/habits">{()=><Protected component={HabitsPage}/>}</Route><Route path="/quests">{()=><Protected component={QuestsPage}/>}</Route><Route path="/inventory">{()=><Protected component={InventoryPage}/>}</Route><Route path="/rewards">{()=><Protected component={RewardsPage}/>}</Route><Route path="/journal">{()=><Protected component={JournalPage}/>}</Route><Route path="/profile">{()=><Protected component={ProfilePage}/>}</Route>
      <Route path="/settings">{()=><Protected component={SettingsPage}/>}</Route>
      <Route component={NotFound}/></Switch></ErrorBoundary></AccountScope><Toaster/></TooltipProvider></QueryClientProvider>
  </ClerkProvider>;
}
function App() {
  return <WouterRouter base={basePath}><Router/></WouterRouter>;
}
export default App;
