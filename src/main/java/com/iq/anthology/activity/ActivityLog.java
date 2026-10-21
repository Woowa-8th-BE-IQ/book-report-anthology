package com.iq.anthology.activity;

/**
 * 행동 기록. 기획서의 가설("제출이 남의 글을 여는 장치로 작동한다")을 숫자로 확인하기 위해 남긴다.
 * 문집 단위로만 센다.
 */
public interface ActivityLog {

    /** contributorId와 essayId는 없을 수 있다(예: 공개 소개 페이지 방문). */
    void record(Long anthologyId, Long contributorId, ActivityType type, Long essayId);

    /** 기록에서만 알 수 있는 것: 읽기·내려받기·소개 페이지 방문. 참여·제출 수는 현재 데이터에서 센다. */
    Engagement engagement(Long anthologyId);

    void forgetContributor(Long contributorId);

    /**
     * @param readers    남의 글을 한 편 이상 읽은 사람 수
     * @param readPairs  (읽은 사람, 읽은 글) 서로 다른 쌍의 수
     * @param downloaded 책을 내려받은 사람 수
     * @param aboutViews 공개 소개 페이지 방문 수
     */
    record Engagement(long readers, long readPairs, long downloaded, long aboutViews) {

        public static final Engagement NONE = new Engagement(0, 0, 0, 0);
    }
}
