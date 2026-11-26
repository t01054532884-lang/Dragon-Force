// 플랫폼 공통 창구. 게임 코드는 이 인터페이스만 보고, 웹·iOS(Capacitor)·앱인토스 차이는 구현 파일이 맡는다.
// 빌드할 때 VITE_PLATFORM(web | ios | toss | android)에 따라 하나만 번들에 들어간다(src/platform/index.ts).
export type PlatformId = 'web' | 'ios' | 'toss' | 'android';

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** 게임 저장소는 동기(getItem/setItem)로 쓰고, 실제 기기 저장은 뒤에서 비동기로 한다. */
export interface SyncStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface PlatformImpl {
  id: PlatformId;
  /** 시작할 때 한 번: 기기 저장소에서 keys를 미리 읽어 온다(이후 읽기는 메모리에서) */
  loadStore(keys: string[]): Promise<Map<string, string>>;
  /** 메모리 값이 바뀔 때마다 기기 저장소에 쓴다 */
  writeStore(key: string, value: string): void;
  /** 화면에서 가리면 안 되는 영역(노치·홈바·토스 닫기 버튼 줄 포함), CSS px */
  insets(): Insets;
  onInsetsChange(cb: () => void): void;
  /** 안드로이드·토스 뒤로가기. cb가 true를 돌려주면 게임이 처리했다는 뜻 */
  onBack(cb: () => boolean): void;
  /** 앱이 백그라운드로 가거나 돌아올 때 */
  onPause(cb: () => void): void;
  onResume(cb: () => void): void;
  /** 게임 종료(토스: 화면 닫기, iOS: 종료 없음 — 애플은 앱이 스스로 종료하는 것을 권하지 않는다) */
  canExit: boolean;
  exit(): void;
  /** 세로 고정 등 시작 설정 */
  init(): Promise<void>;
}
