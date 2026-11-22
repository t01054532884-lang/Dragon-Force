import { describe, expect, it } from 'vitest';
import { compareVersions, judgeVersion } from '../src/systems/Version';

describe('업데이트 확인', () => {
  it('버전 비교', () => {
    expect(compareVersions('1.0.0', '1.0.1')).toBeLessThan(0);
    expect(compareVersions('1.2.0', '1.10.0')).toBeLessThan(0);
    expect(compareVersions('2.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
  });
  it('min보다 낮으면 필수, latest보다 낮으면 선택, 같으면 그대로', () => {
    expect(judgeVersion('1.0.0', { latest: '1.1.0', min: '1.1.0' }).status).toBe('required');
    expect(judgeVersion('1.0.0', { latest: '1.1.0', min: '1.0.0' }).status).toBe('optional');
    expect(judgeVersion('1.1.0', { latest: '1.1.0', min: '1.0.0' }).status).toBe('ok');
    expect(judgeVersion('1.0.0', {}).status).toBe('ok'); // 잘못된 파일이면 막지 않음
  });
});
