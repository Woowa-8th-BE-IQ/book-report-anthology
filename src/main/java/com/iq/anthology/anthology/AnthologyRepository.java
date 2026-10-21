package com.iq.anthology.anthology;

import java.util.Optional;

public interface AnthologyRepository {

    /** 새 문집과 엮은이를 저장하고 id를 채운다. */
    Anthology save(Anthology anthology);

    /** 참여자를 추가한다. 같은 참여 순서나 닉네임이 이미 있으면 충돌(409)이다. */
    Contributor addContributor(Long anthologyId, Contributor contributor);

    /** 도서 소개·글감 질문·부록을 저장한다. */
    void updateTexts(Anthology anthology);

    void updateToken(Contributor contributor);

    void updateAvatar(Contributor contributor);

    /** 마지막 접속 시간을 남긴다. 1분 안에 다시 들르면 쓰지 않는다(조건부 UPDATE). */
    void touch(Long contributorId, java.time.LocalDateTime now);

    /** 참여자를 지운다. 그 사람의 글·답글은 서비스가 먼저 지운다. */
    void deleteContributor(Long contributorId);

    /** 마감 상태를 저장한다. 이미 마감됐으면(다른 요청이 먼저 바꿨으면) 충돌(409)이다. */
    void markClosed(Anthology anthology);

    Optional<Anthology> findByCode(String code);

    /**
     * 문집 행을 잠그고 최신 상태로 읽는다(SELECT ... FOR UPDATE). 제출과 마감이 동시에 일어나도
     * "마감 뒤 제출"이 끼어들지 않게 둘을 줄 세운다.
     */
    Optional<Anthology> lockByCode(String code);

    Optional<Anthology> findByContributorToken(String token);

    boolean existsByCode(String code);
}
