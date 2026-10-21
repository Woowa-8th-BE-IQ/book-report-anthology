package com.iq.anthology.room;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.iq.anthology.anthology.Contributor;
import com.iq.anthology.support.ErrorType;
import java.time.LocalDateTime;
import java.util.Random;
import org.junit.jupiter.api.Test;

class AvatarStyleTest {

    @Test
    void 글자로_적고_다시_읽으면_같은_모양이다() {
        AvatarStyle style = new AvatarStyle(9, 4, 3, 2, 5, 1);

        assertThat(style.format()).isEqualTo("c9b4e3m2x5k1");
        assertThat(AvatarStyle.parse("c9b4e3m2x5k1")).isEqualTo(style);
    }

    @Test
    void 없는_조각이나_엉뚱한_글자는_거절한다() {
        assertThatThrownBy(() -> AvatarStyle.parse("c10b0e0m0x0k0")).extracting("type").isEqualTo(ErrorType.RULE_VIOLATION);
        assertThatThrownBy(() -> AvatarStyle.parse("c0b9e0m0x0k0")).extracting("type").isEqualTo(ErrorType.RULE_VIOLATION);
        assertThatThrownBy(() -> AvatarStyle.parse("<svg>")).extracting("type").isEqualTo(ErrorType.RULE_VIOLATION);
    }

    @Test
    void 고르지_않은_사람은_예전과_같은_색을_참여_순서로_받는다() {
        assertThat(AvatarStyle.derived("감자", 1).color()).isEqualTo(0);
        assertThat(AvatarStyle.derived("감자", 9).color()).isEqualTo(0); // 처음 8색 안에서 돈다
        assertThat(AvatarStyle.derived("감자", 2)).isEqualTo(AvatarStyle.derived("감자", 2));
    }

    @Test
    void 뽑기는_언제나_고를_수_있는_모양을_낸다() {
        Random random = new Random(7);
        for (int i = 0; i < 500; i++) {
            AvatarStyle style = AvatarStyle.random(random);
            assertThat(AvatarStyle.parse(style.format())).isEqualTo(style);
        }
    }

    @Test
    void 고른_모양이_있으면_그것으로_그린다() {
        Contributor plain = new Contributor(1L, "감자", null, "t", 1, LocalDateTime.now());
        Contributor dressed = new Contributor(1L, "감자", null, "t", 1, LocalDateTime.now(), null, "c8b4e2m3x5k1");

        assertThat(Avatar.of(plain)).isEqualTo(Avatar.svg("감자", 1));
        assertThat(Avatar.of(dressed)).isEqualTo(Avatar.svg(AvatarStyle.parse("c8b4e2m3x5k1")));
    }

    @Test
    void 모든_조각_조합이_올바른_SVG다() throws Exception {
        var factory = javax.xml.parsers.DocumentBuilderFactory.newInstance();
        for (int body = 0; body < AvatarStyle.BODIES; body++) {
            for (int extra = 0; extra < AvatarStyle.EXTRAS; extra++) {
                for (int eyes = 0; eyes < AvatarStyle.EYES; eyes++) {
                    String svg = Avatar.svg(new AvatarStyle(body, body, eyes, extra % 4, extra, eyes % 2));
                    factory.newDocumentBuilder().parse(new java.io.ByteArrayInputStream(
                            svg.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
                }
            }
        }
    }
}
