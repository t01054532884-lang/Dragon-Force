import { describe, expect, it } from 'vitest';
import { parseDeepLink } from '../src/systems/DeepLink';

describe('딥 링크(dragonforce://)', () => {
  it('이벤트·상점·스킨 주소를 읽는다', () => {
    expect(parseDeepLink('dragonforce://event')).toBe('event');
    expect(parseDeepLink('dragonforce:///event')).toBe('event');
    expect(parseDeepLink('dragonforce://open/event?src=appstore')).toBe('event');
    expect(parseDeepLink('DragonForce://Shop')).toBe('shop');
    expect(parseDeepLink('dragonforce://skins')).toBe('skins');
  });
  it('모르는 주소·다른 앱 주소는 무시', () => {
    expect(parseDeepLink('dragonforce://battle')).toBeNull();
    expect(parseDeepLink('https://apps.apple.com/app/id6837190960')).toBeNull();
    expect(parseDeepLink('')).toBeNull();
  });
});
