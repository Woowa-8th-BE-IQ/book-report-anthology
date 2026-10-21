package com.iq.anthology.activity;

/**
 * 한 문집의 퍼널. 들어옴 → 써 봄 → 제출 → 남의 글 읽음 → 내려받음.
 *
 * @param joined     참여자 수
 * @param saved      한 번이라도 저장한 사람 수
 * @param submitted  제출한 사람 수
 * @param engagement 읽기·내려받기 기록
 */
public record Funnel(long joined, long saved, long submitted, ActivityLog.Engagement engagement) {

    public long readers() {
        return engagement.readers();
    }

    public long downloaded() {
        return engagement.downloaded();
    }

    public long aboutViews() {
        return engagement.aboutViews();
    }

    /** 읽은 사람 한 명이 평균 몇 편을 읽었나. 소수 첫째 자리. */
    public double readsPerReader() {
        return engagement.readers() == 0 ? 0
                : Math.round(engagement.readPairs() * 10.0 / engagement.readers()) / 10.0;
    }

    /** 참여자 대비 비율(%). 막대 길이에 쓴다. */
    public int percentOf(long part) {
        return joined == 0 ? 0 : (int) Math.min(100, Math.round(part * 100.0 / joined));
    }
}
