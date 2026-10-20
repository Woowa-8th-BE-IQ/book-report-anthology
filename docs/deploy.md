# 배포: Render + Neon (무료)

Render가 Spring 앱을, Neon이 PostgreSQL을 맡는다. 둘 다 무료 요금제로 된다.

| 항목 | 값 |
| --- | --- |
| 앱 | Render Web Service, Docker, free, 싱가포르 |
| DB | Neon PostgreSQL, free, AWS 싱가포르 (`ap-southeast-1`) |
| 비용 | 0원 |
| 한계 | 15분 동안 요청이 없으면 앱이 잠든다. 깨어나는 첫 요청이 50초 안팎 걸린다 |

## 1. Neon에서 DB 만들기 (3분)

1. https://neon.tech 에 GitHub로 가입한다.
2. New Project → 이름 `book-report-anthology`, Region **AWS Asia Pacific (Singapore)**.
3. Dashboard → **Connect** → "Connection pooling"을 **끈다**. (direct 주소를 쓴다)
4. 나오는 주소에서 세 값을 뽑는다.

```
postgresql://neondb_owner:비밀번호@ep-xxx-123.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
             └ DB_USERNAME └ DB_PASSWORD └──────────── 호스트 ────────────────┘ └ DB 이름 ┘
```

| Render 환경 변수 | 값 |
| --- | --- |
| `DB_URL` | `jdbc:postgresql://ep-xxx-123.ap-southeast-1.aws.neon.tech/neondb?sslmode=require` |
| `DB_USERNAME` | `neondb_owner` |
| `DB_PASSWORD` | 비밀번호 |

`DB_URL`은 앞에 `jdbc:`를 붙이고 사용자·비밀번호를 뺀 모양이다.

## 2. Render에 앱 올리기 (5분)

1. https://render.com 에 GitHub로 가입한다.
2. New → **Blueprint** → `Woowa-8th-BE-IQ/book-report-anthology`를 고른다. 조직 레포가 안 보이면 "Configure account"에서 조직 접근을 허용한다.
3. `render.yaml`을 읽고 서비스 하나를 만들겠다고 나온다. 환경 변수 세 개에 1단계 값을 넣고 **Apply**.
4. 첫 빌드는 5~8분 걸린다. 끝나면 `https://book-report-anthology.onrender.com` 같은 주소가 생긴다.

테이블은 앱이 뜰 때 `schema.sql`이 만든다. 따로 할 일은 없다.

## 이후

- `main`에 push하면 Render가 자동으로 다시 배포한다.
- 로그: Render 대시보드 → 서비스 → Logs.
- DB 내용 확인: Neon 대시보드 → SQL Editor.

## 문제가 생기면

| 증상 | 원인과 해결 |
| --- | --- |
| 기동 중 `password authentication failed` | `DB_USERNAME`·`DB_PASSWORD` 오타 |
| `prepared statement ... already exists` | pooled 주소(`-pooler`)를 썼다. direct 주소로 바꾼다 |
| 초대 링크가 `http://`로 나온다 | `forward-headers-strategy`가 빠졌다. `application-prod.yml` 확인 |
| 첫 접속이 오래 걸린다 | 무료 요금제 슬립. 정상이다 |
