package com.iq.anthology.room;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import javax.xml.parsers.DocumentBuilderFactory;
import org.junit.jupiter.api.Test;

class AvatarTest {

    @Test
    void 같은_사람은_언제나_같은_얼굴이다() {
        assertThat(Avatar.svg("감자", 2)).isEqualTo(Avatar.svg("감자", 2));
    }

    @Test
    void 옆자리끼리는_색이_다르다() {
        assertThat(color(Avatar.svg("감자", 1))).isNotEqualTo(color(Avatar.svg("감자", 2)));
    }

    @Test
    void 올바른_SVG이고_닉네임_글자를_담지_않는다() {
        String svg = Avatar.svg("<script>감자</script>", 3);

        assertThat(svg).doesNotContain("script").doesNotContain("감자");
        assertThatCode(() -> DocumentBuilderFactory.newInstance().newDocumentBuilder()
                .parse(new ByteArrayInputStream(svg.getBytes(StandardCharsets.UTF_8))))
                .doesNotThrowAnyException();
    }

    @Test
    void 여러_닉네임이_여러_얼굴로_갈린다() {
        long distinct = java.util.stream.IntStream.range(0, 40)
                .mapToObj(i -> Avatar.svg("사람" + i, 1))
                .distinct()
                .count();

        assertThat(distinct).isGreaterThan(20);
    }

    private static String color(String svg) {
        int start = svg.indexOf("fill=\"#") + 6;
        return svg.substring(start, start + 7);
    }
}
