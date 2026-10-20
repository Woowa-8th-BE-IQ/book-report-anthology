package com.iq.anthology.book;

import static com.iq.anthology.Fixtures.NOW;
import static com.iq.anthology.Fixtures.anthologyWithThree;
import static com.iq.anthology.Fixtures.draft;
import static com.iq.anthology.Fixtures.submitted;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.iq.anthology.anthology.Anthology;
import com.iq.anthology.essay.Essay;
import com.iq.anthology.essay.Shelf;
import com.iq.anthology.support.ErrorType;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class ManuscriptFactoryTest {

    private final Anthology anthology = anthologyWithThree();
    private final Essay cloudEssay = submitted(102L, 12L, "이름을 바꾸는 용기", NOW.plusHours(1));
    private final Essay potatoEssay = submitted(101L, 11L, "코드보다 나를 먼저", NOW.plusHours(2));
    private final Essay editorDraft = draft(100L, 10L);

    private Shelf shelf() {
        return new Shelf(anthology, List.of(cloudEssay, editorDraft, potatoEssay), Map.of());
    }

    @Test
    void 마감하지_않은_문집은_책이_될_수_없다() {
        assertThatThrownBy(() -> ManuscriptFactory.compose(shelf()))
                .extracting("type").isEqualTo(ErrorType.RULE_VIOLATION);
    }

    @Test
    void 제출된_글만_가나다순으로_싣고_번호를_매긴다() {
        anthology.close(anthology.editor(), 2, NOW);

        Manuscript manuscript = ManuscriptFactory.compose(shelf());

        assertThat(manuscript.pieces())
                .extracting(Manuscript.Piece::number, Manuscript.Piece::byline, Manuscript.Piece::title)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple(1, "감자", "코드보다 나를 먼저"),
                        org.assertj.core.groups.Tuple.tuple(2, "구름(김민수)", "이름을 바꾸는 용기"));
        assertThat(manuscript.readLine()).isEqualTo("마틴 파울러, 『리팩터링』을 읽고");
    }

    @Test
    void 쓴_사람이_뺀_글은_싣지_않고_번호를_다시_매긴다() {
        anthology.close(anthology.editor(), 2, NOW);
        potatoEssay.changeInclusion(11L, false);

        Manuscript manuscript = ManuscriptFactory.compose(shelf());

        assertThat(manuscript.pieces()).singleElement()
                .satisfies(piece -> {
                    assertThat(piece.number()).isEqualTo(1);
                    assertThat(piece.byline()).isEqualTo("구름(김민수)");
                });
    }

    @Test
    void 실을_글이_하나도_없으면_만들_수_없다() {
        anthology.close(anthology.editor(), 2, NOW);
        potatoEssay.changeInclusion(11L, false);
        cloudEssay.changeInclusion(12L, false);

        assertThatThrownBy(() -> ManuscriptFactory.compose(shelf()))
                .hasMessageContaining("최소 한 편");
    }

    @Test
    void 같은_문집은_언제나_같은_식별자를_갖는다() {
        anthology.close(anthology.editor(), 2, NOW);

        assertThat(ManuscriptFactory.compose(shelf()).identifier())
                .isEqualTo(ManuscriptFactory.compose(shelf()).identifier())
                .startsWith("urn:uuid:");
    }
}
