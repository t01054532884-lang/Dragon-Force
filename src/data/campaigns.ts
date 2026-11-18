import type { Campaign } from '../systems/Mailbox';

// 운영자 보상 캠페인 목록(서버 없는 첫 출시용). 앱 업데이트로 목록을 바꾼다.
// 서버(8단계 v1.0 Firebase 안)가 생기면 이 목록을 서버에서 받아 오도록 바꾸면 되고, 수령 규칙(캠페인 id당 1회, 30일 만료)은 그대로다.
// 주의: 서버가 없으므로 "1회"는 이 기기 저장(로컬 프로필) 기준이다. 앱 삭제·기기 변경까지 막는 전역 중복 방지는 아니다.

const FAR_FUTURE = 4_102_444_800_000; // 2100-01-01

/**
 * 출시 기념 선물 켜기(8단계 v2.0 0.4 확정). 정식 출시 빌드에서 켜 두는 명시적 설정.
 * 끄면 새로 선물함에 들어가지 않는다(이미 들어간 선물은 자체 만료까지 유지).
 */
export const LAUNCH_GIFT_ENABLED = true;

/** 정식 캠페인 */
export const CAMPAIGNS: Campaign[] = [
  {
    id: 'launch-ruby-1000-v1',
    title: 'Dragon Force 출시 기념 선물',
    body: '드래곤 특공대의 첫 모험을 함께해 주셔서 감사합니다! 출시 기념 루비 1,000개를 받아 주세요.',
    kind: 'rubies',
    amount: 1000,
    startAt: 0,
    endAt: FAR_FUTURE,
    expireDays: 30, // 선물함에 들어온 시각부터 30일
    audience: 'all',
  },
];

/** ?dev=1(또는 개발 서버)에서만 쓰는 시험용 캠페인 — 정식 목록과 따로 둔다 */
export const DEV_CAMPAIGNS: Campaign[] = [
  { id: 'dev-ruby', title: '[시험] 운영자 루비 선물', body: '개발용 시험 선물입니다.', kind: 'rubies', amount: 300, startAt: 0, endAt: FAR_FUTURE, audience: 'all' },
  { id: 'dev-gold', title: '[시험] 점검 보상 골드', kind: 'gold', amount: 1000, startAt: 0, endAt: FAR_FUTURE, audience: 'all' },
  { id: 'dev-stamina', title: '[시험] 행동력 선물', kind: 'stamina', amount: 20, startAt: 0, endAt: FAR_FUTURE, audience: 'all' },
];

/** 지금 확인할 캠페인: 출시 선물(켜져 있으면) + 개발 모드면 시험용 */
export function activeCampaigns(dev: boolean): Campaign[] {
  return [...CAMPAIGNS.filter((c) => LAUNCH_GIFT_ENABLED || !c.id.startsWith('launch-')), ...(dev ? DEV_CAMPAIGNS : [])];
}
