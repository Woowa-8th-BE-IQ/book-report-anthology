package com.iq.anthology.room;

import static com.iq.anthology.Fixtures.NOW;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.iq.anthology.support.ErrorType;
import org.junit.jupiter.api.Test;

class RoomMessageTest {

    @Test
    void 앞뒤_공백을_다듬어_남긴다() {
        assertThat(RoomMessage.say(1L, 10L, "  반가워요  ", NOW).body()).isEqualTo("반가워요");
    }

    @Test
    void 빈_말은_보낼_수_없다() {
        assertThatThrownBy(() -> RoomMessage.say(1L, 10L, "   ", NOW))
                .extracting("type").isEqualTo(ErrorType.RULE_VIOLATION);
    }

    @Test
    void 오백자를_넘으면_보낼_수_없다() {
        assertThatThrownBy(() -> RoomMessage.say(1L, 10L, "가".repeat(RoomMessage.BODY_MAX + 1), NOW))
                .extracting("type").isEqualTo(ErrorType.RULE_VIOLATION);
    }
}
