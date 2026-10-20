package com.iq.anthology.essay;

import static com.iq.anthology.Fixtures.NOW;
import static com.iq.anthology.Fixtures.anthologyWithThree;
import static com.iq.anthology.Fixtures.cloud;
import static com.iq.anthology.Fixtures.draft;
import static com.iq.anthology.Fixtures.potato;
import static com.iq.anthology.Fixtures.submitted;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.iq.anthology.anthology.Anthology;
import com.iq.anthology.support.ErrorType;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class ShelfTest {

    private final Anthology anthology = anthologyWithThree();
    private final Essay editorDraft = draft(100L, 10L);
    private final Essay potatoEssay = submitted(101L, 11L, "코드보다 나를 먼저", NOW.plusHours(2));
    private final Essay cloudEssay = submitted(102L, 12L, "이름을 바꾸는 용기", NOW.plusHours(1));

    private Shelf shelf() {
        return new Shelf(anthology, List.of(editorDraft, potatoEssay, cloudEssay), Map.of());
    }

    @Test
    void 내_글은_언제나_읽는다() {
        assertThat(shelf().canRead(anthology.editor(), editorDraft)).isTrue();
    }

    @Test
    void 내_글을_제출하기_전에는_남의_글을_못_읽는다() {
        assertThat(shelf().canRead(anthology.editor(), potatoEssay)).isFalse();
    }

    @Test
    void 내_글을_제출하면_남의_제출된_글이_열린다() {
        assertThat(shelf().canRead(potato(anthology), cloudEssay)).isTrue();
    }

    @Test
    void 남의_초안은_제출해도_못_읽는다() {
        assertThat(shelf().canRead(potato(anthology), editorDraft)).isFalse();
    }

    @Test
    void 마감하면_제출하지_않은_사람도_읽는다() {
        anthology.close(anthology.editor(), 2, NOW);

        assertThat(shelf().canRead(anthology.editor(), potatoEssay)).isTrue();
    }

    @Test
    void 참여자가_아니면_아무것도_못_읽는다() {
        assertThat(shelf().canRead(null, potatoEssay)).isFalse();
    }

    @Test
    void 책_순서는_닉네임_가나다순이고_초안은_빠진다() {
        List<Essay> order = shelf().submitted();

        assertThat(order).extracting(essay -> shelf().writerOf(essay).nickname())
                .containsExactly("감자", "구름");
    }

    @Test
    void 읽을_수_없는_글을_꺼내면_403이다() {
        assertThatThrownBy(() -> EssayService.readable(shelf(), anthology.editor(), 101L))
                .extracting("type").isEqualTo(ErrorType.FORBIDDEN);
        assertThatThrownBy(() -> EssayService.readable(shelf(), cloud(anthology), 999L))
                .extracting("type").isEqualTo(ErrorType.NOT_FOUND);
    }
}
