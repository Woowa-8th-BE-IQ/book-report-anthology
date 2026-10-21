# CLAUDE.md — 남의 독후감 (가칭)

같은 책을 읽은 사람들이 각자 독후감을 한 편씩 쓰고, 한 권의 EPUB 문집으로 엮는 서비스.
핵심 경험: "남의 독후감이 궁금해서 산다" — 내 글을 제출해야 남의 글이 열린다.

## 먼저 읽을 것

- `docs/design.md` — 도메인 규칙, 상태, 스키마, 라우트, 동시성. 코드보다 이 문서가 먼저다.
- `docs/design-language.md` — 디자인 토큰과 효과.

## 스택

- Java 21, Spring Boot 3.4, Gradle
- Spring JDBC(`JdbcClient`). JPA는 쓰지 않는다.
- Thymeleaf 서버 렌더링 + Vanilla JS(번들러 없음)
- H2(로컬·테스트), PostgreSQL 호환 SQL만 쓴다.

## 명령

```bash
./gradlew test       # 전체 테스트
./gradlew bootRun    # http://localhost:8080
```

## 규칙

- 도메인 모델(`Anthology`, `Essay`, `Shelf`, `Manuscript`, `EpubWriter`, `PdfBook`, `CoverArt`)은 Spring에 의존하지 않는다.
- 잠긴 글의 본문은 서버가 화면에 보내지 않는다. 티저는 길이·답글 수 같은 숫자만.
- 비즈니스 규칙 위반은 `DomainException(ErrorType, message)`로 던진다. 상태 코드는 `ErrorType`이 가진다(404/403/409/422).
- 사용자에게 보이는 메시지의 조사는 `Texts.josa`로 받침에 맞춘다. "을(를)"을 쓰지 않는다.
- 동시성은 DB 제약(UNIQUE, 조건부 UPDATE, FOR UPDATE)으로 막는다.
- 완료된 상태(`CLOSED`, `SUBMITTED`)는 되돌리지 않는다.
- 템플릿에서 도메인 값은 메서드 호출로 쓴다: `${a.title()}`.
- 숨겼다가 보여 주는 효과는 `.js` 클래스 아래에만 건다. JS가 실패해도 내용은 보여야 한다.
- 테스트
  - 도메인 규칙은 단위 테스트로 고정한다.
  - 서비스 테스트의 저장소는 Fake(`src/test/.../fake`). Fake는 사본을 돌려줘 저장 누락을 잡는다.
  - 저장소·DB 제약은 `@JdbcTest`로 실제 H2에서.
  - 화면 흐름 전체는 `AnthologyFlowTest`(MockMvc) 하나로 지킨다.
- 커밋: 한국어 conventional commit (`feat: 문집 마감 구현`).

## 저작권

밑줄(원문 인용)은 한 편에 하나, 150자 상한이고 모든 인용에 원서 출처가 붙는다. 이 상한을 풀지 않는다.
공개 소개 페이지에는 본문을 내보내지 않는다. 예외는 쓴 사람이 직접 허락한 맛보기 한 편뿐이다.
디자인은 한 인디 북클럽 랜딩의 분위기와 효과만 재해석했다. 다른 서비스의 로고·사진·문구는 가져오지 않는다.
