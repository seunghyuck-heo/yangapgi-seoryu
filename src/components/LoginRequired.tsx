"use client";

import Link from "next/link";

export default function LoginRequired() {
  return (
    <div className="login-required">
      <div className="login-required__icon" aria-hidden>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="10" width="16" height="10" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </svg>
      </div>
      <div className="login-required__title">로그인이 필요합니다</div>
      <p className="login-required__desc">
        계정으로 로그인하면 서류 작성과 환자 기록을 이용할 수 있어요.
      </p>
      <Link href="/settings" className="login-required__btn">
        로그인 / 계정 만들기
      </Link>
    </div>
  );
}
