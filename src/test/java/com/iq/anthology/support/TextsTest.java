package com.iq.anthology.support;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class TextsTest {

    @ParameterizedTest
    @CsvSource({
            "제목, 을",
            "본문, 을",
            "소개, 를",
            "데미안, 을",
            "리팩터링, 을",
            "닉네임, 을",
            "답글, 을",
            "EPUB, 을"
    })
    void 받침에_따라_을_를을_고른다(String word, String expected) {
        assertThat(Texts.josa(word, "을", "를")).isEqualTo(expected);
    }

    @ParameterizedTest
    @CsvSource({"가나다, 3", "📖📖, 2", "'  ', 2"})
    void 글자_수는_코드_포인트로_센다(String text, int expected) {
        assertThat(Texts.length(text)).isEqualTo(expected);
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.CsvSource({
            "0, 방금", "30, 30분 전", "59, 59분 전", "60, 1시간 전", "300, 5시간 전"})
    void 지난_시간을_사람_말로_적는다(long minutes, String expected) {
        java.time.LocalDateTime now = java.time.LocalDateTime.of(2026, 10, 21, 16, 0);
        assertThat(Texts.ago(now.minusMinutes(minutes), now)).isEqualTo(expected);
    }

    @org.junit.jupiter.api.Test
    void 하루가_넘으면_날로_세고_한_달이_넘으면_날짜로_적는다() {
        java.time.LocalDateTime now = java.time.LocalDateTime.of(2026, 10, 21, 16, 0);
        assertThat(Texts.ago(now.minusHours(30), now)).isEqualTo("어제");
        assertThat(Texts.ago(now.minusDays(5), now)).isEqualTo("5일 전");
        assertThat(Texts.ago(java.time.LocalDateTime.of(2026, 9, 2, 10, 0), now)).isEqualTo("9월 2일");
    }
}
