package com.iq.anthology.support;

/** 방 코드와 참여자 토큰을 만든다. 테스트에서는 예측 가능한 구현으로 바꾼다. */
public interface IdentifierGenerator {

    /** 초대 링크에 쓰는 짧은 문집 코드. 소문자·숫자 8자. */
    String anthologyCode();

    /** 참여자 비밀 토큰. 추측할 수 없어야 한다. */
    String participantToken();
}
