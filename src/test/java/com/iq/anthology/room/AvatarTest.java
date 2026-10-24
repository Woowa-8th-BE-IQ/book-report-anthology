package com.iq.anthology.room;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.iq.anthology.anthology.Contributor;
import com.iq.anthology.support.ErrorType;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.Arrays;
import javax.xml.parsers.DocumentBuilderFactory;
import org.junit.jupiter.api.Test;

class AvatarTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 10, 24, 12, 0);

    @Test
    void 여덟_캐릭터_모두_올바른_SVG이고_얼굴이_묶여_있다() {
        for (Critter critter : Critter.values()) {
            String svg = Avatar.svg(critter);

            assertThat(svg).contains("class=\"face\"", "filter=\"url(#wob)\"", "id=\"wob\"");
            assertThatCode(() -> DocumentBuilderFactory.newInstance().newDocumentBuilder()
                    .parse(new ByteArrayInputStream(svg.getBytes(StandardCharsets.UTF_8))))
                    .as(critter.title()).doesNotThrowAnyException();
        }
    }

    @Test
    void 캐릭터는_서로_다르고_이름과_주소가_겹치지_않는다() {
        assertThat(Arrays.stream(Critter.values()).map(Avatar::svg).distinct()).hasSize(8);
        assertThat(Arrays.stream(Critter.values()).map(Critter::slug).distinct()).hasSize(8);
        assertThat(Arrays.stream(Critter.values()).map(Critter::title).distinct()).hasSize(8);
    }

    @Test
    void 고르지_않으면_참여_순서대로_돌아가며_받는다() {
        assertThat(Critter.derived(0)).isEqualTo(Critter.PENGUIN); // 문집을 연 사람
        assertThat(Critter.derived(1)).isEqualTo(Critter.DUCK);
        assertThat(Critter.derived(8)).isEqualTo(Critter.PENGUIN);
        assertThat(Arrays.stream(new int[]{0, 1, 2, 3, 4, 5, 6, 7}).mapToObj(Critter::derived).distinct()).hasSize(8);
    }

    @Test
    void 고른_캐릭터가_있으면_그것으로_예전_꾸미기_값은_순서대로_받은_캐릭터로() {
        assertThat(Avatar.critterOf(contributor(3, null))).isEqualTo(Critter.derived(3));
        assertThat(Avatar.critterOf(contributor(3, "snail"))).isEqualTo(Critter.SNAIL);
        assertThat(Avatar.critterOf(contributor(3, "c8b4e2m3x5k1"))).isEqualTo(Critter.derived(3));
        assertThat(Avatar.of(contributor(1, "frog"))).isEqualTo(Avatar.svg(Critter.FROG));
    }

    @Test
    void 없는_캐릭터는_고를_수_없다() {
        assertThatThrownBy(() -> Critter.of("<svg>")).extracting("type").isEqualTo(ErrorType.RULE_VIOLATION);
        assertThat(Critter.of("mole")).isEqualTo(Critter.MOLE);
    }

    @Test
    void 닉네임_글자를_그림에_담지_않는다() {
        Contributor sneaky = new Contributor(1L, "<script>감자</script>", null, "t", 1, NOW);

        assertThat(Avatar.of(sneaky)).doesNotContain("script").doesNotContain("감자");
    }

    private static Contributor contributor(int joinOrder, String style) {
        return new Contributor(1L, "감자", null, "t", joinOrder, NOW, null, style);
    }
}
