package com.iq.anthology.room;

import static com.iq.anthology.Fixtures.NOW;
import static org.assertj.core.api.Assertions.assertThat;

import com.iq.anthology.anthology.Contributor;
import java.util.List;
import org.junit.jupiter.api.Test;

class MentionsTest {

    private final Contributor leo = new Contributor(1L, "레오", null, "t1", 0, NOW);
    private final Contributor minsu = new Contributor(2L, "민수", null, "t2", 1, NOW);
    private final Contributor minsujung = new Contributor(3L, "민수정", null, "t3", 2, NOW);
    private final List<Contributor> all = List.of(leo, minsu, minsujung);

    @Test
    void 골뱅이_뒤의_닉네임으로_부른_사람을_찾는다() {
        assertThat(Mentions.find("@민수님 이거 봤어요?", all, 1L)).containsExactly(2L);
    }

    @Test
    void 겹치는_닉네임은_가장_긴_것을_고른다() {
        assertThat(Mentions.find("@민수정 고마워요", all, 1L)).containsExactly(3L);
    }

    @Test
    void 모두를_부르면_말한_사람만_뺀다() {
        assertThat(Mentions.find("@모두 내일 마감이에요", all, 1L)).containsExactlyInAnyOrder(2L, 3L);
    }

    @Test
    void 골뱅이가_없거나_모르는_이름이면_아무도_부르지_않는다() {
        assertThat(Mentions.find("민수 안녕", all, 1L)).isEmpty();
        assertThat(Mentions.find("메일은 a@b.com", all, 1L)).isEmpty();
        assertThat(Mentions.find("@레오 나야", all, 1L)).isEmpty(); // 나를 부른 건 알리지 않는다
    }
}
