# 덕후감

> 같은 책을 읽은 사람들은 무슨 생각을 했을까.

같은 책을 읽은 사람들이 독후감을 한 편씩 쓰고, 한 권의 전자책 문집으로 엮는 서비스예요.

**https://book-report-anthology.onrender.com**

우아한테크코스 6기 크루 45명이 함께 낸 『일단 나부터 리팩터링 합니다 1』에서 영감을 받았어요.

## 이렇게 써요

1. **문집을 열어요.** 책 제목과 마감일을 정하면 초대 링크가 나와요. 카톡방에 붙이면 초대 카드로 보여요.
2. **각자 독후감을 써요.** 200자부터 낼 수 있어요. 쓰는 동안 저절로 저장돼요.
3. **내 글을 내야 남의 글이 열려요.** 내기 전에는 책장에 제목과 분량만 보여요.
4. **마감하면 한 권이 돼요.** 목차, 도서 소개, 부록을 갖춘 EPUB과 인쇄용 PDF를 받아요.

## 기능

| 영역 | 하는 일 |
| --- | --- |
| 문집 | 초대 링크로 참여, 개인 링크로 어느 기기에서든 이어 쓰기, 엮은이의 글감 질문·도서 소개·부록 |
| 쓰기 | 자동 저장(이 기기 사본까지), 원문 밑줄 한 줄(150자, 출처 자동), 제출 전 책 한 쪽 미리보기 |
| 읽기 | 잠긴 카드가 제출 순간 하나씩 열림, 답글, 새 글·안 읽은 글 표시 |
| 책 | 차례 순서 정하기, 책에서 빼기, EPUB·A5 PDF, 공개 소개 페이지(목차와 허락한 맛보기 한 편만) |
| 모임방 | 아바타로 책상에 둘러앉아 실시간 대화, 걸어 다니기, 캐릭터 꾸미기, 마지막 접속 시간 |
| 소식 | 누가 독후감을 냈다·내 글에 답글·마감했다·마감이 오늘/내일이다 |
| 부르기 | `@닉네임`, `@모두` — 부른 사람의 펫만 크게 반응해요 |
| 책갈피 | 마음에 든 말에 책갈피, 책갈피 모음, 마감하면 책 뒤 "함께 나눈 이야기"로 실려요 |
| 데스크톱 펫 | 내 아바타가 바탕화면에 떠 있어요. 말풍선 알림, 바로 답장, 여러 문집, 안 읽은 수, 배경음, 자동 업데이트 |

## 데스크톱 펫 설치

**맥** — 터미널에 붙여 넣기

```bash
curl -fsSL https://book-report-anthology.onrender.com/pet/install.sh | bash
```

**윈도우** — PowerShell에 붙여 넣기

```powershell
irm https://book-report-anthology.onrender.com/pet/install.ps1 | iex
```

켜지면 문집 화면의 **내 개인 링크**를 붙여 넣어요. 자세한 내용은 [펫 안내](desktop/README.md)에 있어요.

이미 깔려 있으면 껐다 켜기만 해도 새 버전을 받아요.

```bash
pkill -x BookReportPet; sleep 2; open /Applications/BookReportPet.app
```

## 개발

```bash
./gradlew bootRun     # http://localhost:8080
./gradlew test
```

Java 21이 필요해요. 로컬 데이터는 `./data/anthology.mv.db`(H2 파일)에 쌓여요.

```
src/main/java/com/iq/anthology
├── anthology  문집과 참여자
├── essay      독후감, 답글, 책장(읽기 규칙), 문집 소식 이벤트
├── room       모임방 실시간(SSE), 아바타, 부르기, 소식·마감 재촉
├── book       EPUB·PDF·표지
├── activity   퍼널 기록
├── support    오류, 글자 수·조사
└── web        컨트롤러와 화면 모델
desktop/       데스크톱 펫 (Electron)
```

## 배포

- 서버: Render(Docker, 무료) + Neon(PostgreSQL, 무료). [배포 안내](docs/deploy.md)
- 펫: `main`에 `desktop/`이 바뀌어 올라가면 GitHub Actions가 맥·윈도우 파일을 만들어 릴리스(`pet-v…`)에 올려요. 펫이 그걸 찾아 스스로 업데이트해요.

## 문서

- [설계](docs/design.md) — 도메인 규칙, 스키마, 라우트, 동시성
- [디자인 언어](docs/design-language.md) — 토큰과 효과
- [배포](docs/deploy.md) — Render + Neon
- [데스크톱 펫](desktop/README.md) — 설치와 쓰는 법

## 스택

Java 21 · Spring Boot 3.4 · Spring JDBC · Thymeleaf · Vanilla JS · H2(로컬) · PostgreSQL(배포) · Electron(펫)
