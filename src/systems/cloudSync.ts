import type { PlayerProgress } from './Progress';

// 클라우드 저장 1단계(2026-11-21, docs/CLOUD.md): 서버 없이도 시험할 수 있게 "무엇을 할지" 판단만 순수 함수로 둔다.
// Firebase 호출은 Cloud.ts가 맡고, 여기 규칙은 테스트(tests/cloud.test.ts)로 확인한다.

/** 이 기기가 기억하는 클라우드 상태(기기 저장 키 CLOUD_KEY) */
export interface CloudMeta {
  uid: string; // 마지막으로 맞춘 계정
  rev: number; // 마지막으로 맞춘 서버 버전(서버에 쓸 때마다 +1)
  dirty: boolean; // 마지막 맞춤 이후 이 기기에서 진행이 바뀜
  syncedAt: number;
}

export const CLOUD_KEY = 'dragon-force:cloud';

/** 서버 문서 users/{uid}의 요약(선택 화면 표시용) */
export interface SaveSummary {
  gold: number;
  rubies: number;
  dragons: number; // 보유 드래곤 수
  easyStage: number; // 쉬움 최고 해금 단계
  hardStage: number;
  updatedAt: number;
}

export type SyncAction =
  | 'upload' // 서버에 없음 또는 이 기기만 바뀜 → 올리기
  | 'download' // 다른 기기가 바꿨고 이 기기는 그대로 → 받기
  | 'choose' // 둘 다 바뀌었거나 이 기기가 처음 → 자동 덮어쓰기·합산 금지, 사람이 고름
  | 'none';

/**
 * 시작할 때·다시 연결될 때 할 일.
 * - 서버에 기록이 없으면 이 기기 저장을 1회 올린다(기존 기기 저장 이전).
 * - 이 기기가 이 계정과 맞춘 적이 없는데 서버에 기록이 있으면 → 고르기(재설치·새 기기에서 "서버 기록 받기"가 기본 안내).
 * - 서버 버전이 같으면 이 기기 변경만 올린다. 서버가 앞서 있으면 이 기기가 그대로일 때만 받고, 아니면 고르기.
 */
export function decideSync(meta: CloudMeta | null, uid: string, remote: { rev: number } | null, localDirty: boolean): SyncAction {
  if (!remote) return 'upload';
  if (!meta || meta.uid !== uid) return 'choose';
  if (remote.rev === meta.rev) return localDirty ? 'upload' : 'none';
  if (remote.rev > meta.rev) return localDirty ? 'choose' : 'download';
  // 서버 버전이 이 기기 기억보다 낮음(서버 기록이 지워졌다 다시 생김 등) → 안전하게 고르기
  return 'choose';
}

export function summarize(p: PlayerProgress, now = Date.now()): SaveSummary {
  return {
    gold: p.gold,
    rubies: p.rubies,
    dragons: Object.values(p.dragons ?? {}).filter((d) => d?.unlocked).length,
    easyStage: Math.max(0, ...p.difficulty.easy.unlocked),
    hardStage: Math.max(0, ...p.difficulty.hard.unlocked),
    updatedAt: now,
  };
}

/** 선택 화면 한 줄: "쉬움 12단계 · 어려움 3단계 · 드래곤 4 · 골드 12,300 · 루비 540" */
export function summaryLine(s: SaveSummary): string {
  const parts = [`쉬움 ${s.easyStage}단계`];
  if (s.hardStage) parts.push(`어려움 ${s.hardStage}단계`);
  parts.push(`드래곤 ${s.dragons}`, `골드 ${s.gold.toLocaleString()}`, `루비 ${s.rubies.toLocaleString()}`);
  return parts.join(' · ');
}

export function readMeta(text: string | null): CloudMeta | null {
  try {
    const j = JSON.parse(text ?? 'null');
    if (j && typeof j.uid === 'string' && Number.isFinite(j.rev)) return { uid: j.uid, rev: j.rev, dirty: !!j.dirty, syncedAt: Number(j.syncedAt) || 0 };
  } catch {
    /* 손상 → 처음 */
  }
  return null;
}
