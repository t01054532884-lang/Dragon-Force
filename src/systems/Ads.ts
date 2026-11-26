import { PLATFORM } from '../platform';

/**
 * 보상형 광고(2026-11-26 제작자 결정: 토스·App Store·Google Play 모두).
 * 사용자가 스스로 버튼을 눌러 끝까지 본 경우에만 보상 — 전면·배너 광고는 넣지 않는다(docs/TOSS_ADS.md).
 * - 자리: 'revive' 전투에서 쓰러졌을 때 부활(판당 1회) · 'ruby' 루비 상점 루비 100(하루 1회)
 * - 토스: 앱인토스 SDK(GoogleAdMob.*AppsInTossAdMob), 콘솔에서 만든 광고 그룹 ID = VITE_TOSS_AD_REWARDED
 * - iOS·안드로이드: AdMob(@capacitor-community/admob), 광고 단위 = 아래 LIVE_UNIT(환경 변수 VITE_ADMOB_REWARDED_IOS / _ANDROID로 덮어쓰기 가능)
 *   VITE_ADMOB_TEST=1이면 Google 시험 광고 단위로(TestFlight 시험용).
 *   맞춤 광고는 쓰지 않는다(npa: 비개인 맞춤) → 앱 추적 투명성(ATT) 팝업 없음.
 * - 웹: 개발 모드(?dev=1)에서만 가짜 광고(0.8초 뒤 보상)로 시험, 배포 웹은 광고 없음
 */
export type AdSlot = 'revive' | 'ruby';
export type AdResult = 'rewarded' | 'cancelled' | 'unavailable';

const env = import.meta.env as Record<string, string | undefined>;
const TEST = env.VITE_ADMOB_TEST === '1';
// Google 공식 시험용 보상형 광고 단위(실제 수익 없음)
const TEST_UNIT = { ios: 'ca-app-pub-3940256099942544/1712485313', android: 'ca-app-pub-3940256099942544/5224354917' };
// 실제 보상형 광고 단위(AdMob 게시자 pub-1538981463091871, 2026-11-26 생성). 앱 안에 들어가는 공개 값.
// 앱 ID는 iOS Info.plist GADApplicationIdentifier(~5530802817) · 안드로이드 AndroidManifest(~1260385313).
// 개발·TestFlight 시험 중 내 폰에서는 AdMob '테스트 기기'로 등록하거나 VITE_ADMOB_TEST=1(시험 광고)로 — 내 실제 광고를 눌러 보면 정책 위반.
const LIVE_UNIT = { ios: 'ca-app-pub-1538981463091871/6269169414', android: 'ca-app-pub-1538981463091871/9427097052' };

interface AdImpl {
  ready(): boolean;
  show(slot: AdSlot): Promise<AdResult>;
}

const none: AdImpl = { ready: () => false, show: async () => 'unavailable' };
let impl: AdImpl = none;
let showing = false;

/** 웹 개발 모드 가짜 광고 */
function fakeAds(): AdImpl {
  return {
    ready: () => true,
    show: () => new Promise((r) => setTimeout(() => r('rewarded'), 800)),
  };
}

/** iOS·안드로이드: AdMob */
async function admobAds(unit: string): Promise<AdImpl> {
  const { AdMob, RewardAdPluginEvents } = await import('@capacitor-community/admob');
  await AdMob.initialize({ initializeForTesting: TEST });
  let loaded = false;
  const load = () => {
    loaded = false;
    AdMob.prepareRewardVideoAd({ adId: unit, isTesting: TEST, npa: true })
      .then(() => (loaded = true))
      .catch(() => setTimeout(load, 60_000)); // 못 불러오면 1분 뒤 다시
  };
  load();
  return {
    ready: () => loaded,
    show: () =>
      new Promise<AdResult>((resolve) => {
        let earned = false;
        const subs: Promise<{ remove: () => Promise<void> }>[] = [];
        const done = (r: AdResult) => {
          subs.forEach((s) => void s.then((h) => h.remove()));
          load(); // 다음 광고 미리 불러오기
          resolve(r);
        };
        subs.push(AdMob.addListener(RewardAdPluginEvents.Rewarded, () => (earned = true)));
        subs.push(AdMob.addListener(RewardAdPluginEvents.Dismissed, () => done(earned ? 'rewarded' : 'cancelled')));
        subs.push(AdMob.addListener(RewardAdPluginEvents.FailedToShow, () => done('unavailable')));
        AdMob.showRewardVideoAd().catch(() => done(earned ? 'rewarded' : 'unavailable'));
      }),
  };
}

/** 토스: 앱인토스 광고(AdMob 연동) */
async function tossAds(adGroupId: string): Promise<AdImpl> {
  const { GoogleAdMob } = await import('@apps-in-toss/web-framework');
  if (!GoogleAdMob.loadAppsInTossAdMob.isSupported()) return none;
  let loaded = false;
  const load = () => {
    loaded = false;
    GoogleAdMob.loadAppsInTossAdMob({
      options: { adGroupId },
      onEvent: (e) => {
        if (e.type === 'loaded') loaded = true;
      },
      onError: () => setTimeout(load, 60_000),
    });
  };
  load();
  return {
    ready: () => loaded,
    show: () =>
      new Promise<AdResult>((resolve) => {
        let earned = false;
        let finished = false;
        const done = (r: AdResult) => {
          if (finished) return;
          finished = true;
          load();
          resolve(r);
        };
        GoogleAdMob.showAppsInTossAdMob({
          options: { adGroupId },
          onEvent: (e) => {
            if (e.type === 'userEarnedReward') earned = true;
            else if (e.type === 'dismissed') done(earned ? 'rewarded' : 'cancelled');
            else if (e.type === 'failedToShow') done('unavailable');
          },
          onError: () => done(earned ? 'rewarded' : 'unavailable'),
        });
      }),
  };
}

/** 게임 시작 때 한 번(플랫폼 준비 뒤). 실패해도 게임은 그대로(광고 버튼만 안 보임) */
export async function initAds(dev: boolean): Promise<void> {
  try {
    if (PLATFORM === 'toss') {
      const id = env.VITE_TOSS_AD_REWARDED;
      if (id) impl = await tossAds(id);
    } else if (PLATFORM === 'ios' || PLATFORM === 'android') {
      const unit = TEST ? TEST_UNIT[PLATFORM] : (PLATFORM === 'ios' ? env.VITE_ADMOB_REWARDED_IOS : env.VITE_ADMOB_REWARDED_ANDROID) || LIVE_UNIT[PLATFORM];
      if (unit) impl = await admobAds(unit);
    } else if (dev) impl = fakeAds();
  } catch (e) {
    console.warn('광고 준비 실패', e);
    impl = none;
  }
}

export const ads = {
  /** 이 빌드에서 광고를 쓸 수 있는지(광고 칸·버튼을 그릴지) */
  supported: (): boolean => impl !== none,
  /** 지금 바로 광고를 보여 줄 수 있는지(불러오기 끝남) */
  ready: (): boolean => !showing && impl.ready(),
  /** 광고 보여 주기. 'rewarded'일 때만 보상 */
  async show(slot: AdSlot): Promise<AdResult> {
    if (showing || !impl.ready()) return 'unavailable';
    showing = true;
    try {
      return await impl.show(slot);
    } catch {
      return 'unavailable';
    } finally {
      showing = false;
    }
  },
};
