package com.iq.anthology;

import com.iq.anthology.anthology.Anthology;
import com.iq.anthology.anthology.Contributor;
import com.iq.anthology.essay.Essay;
import java.time.LocalDate;
import java.time.LocalDateTime;

/** 테스트 공용 재료. id는 저장소 없이 직접 매긴다. */
public final class Fixtures {

    public static final LocalDateTime NOW = LocalDateTime.of(2026, 10, 20, 20, 0);
    public static final String LONG_BODY = "같은 책을 읽고도 서로 다른 문장에 멈춘다는 게 신기했다. ".repeat(10);

    private Fixtures() {
    }

    /** 엮은이 레오(한동희), 감자, 구름(김민수)가 있는 문집. id: 문집 1, 참여자 10·11·12 */
    public static Anthology anthologyWithThree() {
        Anthology anthology = Anthology.open("abcd2345", "일단 나부터 읽어 봅니다", "리팩터링", "마틴 파울러",
                LocalDate.of(2026, 11, 30), "레오", "한동희", "token-editor", NOW);
        anthology.assignId(1L);
        anthology.editor().assignId(10L);
        anthology.join("감자", null, "token-potato", NOW).assignId(11L);
        anthology.join("구름", "김민수", "token-cloud", NOW).assignId(12L);
        return anthology;
    }

    public static Contributor potato(Anthology anthology) {
        return anthology.contributorById(11L);
    }

    public static Contributor cloud(Anthology anthology) {
        return anthology.contributorById(12L);
    }

    public static Essay submitted(Long id, Long contributorId, String title, LocalDateTime submittedAt) {
        Essay essay = Essay.start(1L, contributorId, NOW);
        essay.assignId(id);
        essay.revise(title, null, LONG_BODY, NOW);
        essay.submit(submittedAt);
        return essay;
    }

    public static Essay draft(Long id, Long contributorId) {
        Essay essay = Essay.start(1L, contributorId, NOW);
        essay.assignId(id);
        essay.revise("쓰는 중", null, "아직 짧아요", NOW);
        return essay;
    }
}
