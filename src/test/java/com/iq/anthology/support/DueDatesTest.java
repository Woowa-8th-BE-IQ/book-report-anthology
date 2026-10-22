package com.iq.anthology.support;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.api.Test;

class DueDatesTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 10, 22);

    @ParameterizedTest
    @ValueSource(strings = {"11.30", "11/30", "11-30", "1130", "11월 30일", "11월30일", " 11. 30. ", "26.11.30",
            "2026-11-30", "2026.11.30", "20261130", "2026년 11월 30일"})
    void 연도를_안_써도_여러_모양으로_읽는다(String text) {
        assertThat(DueDates.parse(text, TODAY)).isEqualTo(LocalDate.of(2026, 11, 30));
    }

    @Test
    void 이미_지난_월일이면_내년으로_본다() {
        assertThat(DueDates.parse("1.10", TODAY)).isEqualTo(LocalDate.of(2027, 1, 10));
        assertThat(DueDates.parse("10.22", TODAY)).isEqualTo(TODAY);
    }

    @Test
    void 비어_있으면_마감일이_없다() {
        assertThat(DueDates.parse("  ", TODAY)).isNull();
        assertThat(DueDates.parse(null, TODAY)).isNull();
    }

    @Test
    void 알아볼_수_없거나_없는_날짜는_거절한다() {
        assertThatThrownBy(() -> DueDates.parse("다음 주", TODAY)).extracting("type").isEqualTo(ErrorType.RULE_VIOLATION);
        assertThatThrownBy(() -> DueDates.parse("2.30", TODAY)).extracting("type").isEqualTo(ErrorType.RULE_VIOLATION);
    }
}
