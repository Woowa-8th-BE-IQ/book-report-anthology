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
    private final String token;
    private final int joinOrder;
    private final LocalDateTime joinedAt;

    public Contributor(Long id, String nickname, String realName, String token, int joinOrder,
                       LocalDateTime joinedAt) {
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

    public boolean isEditor() {
        return joinOrder == 0;
    }

    public boolean hasToken(String candidate) {
        return token.equals(candidate);
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
