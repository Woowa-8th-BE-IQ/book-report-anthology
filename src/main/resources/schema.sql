CREATE TABLE IF NOT EXISTS anthology (
    id           BIGINT AUTO_INCREMENT PRIMARY KEY,
    code         VARCHAR(16)   NOT NULL,
    title        VARCHAR(80)   NOT NULL,
    book_title   VARCHAR(200)  NOT NULL,
    book_author  VARCHAR(100),
    introduction VARCHAR(8000),
    due_date     DATE,
    status       VARCHAR(20)   NOT NULL,
    created_at   TIMESTAMP     NOT NULL,
    closed_at    TIMESTAMP,
    CONSTRAINT uk_anthology_code UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS contributor (
    id           BIGINT AUTO_INCREMENT PRIMARY KEY,
    anthology_id BIGINT      NOT NULL,
    nickname     VARCHAR(40) NOT NULL,
    real_name    VARCHAR(60),
    token        VARCHAR(64) NOT NULL,
    join_order   INT         NOT NULL,
    joined_at    TIMESTAMP   NOT NULL,
    CONSTRAINT fk_contributor_anthology FOREIGN KEY (anthology_id) REFERENCES anthology (id),
    CONSTRAINT uk_contributor_token UNIQUE (token),
    CONSTRAINT uk_contributor_order UNIQUE (anthology_id, join_order),
    CONSTRAINT uk_contributor_nickname UNIQUE (anthology_id, nickname)
);

CREATE TABLE IF NOT EXISTS essay (
    id               BIGINT AUTO_INCREMENT PRIMARY KEY,
    anthology_id     BIGINT         NOT NULL,
    contributor_id   BIGINT         NOT NULL,
    title            VARCHAR(240),
    quote            VARCHAR(1000),
    body             TEXT,
    status           VARCHAR(20)    NOT NULL,
    included_in_book BOOLEAN        NOT NULL,
    created_at       TIMESTAMP      NOT NULL,
    updated_at       TIMESTAMP      NOT NULL,
    submitted_at     TIMESTAMP,
    CONSTRAINT fk_essay_anthology FOREIGN KEY (anthology_id) REFERENCES anthology (id),
    CONSTRAINT fk_essay_contributor FOREIGN KEY (contributor_id) REFERENCES contributor (id),
    CONSTRAINT uk_essay_writer UNIQUE (anthology_id, contributor_id)
);

CREATE TABLE IF NOT EXISTS reply (
    id             BIGINT AUTO_INCREMENT PRIMARY KEY,
    essay_id       BIGINT        NOT NULL,
    contributor_id BIGINT        NOT NULL,
    body           VARCHAR(5000) NOT NULL,
    created_at     TIMESTAMP     NOT NULL,
    CONSTRAINT fk_reply_essay FOREIGN KEY (essay_id) REFERENCES essay (id),
    CONSTRAINT fk_reply_contributor FOREIGN KEY (contributor_id) REFERENCES contributor (id)
);

CREATE INDEX IF NOT EXISTS idx_contributor_anthology ON contributor (anthology_id);
CREATE INDEX IF NOT EXISTS idx_reply_essay ON reply (essay_id);
