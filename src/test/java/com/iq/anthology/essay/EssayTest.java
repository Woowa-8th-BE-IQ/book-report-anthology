package com.iq.anthology.essay;

import static com.iq.anthology.Fixtures.LONG_BODY;
import static com.iq.anthology.Fixtures.NOW;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.iq.anthology.support.DomainException;
import com.iq.anthology.support.ErrorType;
import org.junit.jupiter.api.Test;

class EssayTest {

    @Test
    void 초안은_비어_있어도_저장된다() {
        Essay essay = Essay.start(1L, 10L, NOW);

        essay.revise(null, null, "한 줄만", NOW);

        assertThat(essay.status()).isEqualTo(EssayStatus.DRAFT);
        assertThat(essay.title()).isNull();
    }

    @Test
    void 제목_없이는_제출할_수_없다() {
        Essay essay = Essay.start(1L, 10L, NOW);
        essay.revise(null, null, LONG_BODY, NOW);

        assertThatThrownBy(() -> essay.submit(NOW)).hasMessage("제목을 입력해 주세요.");
    }

    @Test
    void 본문이_200자_미만이면_제출할_수_없다() {
        Essay essay = Essay.start(1L, 10L, NOW);
        essay.revise("제목", null, "짧은 글", NOW);

        assertThatThrownBy(() -> essay.submit(NOW))
                .extracting("type").isEqualTo(ErrorType.RULE_VIOLATION);
    }

    @Test
    void 밑줄은_150자까지만_옮길_수_있다() {
        Essay essay = Essay.start(1L, 10L, NOW);

        assertThatThrownBy(() -> essay.revise("제목", "가".repeat(151), LONG_BODY, NOW))
                .hasMessageContaining("최대 150자");
    }

    @Test
    void 글자_수는_이모지도_한_글자로_센다() {
        Essay essay = Essay.start(1L, 10L, NOW);

        essay.revise("제목", "📖".repeat(150), LONG_BODY, NOW);

        assertThat(essay.quote()).isNotNull();
    }

    @Test
    void 제출하면_제출_시각이_남고_다시_제출해도_바뀌지_않는다() {
        Essay essay = Essay.start(1L, 10L, NOW);
        essay.revise("제목", null, LONG_BODY, NOW);

        essay.submit(NOW.plusHours(1));
        essay.submit(NOW.plusHours(2));

        assertThat(essay.isSubmitted()).isTrue();
        assertThat(essay.submittedAt()).isEqualTo(NOW.plusHours(1));
    }

    @Test
    void 제출한_글을_기준_미달로_고치면_아무것도_바뀌지_않는다() {
        Essay essay = Essay.start(1L, 10L, NOW);
        essay.revise("원래 제목", "원래 밑줄", LONG_BODY, NOW);
        essay.submit(NOW);

        assertThatThrownBy(() -> essay.revise("새 제목", null, "짧게", NOW.plusDays(1)))
                .isInstanceOf(DomainException.class);

        assertThat(essay.title()).isEqualTo("원래 제목");
        assertThat(essay.quote()).isEqualTo("원래 밑줄");
        assertThat(essay.updatedAt()).isEqualTo(NOW);
    }

    @Test
    void 책_포함_여부는_쓴_사람만_바꾼다() {
        Essay essay = Essay.start(1L, 10L, NOW);

        assertThatThrownBy(() -> essay.changeInclusion(11L, false))
                .extracting("type").isEqualTo(ErrorType.FORBIDDEN);

        essay.changeInclusion(10L, false);
        assertThat(essay.includedInBook()).isFalse();
    }
}
