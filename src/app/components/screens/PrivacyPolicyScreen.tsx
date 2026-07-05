import { ArrowLeft } from "lucide-react";
import { Link } from "react-router";

const sections = [
  {
    title: "1. 처리하는 개인정보",
    body: [
      "BBARU는 회원가입 없이 사용할 수 있으며 이름, 생년월일, 주소록, 결제정보를 요구하지 않습니다.",
      "사용자가 위치 권한을 허용한 경우 현재 위치 좌표, 위치 정확도, 위치 갱신 시간이 경로 안내와 도착 예상 시간 계산에 사용됩니다.",
      "목적지 검색어, 출발지와 목적지 좌표, 선택한 경로 조건은 대중교통 경로와 보행 신호 정보를 조회하기 위해 처리될 수 있습니다.",
      "키, 보폭, 보행 속도, 알림 설정 등 사용자가 앱에서 조정한 설정은 기기 내 저장소에 보관됩니다.",
    ],
  },
  {
    title: "2. 이용 목적",
    body: [
      "현재 위치 기준 경로 탐색, 도착 예상 시간 계산, 실시간 진행률 표시, 신호 대기 반영, 출발 알림 제공에 개인정보를 사용합니다.",
      "서비스 안정성 확인, 오류 대응, 부정 이용 방지 등 운영 목적의 로그가 처리될 수 있습니다.",
    ],
  },
  {
    title: "3. 제3자 제공 및 처리 위탁",
    body: [
      "경로와 장소 검색을 위해 SK OpenAPI/Tmap API로 목적지 검색어와 경로 좌표가 전송될 수 있습니다.",
      "보행 신호 안내를 위해 공공 교통 신호 API로 경로 주변 위치 정보가 전송될 수 있습니다.",
      "웹 서비스 제공과 운영 로그 처리를 위해 Vercel 인프라를 사용합니다.",
      "BBARU는 광고 추적, 데이터 브로커 판매, 타사 마케팅 목적의 개인정보 제공을 하지 않습니다.",
    ],
  },
  {
    title: "4. 보관 기간",
    body: [
      "BBARU는 별도 계정 데이터베이스를 운영하지 않습니다.",
      "기기 내 설정과 최근 사용 정보는 사용자가 브라우저 또는 앱 데이터를 삭제할 때까지 기기에 남을 수 있습니다.",
      "운영 로그는 서비스 안정성과 보안 확인에 필요한 기간 동안만 보관됩니다.",
    ],
  },
  {
    title: "5. 사용자 선택권",
    body: [
      "위치 권한은 iOS 설정 또는 브라우저 설정에서 언제든지 허용, 거부, 철회할 수 있습니다.",
      "위치 권한을 거부해도 목적지 검색과 경로 정보 확인은 가능하지만 현재 위치 기반 실시간 안내는 제한될 수 있습니다.",
      "앱 알림은 iOS 설정 또는 브라우저 알림 설정에서 끌 수 있습니다.",
      "기기에 저장된 설정과 사용 기록은 앱 삭제, 브라우저 사이트 데이터 삭제, 또는 기기 설정을 통해 삭제할 수 있습니다.",
    ],
  },
  {
    title: "6. 아동 개인정보",
    body: [
      "BBARU는 아동을 대상으로 개인정보를 고의로 수집하지 않습니다.",
      "보호자가 아동의 개인정보 처리와 관련해 문의하면 확인 후 필요한 조치를 하겠습니다.",
    ],
  },
  {
    title: "7. 문의",
    body: [
      "개인정보 처리와 관련한 문의는 아래 연락처로 보내주세요.",
      "이메일: choim2008@naver.com",
    ],
  },
];

export function PrivacyPolicyScreen() {
  return (
    <main className="h-full overflow-y-auto bg-[#F8F9FB]">
      <div className="min-h-full bg-white px-5 pb-12 pt-6">
        <Link
          to="/"
          className="mb-6 inline-flex size-10 items-center justify-center rounded-full border border-neutral-200 text-neutral-700"
          aria-label="홈으로 이동"
        >
          <ArrowLeft className="size-5" aria-hidden="true" />
        </Link>

        <header className="mb-8">
          <p className="mb-2 text-sm font-semibold text-blue-600">BBARU</p>
          <h1 className="text-3xl font-bold leading-tight text-neutral-950">
            개인정보 처리방침
          </h1>
          <p className="mt-3 text-sm leading-6 text-neutral-600">
            시행일: 2026년 7월 5일
          </p>
        </header>

        <div className="space-y-7">
          <section className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
            <h2 className="mb-2 text-base font-bold text-blue-950">요약</h2>
            <p className="text-sm leading-6 text-blue-950">
              BBARU는 도착 예상 시간과 경로 안내를 제공하기 위해 필요한 위치 및
              경로 정보만 처리합니다. 광고 추적이나 개인정보 판매는 하지 않습니다.
            </p>
          </section>

          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="mb-3 text-lg font-bold text-neutral-950">{section.title}</h2>
              <ul className="space-y-2 text-sm leading-6 text-neutral-700">
                {section.body.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-neutral-400" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
