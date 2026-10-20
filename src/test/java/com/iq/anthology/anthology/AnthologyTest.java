package com.iq.anthology.anthology;

import static com.iq.anthology.Fixtures.NOW;
import static com.iq.anthology.Fixtures.anthologyWithThree;
import static com.iq.anthology.Fixtures.potato;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.iq.anthology.support.DomainException;
import com.iq.anthology.support.ErrorType;
import java.time.LocalDate;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

class AnthologyTest {

    @Nested
    class 문집_열기 {

        @Test
        void 연_사람이_엮은이가_된다() {
            Anthology anthology = Anthology.open("code", "제목", "리팩터링", null, null, "레오", null, "t", NOW);

            assertThat(anthology.editor().nickname()).isEqualTo("레오");
            assertThat(anthology.editor().isEditor()).isTrue();
            assertThat(anthology.status()).isEqualTo(AnthologyStatus.COLLECTING);
        }

        @Test
        void 지난_날짜는_마감일이_될_수_없다() {
            assertThatThrownBy(() -> Anthology.open("code", "제목", "책", null, LocalDate.of(2026, 10, 19),
                    "레오", null, "t", NOW))
                    .isInstanceOf(DomainException.class)
                    .extracting("type").isEqualTo(ErrorType.RULE_VIOLATION);
        }

        @Test
        void 책_제목이_없으면_열_수_없다() {
            assertThatThrownBy(() -> Anthology.open("code", "제목", " ", null, null, "레오", null, "t", NOW))
                    .hasMessageContaining("책 제목");
        }
    }

    @Nested
    class 참여 {

        @Test
        void 같은_닉네임은_충돌이다() {
            Anthology anthology = anthologyWithThree();

            assertThatThrownBy(() -> anthology.join("감자", null, "other", NOW))
                    .isInstanceOf(DomainException.class)
                    .extracting("type").isEqualTo(ErrorType.CONFLICT);
        }

        @Test
        void 들어온_순서대로_참여_순서가_붙는다() {
            Anthology anthology = anthologyWithThree();

            Contributor newcomer = anthology.join("낙타", null, "token-camel", NOW);

            assertThat(newcomer.joinOrder()).isEqualTo(3);
            assertThat(newcomer.isEditor()).isFalse();
        }

        @Test
        void 마감한_문집에는_들어갈_수_없다() {
            Anthology anthology = anthologyWithThree();
            anthology.close(anthology.editor(), 2, NOW);

            assertThatThrownBy(() -> anthology.join("늦은이", null, "late", NOW))
                    .extracting("type").isEqualTo(ErrorType.RULE_VIOLATION);
        }
    }

    @Nested
    class 마감 {

        @Test
        void 엮은이만_마감한다() {
            Anthology anthology = anthologyWithThree();

            assertThatThrownBy(() -> anthology.close(potato(anthology), 3, NOW))
                    .extracting("type").isEqualTo(ErrorType.FORBIDDEN);
        }

        @Test
        void 제출된_글이_두_편_미만이면_마감할_수_없다() {
            Anthology anthology = anthologyWithThree();

            assertThatThrownBy(() -> anthology.close(anthology.editor(), 1, NOW))
                    .hasMessageContaining("2편 이상");
        }

        @Test
        void 마감은_되돌릴_수_없다() {
            Anthology anthology = anthologyWithThree();
            anthology.close(anthology.editor(), 2, NOW);

            assertThat(anthology.isClosed()).isTrue();
            assertThat(anthology.closedAt()).isEqualTo(NOW);
            assertThatThrownBy(() -> anthology.close(anthology.editor(), 2, NOW))
                    .hasMessageContaining("이미 마감");
        }

        @Test
        void 마감하면_도서_소개도_고칠_수_없다() {
            Anthology anthology = anthologyWithThree();
            anthology.close(anthology.editor(), 2, NOW);

            assertThatThrownBy(() -> anthology.introduce(anthology.editor(), "다시"))
                    .extracting("type").isEqualTo(ErrorType.RULE_VIOLATION);
        }
    }

    @Test
    void 도서_소개는_엮은이만_쓴다() {
        Anthology anthology = anthologyWithThree();

        assertThatThrownBy(() -> anthology.introduce(potato(anthology), "소개"))
                .extracting("type").isEqualTo(ErrorType.FORBIDDEN);
    }

    @Test
    void 지은이_표기는_닉네임_실명이다() {
        Anthology anthology = anthologyWithThree();

        assertThat(anthology.editor().byline()).isEqualTo("레오(한동희)");
        assertThat(potato(anthology).byline()).isEqualTo("감자");
    }

    @Test
    void 읽은_책_표기는_받침에_맞는_조사를_쓴다() {
        Anthology withFinal = anthologyWithThree();
        Anthology withoutFinal = Anthology.open("c2", "제목", "데미안", "헤르만 헤세", null, "레오", null, "t", NOW);

        assertThat(withFinal.readLine()).isEqualTo("마틴 파울러, 『리팩터링』을 읽고");
        assertThat(withoutFinal.readLine()).isEqualTo("헤르만 헤세, 『데미안』을 읽고");
    }

    @Test
    void 마감까지_남은_날을_센다() {
        Anthology anthology = anthologyWithThree();

        assertThat(anthology.daysUntilDue(LocalDate.of(2026, 10, 20))).contains(41L);
        assertThat(anthology.daysUntilDue(LocalDate.of(2026, 12, 1))).isEmpty();
    }
}
