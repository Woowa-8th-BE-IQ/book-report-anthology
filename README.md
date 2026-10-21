# 덕후감

> 같은 책을 읽은 사람들은 무슨 생각을 했을까.

같은 책 한 권을 읽은 사람들이 각자 독후감을 한 편씩 쓰고, 한 권의 전자책 문집으로 엮는 서비스입니다.

- **내 글을 내야 남의 글이 열려요.** 제출 전에는 책장에 제목만 보여요.
- **마감하면 한 권이 돼요.** 닉네임 가나다순 목차, 도서 소개, 지은이 쪽을 갖춘 EPUB을 만들어요.
- **공개 소개 페이지**에는 목차만 보여요. 본문은 함께 쓴 사람만 읽어요.

우아한테크코스 6기 크루 45명이 함께 낸 『일단 나부터 리팩터링 합니다 1』에서 영감을 받았습니다.

## 실행

```bash
./gradlew bootRun     # http://localhost:8080
./gradlew test
```

Java 21이 필요합니다. 데이터는 `./data/anthology.mv.db`(H2 파일)에 쌓입니다.

## 문서

- [설계](docs/design.md) — 도메인 규칙, 스키마, 라우트, 동시성
- [디자인 언어](docs/design-language.md) — 토큰과 효과
- [배포](docs/deploy.md) — Render + Neon, 무료

## 스택

Java 21 · Spring Boot 3.4 · Spring JDBC · Thymeleaf · H2(로컬) · PostgreSQL(배포) · Vanilla JS
