package com.iq.anthology.anthology;

import com.iq.anthology.support.Texts;
import java.time.LocalDateTime;
import java.util.Objects;

/** 문집에 글을 쓰는 사람. 첫 번째 참여자가 엮은이다. */
public class Contributor {

    static final int NICKNAME_MAX = 12;
    static final int REAL_NAME_MAX = 20;

    private Long id;
    private final String nickname;
    private final String realName;
    private String token;
    private final int joinOrder;
    private final LocalDateTime joinedAt;
    private final LocalDateTime lastSeenAt;

    public Contributor(Long id, String nickname, String realName, String token, int joinOrder,
                       LocalDateTime joinedAt) {
        this(id, nickname, realName, token, joinOrder, joinedAt, null);
    }

    /** lastSeenAt: 마지막으로 문집에 들른 때. 아직 기록이 없으면 null(참여한 때로 본다). */
    public Contributor(Long id, String nickname, String realName, String token, int joinOrder,
                       LocalDateTime joinedAt, LocalDateTime lastSeenAt) {
        this.lastSeenAt = lastSeenAt;
        this.id = id;
        this.nickname = Objects.requireNonNull(nickname);
        this.realName = realName;
        this.token = Objects.requireNonNull(token);
        this.joinOrder = joinOrder;
        this.joinedAt = Objects.requireNonNull(joinedAt);
    }

    static Contributor newcomer(String nickname, String realName, String token, int joinOrder,
                                LocalDateTime joinedAt) {
        return new Contributor(null,
                Texts.required(nickname, "닉네임", 1, NICKNAME_MAX),
                Texts.optional(realName, "실명", REAL_NAME_MAX),
                token, joinOrder, joinedAt);
    }

    /** 목차와 본문에 쓰는 이름. 예: 감자(김주하), 실명이 없으면 감자 */
    public String byline() {
        return realName == null ? nickname : nickname + "(" + realName + ")";
    }

    public LocalDateTime lastSeenAt() {
        return lastSeenAt == null ? joinedAt : lastSeenAt;
    }

    public boolean isEditor() {
        return joinOrder == 0;
    }

    public boolean hasToken(String candidate) {
        return token.equals(candidate);
    }

    /** 새 개인 링크를 발급한다. 이전 토큰은 더 이상 통하지 않는다. */
    void reissue(String newToken) {
        this.token = Objects.requireNonNull(newToken);
    }

    public void assignId(Long id) {
        if (this.id != null) {
            throw new IllegalStateException("이미 저장된 참여자입니다.");
        }
        this.id = id;
    }

    public Long id() {
        return id;
    }

    public String nickname() {
        return nickname;
    }

    public String realName() {
        return realName;
    }

    public String token() {
        return token;
    }

    public int joinOrder() {
        return joinOrder;
    }

    public LocalDateTime joinedAt() {
        return joinedAt;
    }
}
