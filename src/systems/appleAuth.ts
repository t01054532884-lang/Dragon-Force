// Sign in with Apple(iOS 앱 전용, docs/PAYMENTS.md 1절).
// iOS 기본 Apple 로그인 창(Capacitor 플러그인)으로 받은 토큰을 Firebase 자격 증명으로 바꾼다.
// nonce: 무작위 원문은 Firebase에, 그 SHA-256 값은 Apple에 준다(토큰을 다른 곳에서 재사용하지 못하게).

type AuthModule = typeof import('firebase/auth');

export class AppleCancelled extends Error {}

function randomNonce(bytes = 32): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (v) => v.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (v) => v.toString(16).padStart(2, '0')).join('');
}

/** Apple 로그인 창 → Firebase 자격 증명 + 인가 코드(계정 삭제 때 Apple 토큰 해지에 씀). 사용자가 닫으면 AppleCancelled */
export async function appleCredential(A: AuthModule, authDomain: string): Promise<{ credential: import('firebase/auth').OAuthCredential; authorizationCode: string }> {
  const rawNonce = randomNonce();
  const { SignInWithApple } = await import('@capacitor-community/apple-sign-in');
  let res;
  try {
    res = await SignInWithApple.authorize({
      clientId: 'com.dragonforce.app', // iOS 기본 창은 앱 번들 ID를 쓴다(웹용 값은 무시됨)
      redirectURI: `https://${authDomain}/__/auth/handler`,
      scopes: '', // 이름·이메일은 받지 않는다(개인정보 최소 수집)
      nonce: await sha256Hex(rawNonce),
    });
  } catch (e) {
    const msg = String((e as { message?: string; code?: string })?.message ?? e);
    if (/1001|cancel/i.test(msg)) throw new AppleCancelled();
    throw e;
  }
  const credential = new A.OAuthProvider('apple.com').credential({ idToken: res.response.identityToken, rawNonce });
  return { credential, authorizationCode: res.response.authorizationCode };
}
