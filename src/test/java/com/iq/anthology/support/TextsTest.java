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
}
