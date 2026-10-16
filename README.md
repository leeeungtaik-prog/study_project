# Study Project

바닐라 HTML · CSS · JavaScript로 만든 3개의 웹앱 모음과, 이를 소개하는 메인 페이지입니다.

🔗 **배포 주소:** https://leeeungtaik-prog.github.io/study_project/

## 웹앱 소개

| 앱 | 설명 | 주요 특징 | 경로 |
|---|---|---|---|
| 💱 환율 변환기 | 금액과 통화를 선택해 환산 결과 확인 | 환율 API 연동(실패 시 대체 환율), 스왑 버튼, 입력 오류 안내 | [`currencyconverter/`](./currencyconverter/) |
| 🐍 스네이크 게임 | 방향키로 뱀을 조종하는 아케이드 게임 | Canvas, 레벨 1~10 속도 조절, 점수·최고점수·남은 시간, 기록 저장 | [`snake-game/`](./snake-game/) |
| ✅ 할 일 목록 | 할 일 추가·완료·삭제 체크리스트 | 빈 값/중복 검증, 전체·진행중·완료 필터, localStorage 저장 | [`To-Do/`](./To-Do/) |

## 폴더 구조

```
study_project/
├─ index.html            # 메인 페이지 (3개 앱 카드)
├─ README.md
├─ currencyconverter/    # 환율 변환기
├─ snake-game/           # 스네이크 게임
└─ To-Do/                # 할 일 목록
```

## 로컬 실행

```bash
# 방법 1: index.html을 브라우저에서 열기
# 방법 2: 간단한 서버 실행
python -m http.server 8000   # http://localhost:8000
```

## 배포

`main` 브랜치에 푸시하면 GitHub Actions(`.github/workflows/pages.yml`)가 GitHub Pages로 자동 배포합니다.
