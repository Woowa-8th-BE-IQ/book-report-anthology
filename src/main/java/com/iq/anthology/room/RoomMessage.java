package com.iq.anthology.room;

import com.iq.anthology.support.Texts;
import java.time.LocalDateTime;
import java.util.Objects;

/** 모임방에 남긴 말 한 마디. 문집 안에서만 보이고 책에는 실리지 않는다. */
public class RoomMessage {

    public static final int BODY_MAX = 500;

    private Long id;
    private final Long anthologyId;
    private final Long contributorId;
    private final String body;
    private final LocalDateTime createdAt;

    public RoomMessage(Long id, Long anthologyId, Long contributorId, String body, LocalDateTime createdAt) {
        this.id = id;
        this.anthologyId = Objects.requireNonNull(anthologyId);
        this.contributorId = Objects.requireNonNull(contributorId);
        this.body = Objects.requireNonNull(body);
        this.createdAt = Objects.requireNonNull(createdAt);
    }

    public static RoomMessage say(Long anthologyId, Long contributorId, String body, LocalDateTime now) {
        return new RoomMessage(null, anthologyId, contributorId, Texts.required(body, "말", 1, BODY_MAX), now);
    }

    public void assignId(Long id) {
        if (this.id != null) {
            throw new IllegalStateException("이미 저장된 말입니다.");
        }
        this.id = id;
    }

    public Long id() {
        return id;
    }

    public Long anthologyId() {
        return anthologyId;
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
