package com.iq.anthology.essay;

import com.iq.anthology.support.DomainException;
import com.iq.anthology.support.Texts;
import java.time.LocalDateTime;
import java.util.Objects;

/** 다른 사람 독후감에 다는 답글. 문집 안에서만 보이고 책에는 들어가지 않는다. */
public class Reply {

    public static final int BODY_MAX = 1000;

    private Long id;
    private final Long essayId;
    private final Long contributorId;
    private final String body;
    private final LocalDateTime createdAt;

    public Reply(Long id, Long essayId, Long contributorId, String body, LocalDateTime createdAt) {
        this.id = id;
        this.essayId = Objects.requireNonNull(essayId);
        this.contributorId = Objects.requireNonNull(contributorId);
        this.body = Objects.requireNonNull(body);
        this.createdAt = Objects.requireNonNull(createdAt);
    }

    public static Reply to(Essay essay, Long contributorId, String body, LocalDateTime now) {
        if (!essay.isSubmitted()) {
            throw DomainException.rule("제출한 독후감에만 답글을 달 수 있어요.");
        }
        if (essay.isWrittenBy(contributorId)) {
            throw DomainException.forbidden("내 글에는 답글을 달 수 없어요.");
        }
        return new Reply(null, essay.id(), contributorId, Texts.required(body, "답글", 1, BODY_MAX), now);
    }

    public void assignId(Long id) {
        if (this.id != null) {
            throw new IllegalStateException("이미 저장된 답글입니다.");
        }
        this.id = id;
    }

    public Long id() {
        return id;
    }

    public Long essayId() {
        return essayId;
    }

    public Long contributorId() {
        return contributorId;
    }

    public String body() {
        return body;
    }

    public LocalDateTime createdAt() {
        return createdAt;
    }
}
