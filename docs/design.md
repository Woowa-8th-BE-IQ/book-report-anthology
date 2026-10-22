# 덕후감 설계

같은 책 한 권을 읽은 사람들이 각자 독후감을 한 편씩 쓰고, 그 글을 한 권의 전자책(EPUB) 문집으로 엮는다.

영감은 『일단 나부터 리팩터링 합니다 1』(우아한테크코스 6기 크루 45명, 부크크)에서 왔다. 목차가 곧 지은이 목록이고(`감자(김주하) … 5`), 엮은이가 소개와 정렬을 맡는 구조를 그대로 가져왔다.

핵심 경험은 "남의 독후감이 궁금해서 산다"이다.

## 1. 흐름

```
엮은이가 문집을 연다 (책, 마감일) → 초대 링크로 참여 (최대 100명)
  → 각자 독후감을 쓴다 (초안 저장 ↔ 제출)
  → 내 글을 제출하면 남의 제출된 글이 열린다 → 읽고 답글
  → 엮은이가 마감 (제출 2편 이상)
  → 원고 미리보기 · 각자 책에서 뺄지 결정 → EPUB 다운로드
  → 공개 소개 페이지: 도서 소개 + 목차만 (본문 없음)
```

## 2. 도메인 규칙

| 규칙 | 내용 | 위반 시 |
| --- | --- | --- |
| 참여 | 모으는 중일 때만, 최대 100명, 닉네임 유일 | 422 / 409 |
| 지은이 표기 | `닉네임(실명)`, 실명은 선택 | — |
| 독후감 | 문집당 한 사람 한 편 | 409 |
| 초안 | 비어 있어도 저장. 최대 길이만 검사 | 422 |
| 제출 | 제목 1~60자, 본문 200~30,000자 | 422 |
| 제출 후 수정 | 마감 전까지 가능. 단 제출 기준을 계속 지켜야 한다 | 422 |
| 밑줄(원문 인용) | 한 편에 하나, 최대 150자 | 422 |
| 읽기 | 내 글은 언제나. 남의 글은 제출된 것만, 내가 제출했거나 마감된 뒤에 | 403 |
| 답글 | 읽을 수 있는 남의 제출된 글에만. 책에는 안 실린다 | 403 / 422 |
| 도서 소개 | 엮은이만, 마감 전까지, 최대 2,000자 | 403 / 422 |
| 마감 | 엮은이만, 제출 2편 이상. 되돌릴 수 없다 | 403 / 422 |
| 책 포함 여부 | 마감 뒤 본인 글만 | 403 / 422 |
| 글감 질문 | 엮은이만, 마감 전까지, 최대 3개, 한 줄 100자 | 403 / 422 |
| 링크 다시 만들기 | 엮은이만, 다른 사람의 링크만. 옛 토큰은 즉시 막힌다 | 403 / 422 |
| 내보내기 | 엮은이만, 마감 전, 엮은이 자신은 못 내보낸다. 그 사람의 글·답글·기록도 지운다 | 403 / 422 |
| 책 순서 | 엮은이가 정한 순서(마감 뒤 ↑↓) → 없으면 닉네임 가나다순(한국어 Collator) → 먼저 낸 순 | 403 / 422 |
| 부록 | 엮은이만, 언제든, 최대 10,000자. 비우면 빠진다 | 403 / 422 |
| 공개 맛보기 | 마감 뒤 쓴 사람만 허락·철회. 책에 실리는 글 중 책 순서로 첫 한 편만 공개 | 403 / 422 |
| 책 생성 | 마감 후, 실릴 글이 한 편 이상 | 422 |

밑줄 150자 상한은 저작권법 제28조(정당한 범위의 인용)를 지키기 위한 제품 규칙이다. 모든 밑줄에는 원서 출처가 자동으로 붙는다. 수치는 법률 자문 후 조정한다.

### 상태

```
문집:   COLLECTING ──마감──▶ CLOSED        (역방향 없음)
독후감: DRAFT ──제출──▶ SUBMITTED          (역방향 없음)
```

## 3. 신원

계정이 없다. 참여할 때 비밀 토큰(UUID)을 발급한다.

- 문집별 쿠키 `ab_{code}`에 180일. HttpOnly, SameSite=Lax(다른 사이트 POST엔 안 실림).
- 다른 기기에서는 개인 링크 `/me/{token}`으로 이어 쓴다.
- 페이지에 `referrer: same-origin`을 걸어 토큰 URL이 밖으로 새지 않게 한다.

## 4. 스키마 (H2 / PostgreSQL 호환)

```sql
anthology(id, code UNIQUE, title, book_title, book_author, introduction, due_date,
          status, created_at, closed_at)
contributor(id, anthology_id, nickname, real_name, token UNIQUE, join_order, joined_at,
            UNIQUE(anthology_id, join_order), UNIQUE(anthology_id, nickname))
essay(id, anthology_id, contributor_id, title, quote, body TEXT, status, included_in_book,
      created_at, updated_at, submitted_at, UNIQUE(anthology_id, contributor_id))
reply(id, essay_id, contributor_id, body, created_at)
activity(id, anthology_id, contributor_id, kind, essay_id, created_at)   -- 퍼널 기록
room_message(id, anthology_id, contributor_id, body, created_at)        -- 모임방
-- contributor.last_seen_at(마지막 접속), avatar_style(캐릭터), last_read_message_id(모임방 어디까지 읽었나)
-- 2차: anthology.prompts, anthology.appendix, essay.book_order, essay.public_sample
--      (ALTER TABLE … ADD COLUMN IF NOT EXISTS 로 기존 DB에 그대로 붙는다)
```

동시성은 DB가 막는다.

| 경쟁 | 방어 |
| --- | --- |
| 두 사람이 동시에 참여 | `UNIQUE(anthology_id, join_order)` → 409 |
| 한 사람이 두 탭에서 첫 저장 | `UNIQUE(anthology_id, contributor_id)` → 409 |
| 마감과 제출이 동시에 | 둘 다 `SELECT … FOR UPDATE`로 문집 행을 잠그고 상태를 다시 읽는다 |
| 마감 두 번 | `UPDATE … WHERE status = 'COLLECTING'` 0행이면 409 |

## 5. 라우트

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| GET | `/` | 랜딩 |
| GET | `/anthologies/new` | 문집 열기 폼 |
| POST | `/anthologies` | 문집 열기 |
| GET | `/anthologies/{code}` | 문집 화면 (비참여자면 참여 폼) |
| POST | `/anthologies/{code}/contributors` | 참여 |
| POST | `/anthologies/{code}/introduction` | 도서 소개 저장 (엮은이) |
| POST | `/anthologies/{code}/prompts` | 글감 질문 저장 (엮은이) |
| POST | `/anthologies/{code}/appendix` | 부록 저장 (엮은이) |
| POST | `/anthologies/{code}/contributors/{id}/reissue` | 개인 링크 다시 만들기 (엮은이) |
| POST | `/anthologies/{code}/contributors/{id}/remove` | 참여자 내보내기 (엮은이) |
| POST | `/anthologies/{code}/essay/autosave` | 자동 저장. JSON으로 답한다 |
| POST | `/anthologies/{code}/essays/{id}/move` | 차례 순서 바꾸기 `delta=±1` (엮은이, 마감 뒤) |
| POST | `/anthologies/{code}/essays/{id}/sample` | 공개 맛보기 허락·철회 (쓴 사람) |
| GET | `/anthologies/{code}/book.pdf` | A5 인쇄용 PDF (참여자만) |
| GET | `/anthologies/{code}/room` | 모임방 (참여자만, 아니면 참여 폼으로) |
| GET | `/anthologies/{code}/room/stream` | 모임방 실시간 연결 (SSE) |
| POST | `/anthologies/{code}/room/messages` | 말하기. `X-Room` 헤더면 JSON, 아니면 PRG |
| POST | `/anthologies/{code}/room/typing` | 쓰는 중 알리기 (저장 안 함) |
| POST | `/anthologies/{code}/room/position` | 내 아바타 자리 옮기기 (저장 안 함) |
| POST | `/anthologies/{code}/room/read` | 여기까지 읽었다 `upTo=말 id` (뒤로 가지 않음) |
| GET | `/anthologies/{code}/avatar` | 캐릭터 꾸미기 |
| POST | `/anthologies/{code}/avatar` | 캐릭터 저장. `X-Room` 헤더면 JSON |
| GET | `/avatars/v3/{style}.svg` | 모양 글자로 그린 아바타 (오래 캐시, 그림체를 바꾸면 판을 올림) |
| GET | `/pet` | 데스크톱 펫 화면 (출입증의 모든 문집) |
| POST | `/pet/leave` | 펫에서 문집 빼기 (출입증만 지움) |
| POST | `/pet/anthologies` | 펫에서 문집 열기. JSON(초대 링크·개인 링크) |
| POST | `/pet/join` | 펫에서 초대 링크로 참여. 이미 참여했으면 그대로 |
| GET | `/anthologies/{code}/write` | 내 독후감 쓰기 |
| POST | `/anthologies/{code}/essay` | 저장(`action=save`) / 제출(`action=submit`) |
| GET | `/anthologies/{code}/essays/{id}` | 독후감 읽기 |
| POST | `/anthologies/{code}/essays/{id}/replies` | 답글 |
| POST | `/anthologies/{code}/close` | 마감 (엮은이) |
| GET | `/anthologies/{code}/book` | 원고 미리보기 |
| POST | `/anthologies/{code}/essays/{id}/inclusion` | 책 포함 여부 |
| GET | `/anthologies/{code}/book.epub` | EPUB 다운로드 (참여자만) |
| GET | `/anthologies/{code}/about` | 공개 소개 페이지 (마감 후, 목차만) |
| GET | `/me/{token}` | 개인 링크로 이어 쓰기 |

폼은 PRG. 규칙 위반(422)·충돌(409)은 입력값을 들고 폼으로 돌아가고, 권한(403)·없음(404)은 오류 화면으로 간다.

## 6. EPUB

EPUB 3, `java.util.zip`만 쓴다. epubcheck 통과.

```
mimetype                  무압축, 첫 항목
META-INF/container.xml
OEBPS/content.opf         dc:creator = 각 지은이, cover-image
OEBPS/cover.svg           표지 그림 (CoverArt: 종이 카드 + 제목 + N명)
OEBPS/cover.xhtml         표지 (spine 첫 장)
OEBPS/title.xhtml         표제지: 제목 · "~을 읽고" · N명이 쓴 독후감
OEBPS/introduction.xhtml  도서 소개 + 글감 질문 (있을 때만)
OEBPS/nav.xhtml           차례: 지은이 · 제목
OEBPS/essay-{n}.xhtml     독후감 (밑줄 + 출처, 본문)
OEBPS/appendix.xhtml      부록 (있을 때만)
OEBPS/colophon.xhtml      지은이 목록, 마감일, 저작권 안내
```

### 인쇄용 PDF (POD)

OpenPDF로 A5(148×210mm) PDF를 만든다. 부크크·교보 퍼플에 그대로 올리는 용도.

- 나눔명조(OFL)를 `resources/fonts`에 두고 서브셋으로 넣는다.
- 표제 → 소개·질문 → 차례 → 글(한 편씩 새 쪽) → 부록 → 판권. 표제 쪽엔 쪽번호가 없다.
- 차례의 쪽번호는 두 번 그려서 얻는다(첫 번째에서 각 글의 시작 쪽을 재고, 두 번째에 채운다).
- 줄바꿈은 어절 단위.

## 7. 화면 경험 (2차)

| 장면 | 하는 일 |
| --- | --- |
| 쓰기 | 2.5초 쉬면 자동 저장(15초 넘게 계속 쓰면 그 사이에도). 서버보다 먼저 이 기기(localStorage)에 사본. 사본이 서버보다 새것이면 "불러올까요?" |
| 200자 문턱 | 본문 아래 선이 차오른다. 넘으면 "제출할 수 있어요" |
| 제출 전 | 책 한 쪽에 실린 모습으로 미리보기 → "이대로 제출하기" |
| 열리는 순간 | 첫 제출 직후 잠긴 카드가 하나씩 테이프가 떨어지며 열린다 |
| 잠긴 카드 | 본문은 서버가 보내지 않는다. 글 길이에 비례한 줄 수, 분량·답글 수만 |
| 책장 | 지난 방문 뒤 들어온 글에 "새 글", 읽은 글은 흐리게, "안 읽은 글만" 보기 (이 기기 기준) |
| 카드 → 글 | View Transitions로 카드가 글 종이로 이어진다 |
| 마감 직후 | 종이가 쌓이고 표지가 덮이는 장면. 누르면 넘어간다 |
| 엮은이 | 퍼널(참여→써 봄→제출→읽음→내려받음), 아직 안 낸 사람에게 보낼 문구 복사 |
| 링크 미리보기 | 카카오톡·슬랙용 OG 태그와 1200×630 이미지 |

### 모임방

문집마다 방이 하나. 참여자는 닉네임과 참여 순서로 그린 아바타(`Avatar`, SVG)로 책상에 둘러앉는다.

- 실시간은 SSE. `RoomHub`가 서버 메모리에 연결을 들고 `hello`·`presence`·`message`·`typing`을 보낸다.
- 20초마다 빈 신호(keep-alive)로 프록시가 연결을 끊지 않게 하고, 끊긴 연결을 걸러 낸다. 연결은 15분마다 새로 붙는다(EventSource가 자동으로).
- 말은 1~500자, DB에 남는다. 방에 들어오면 최근 160개(펫은 60개)를 보여 준다. 마감 뒤에도 열려 있다.
- 서버가 한 대라는 전제다. 여러 대로 늘리면 Redis pub/sub 같은 중계가 필요하다.
- 엮은이가 참여자를 내보내면 그 사람의 말과 연결도 정리한다.
- **부르기**: 말 속 `@닉네임`(겹치면 가장 긴 이름), `@모두`. `message` 이벤트의 `mentions`에 부른 사람 id가 담긴다(`Mentions`). 저장하지 않고 그릴 때마다 다시 찾는다.
- **문집 소식**: `EssayService`가 `EssayEvents`(제출·답글·마감)를 내고, 커밋 뒤 `RoomNews`가 받아 지금 연결된 사람에게 `news` 이벤트로 보낸다. 사람마다 글이 다르다(낸 사람에게는 "읽을 수 있어요", 안 낸 사람에게는 "내면 N편이 열려요"). 잠긴 글의 본문은 보내지 않는다. 소식은 저장하지 않는다.
- **마감 재촉**: 마감이 오늘·내일이고 아직 안 냈으면, 방에 들어올 때와 10분마다 확인해 하루 한 번 낮(9~23시)에만 보낸다. 보낸 기록은 서버 메모리에 있어 재시작하면 한 번 더 갈 수 있다.
- **안 읽은 수**: `contributor.last_read_message_id`. 처음 방에 오면 그때까지를 읽은 것으로 친다. 펫·방이 보고 있을 때 `/room/read`로 올린다.

### 데스크톱 펫

- `/pet`은 이 브라우저(펫)가 가진 문집 출입증(`ab_{code}` 쿠키)을 모두 읽어 문집마다 탭을 만든다. 개인 링크를 붙일 때마다 출입증이 하나씩 쌓인다(`/me/{token}?to=pet`).
- 문집마다 실시간 연결(SSE)을 하나씩 연다. 말풍선에는 문집이 둘 이상일 때 `[문집 이름]`을 붙인다.
- 우클릭 메뉴와 캐릭터 바꾸기는 펫이 띄우는 웹 화면에 있어서, 서버만 배포해도 예전 펫 앱에 반영된다.
- 펫 앱은 켤 때와 30분마다 GitHub 릴리스에서 새 버전을 찾아 받아 두고, 누르면(아니면 끌 때) 바꿔 끼운다.
- 소식·부르기 말풍선은 누를 때까지 남는 것(부르기·답글·마감 재촉)과 저절로 사라지는 것(말 9초, 나머지 소식 30초)이 있다.

## 8. 패키지

```
com.iq.anthology
├── anthology  Anthology, Contributor, AnthologyService, AnthologyRepository(+Jdbc)
├── essay      Essay, Reply, Shelf(읽기 규칙·책 순서), EssayService, EssayEvents, 저장소(+Jdbc)
├── activity   ActivityLog(+Jdbc), ActivityType, Funnel
├── room       Avatar, RoomMessage, RoomHub(SSE), RoomService, Mentions, RoomNews(소식·재촉), 저장소(+Jdbc)
├── book       Manuscript, ManuscriptFactory, EpubWriter, CoverArt, PdfBook, BookService
├── support    DomainException, ErrorType, Texts(글자 수·조사), IdentifierGenerator
└── web        AnthologyController, EditorController, DraftApiController, RoomController, ShelfView, ContributorCookies, ErrorPages
```

도메인 모델은 Spring에 의존하지 않는다.

## 9. 다음 단계 (이번 범위 밖)

- 공개 소개 페이지에서 구매 연결
- 마감일 알림 (메일) — 지금은 펫·모임방에 연결된 사람에게만 간다
- 책장의 "읽은 글" 표시를 기기 밖(서버)으로
