import type { Campaign } from '../systems/Mailbox';

// 운영자 보상 캠페인 목록(서버 없는 첫 출시용). 앱 업데이트로 목록을 바꾼다.
// 서버(8단계 v1.0 Firebase 안)가 생기면 이 목록을 서버의 rewardCampaigns에서 받아 오도록 바꾸면 되고,
// 수령 규칙(캠페인 id당 1회, 30일 만료)은 그대로다.
// 실제 운영 캠페인은 제작자가 정한다 — 수량을 임의로 정하지 않기 위해 비워 둔다.
export const CAMPAIGNS: Campaign[] = [];

/** ?dev=1에서만 쓰는 시험용 캠페인(실제 배포 목록에는 들어가지 않음) */
export const DEV_CAMPAIGNS: Campaign[] = [
  { id: 'dev-ruby', title: '[시험] 운영자 루비 선물', body: '개발용 시험 선물입니다.', kind: 'rubies', amount: 300, startAt: 0, endAt: 4_102_444_800_000, audience: 'all' },
  { id: 'dev-gold', title: '[시험] 점검 보상 골드', kind: 'gold', amount: 1000, startAt: 0, endAt: 4_102_444_800_000, audience: 'all' },
  { id: 'dev-stamina', title: '[시험] 행동력 선물', kind: 'stamina', amount: 20, startAt: 0, endAt: 4_102_444_800_000, audience: 'all' },
];
